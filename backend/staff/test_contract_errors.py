from datetime import date, timedelta
from io import BytesIO, StringIO
from unittest.mock import patch
from uuid import uuid4

from django.core.files.uploadedfile import SimpleUploadedFile
from django.core.management import call_command
from django.test import Client, TestCase
from django.utils import timezone
from PIL import Image

from accounts.models import Organisation, User
from accounts.staff_sessions import VERIFIED
from ops.models import ClusterWarning
from publicdata.models import Snapshot
from rumours.models import Claim
from security.models import Alert

from .audit import record
from .models import AuditEvent
from .test_support import bind_staff_session


def signed_in(role, *, organisation=None, csrf=False, email=None):
    user = User.objects.create_user(email or f"{uuid4().hex[:10]}@example.org", role=role)
    if organisation is not None:
        user.organisation = organisation
        user.save()
    client = Client(enforce_csrf_checks=csrf)
    client.force_login(user)
    session = client.session
    session[VERIFIED] = True
    session.save()
    bind_staff_session(session, user)
    return user, client


def send(client, method, path, body=None, *, key=True, **extra):
    headers = {"HTTP_IDEMPOTENCY_KEY": str(uuid4())} if key is True else ({"HTTP_IDEMPOTENCY_KEY": key} if key else {})
    if method == "get":
        return client.get(path, **extra)
    return getattr(client, method)(path, body or {}, content_type="application/json", **headers)


def code_of(response):
    return response.json()["error"]["code"]


def field_code(response, name):
    return response.json()["error"]["fields"][name]["code"]


def jpeg(size=(4, 4)):
    buffer = BytesIO()
    Image.new("RGB", size).save(buffer, format="JPEG")
    return buffer.getvalue()


class TwoOrganisations(TestCase):
    def setUp(self):
        self.user, self.client = signed_in("coordinator")
        self.other_org = Organisation.objects.create(name="Other programme")
        self.other, self.other_client = signed_in("coordinator", organisation=self.other_org)


class RumourErrorTests(TwoOrganisations):
    url = "/api/v1/rumours/claims"
    base = {"text": "Thugs near the unit", "seen_on": "whatsapp", "language": "en"}

    def create(self, client=None, **overrides):
        return send(client or self.client, "post", self.url, {**self.base, **overrides})

    def draft(self, claim, text="Observers are checking this claim.", version=0, client=None):
        return send(client or self.client, "put", f'{self.url}/{claim["id"]}/response',
                    {"text": text, "language": "en", "version": version}, key=False)

    def test_only_coordinators_and_signed_in_staff(self):
        for role in ("org_admin", "reviewer"):
            _, client = signed_in(role)
            self.assertEqual(client.get(self.url).status_code, 403, role)
            self.assertEqual(code_of(self.create(client)), "forbidden")
        self.assertEqual(Client().get(self.url).status_code, 401)

    def test_create_validation(self):
        cases = [
            ({"text": ""}, "text", "required"), ({"text": "x" * 4001}, "text", "invalid"),
            ({"seen_on": "carrier_pigeon"}, "seen_on", "invalid_choice"),
            ({"language": "xx"}, "language", "invalid_choice"),
            ({"seen_at": "yesterday"}, "seen_at", "invalid_datetime"),
            ({"area": {"state_code": "ZZ"}}, "area", "invalid"),
        ]
        for overrides, name, code in cases:
            with self.subTest(name=name, code=code):
                response = self.create(**overrides)
                self.assertEqual(response.status_code, 422)
                self.assertEqual(field_code(response, name), code)
        self.assertEqual(code_of(send(self.client, "post", self.url, self.base, key=False)), "idempotency_key_required")

    def test_create_replay_and_key_reuse(self):
        key = str(uuid4())
        first = send(self.client, "post", self.url, self.base, key=key)
        again = send(self.client, "post", self.url, self.base, key=key)
        self.assertEqual((first.status_code, again.status_code), (201, 200))
        self.assertEqual(again["Idempotent-Replayed"], "true")
        reused = send(self.client, "post", self.url, {**self.base, "text": "Different text"}, key=key)
        self.assertEqual(code_of(reused), "idempotency_key_reused")
        self.assertEqual(Claim.objects.count(), 1)

    def test_create_requires_csrf(self):
        _, client = signed_in("coordinator", csrf=True)
        self.assertEqual(code_of(self.create(client)), "csrf_failed")

    def test_create_rate_limit(self):
        with patch("rumours.views.rate_limit", return_value=30):
            response = self.create()
        self.assertEqual(code_of(response), "rate_limited")
        self.assertEqual(response.status_code, 429)

    def test_known_area_is_named_from_the_reference_data(self):
        from io import StringIO

        from django.core.management import call_command

        call_command("load_reference_areas", stdout=StringIO())
        created = self.create(area={"state_code": "SYN-KN", "lga_code": "SYN-KN-01"})
        self.assertEqual(created.status_code, 201, created.content)
        self.assertEqual(created.json()["area"]["lga_name"], "Fictional LGA 1")
        self.assertEqual(created.json()["area"]["state_name"], "Synthetic Kano")

    def test_image_errors(self):
        def upload(content, name="x.jpg", kind="image/jpeg"):
            return self.client.post(self.url, {
                "seen_on": "whatsapp", "language": "en",
                "image": SimpleUploadedFile(name, content, content_type=kind),
            }, HTTP_IDEMPOTENCY_KEY=str(uuid4()))

        self.assertEqual(upload(b"not an image").status_code, 415)
        self.assertEqual(upload(b"0" * (5 * 1024 * 1024 + 1)).status_code, 413)
        gif = BytesIO()
        Image.new("RGB", (2, 2)).save(gif, format="GIF")
        self.assertEqual(upload(gif.getvalue(), "x.gif", "image/gif").status_code, 415)
        ok = upload(jpeg())
        self.assertEqual(ok.status_code, 201)
        self.assertEqual(ok.json()["image"]["width"], 4)
        self.assertIsNotNone(ok.json()["image_check"])

    def test_list_filters_and_paging(self):
        for index in range(3):
            self.create(text=f"Claim number {index}")
        self.assertEqual(self.client.get(self.url, {"status": "bogus"}).status_code, 422)
        self.assertEqual(self.client.get(self.url, {"harm": "bogus"}).status_code, 422)
        self.assertEqual(self.client.get(self.url, {"language": "xx"}).status_code, 422)
        self.assertEqual(self.client.get(self.url, {"cursor": "junk"}).status_code, 422)
        first = self.client.get(self.url, {"limit": 2}).json()
        self.assertEqual(len(first["items"]), 2)
        second = self.client.get(self.url, {"limit": 2, "cursor": first["next_cursor"]}).json()
        self.assertEqual(len(second["items"]), 1)
        self.assertIsNone(second["next_cursor"])
        self.assertEqual(self.other_client.get(self.url).json()["items"], [])

    def test_organisation_separation_returns_404(self):
        claim = self.create().json()
        base = f'{self.url}/{claim["id"]}'
        for method, path, body in (
            ("get", base, None), ("get", base + "/matches", None),
            ("put", base + "/response", {"text": "x", "language": "en", "version": 0}),
            ("post", base + "/response/approve", {"version": 0}),
            ("post", base + "/response/reject", {"note": "no", "version": 0}),
            ("post", base + "/dismiss", {"note": "no", "version": 0}),
        ):
            with self.subTest(path=path):
                self.assertEqual(send(self.other_client, method, path, body).status_code, 404)

    def test_response_state_machine(self):
        claim = self.create().json()
        base = f'{self.url}/{claim["id"]}'
        approve = base + "/response/approve"
        self.assertEqual(code_of(send(self.client, "post", approve, {"version": 0})), "invalid_transition")
        self.assertEqual(self.draft(claim, version=7).status_code, 409)
        self.assertEqual(self.draft(claim, text="").status_code, 422)
        self.assertEqual(self.draft(claim, text="x" * 1501).status_code, 422)
        bad_language = send(self.client, "put", base + "/response", {"text": "ok", "language": "xx", "version": 0}, key=False)
        self.assertEqual(bad_language.status_code, 422)
        saved = self.draft(claim).json()
        self.assertEqual((saved["status"], saved["version"]), ("response_draft", 1))
        self.assertEqual(code_of(send(self.client, "post", approve, {"version": 1})), "same_person_approval")
        self.assertEqual(code_of(send(self.client, "post", approve, {"version": 0})), "stale_version")
        approver, approver_client = signed_in("coordinator")
        approved = send(approver_client, "post", approve, {"version": 1})
        self.assertEqual(approved.json()["status"], "response_approved")
        self.assertIsNotNone(approved.json()["response"]["approved_at"])
        again = self.draft(claim, text="A revised response.", version=2).json()
        self.assertEqual(again["status"], "response_draft")
        self.assertIsNone(again["response"]["approved_by"])
        # approval is checked against the last person who saved the draft
        changed = self.draft(claim, text="Edited by the approver.", version=3, client=approver_client).json()
        self.assertEqual(changed["status"], "response_draft")
        self.assertEqual(code_of(send(approver_client, "post", approve, {"version": 4})), "same_person_approval")
        self.assertEqual(send(self.client, "post", approve, {"version": 4}).status_code, 200)

    def test_reject_and_dismiss_need_a_note(self):
        claim = self.create().json()
        base = f'{self.url}/{claim["id"]}'
        self.draft(claim)
        reject = base + "/response/reject"
        self.assertEqual(send(self.client, "post", reject, {"version": 1}).status_code, 422)
        self.assertEqual(send(self.client, "post", reject, {"note": "x" * 501, "version": 1}).status_code, 422)
        rejected = send(self.client, "post", reject, {"note": "Not accurate", "version": 1}).json()
        self.assertEqual(rejected["response"]["rejection_note"], "Not accurate")
        dismiss = base + "/dismiss"
        self.assertEqual(send(self.client, "post", dismiss, {"version": 2}, key=False).status_code, 422)
        dismissed = send(self.client, "post", dismiss, {"note": "Old rumour", "version": 2}, key=False)
        self.assertEqual(dismissed.json()["status"], "dismissed")
        self.assertEqual(code_of(self.draft(claim, version=3)), "invalid_transition")

    def test_matches_use_only_closed_reports_with_an_outcome(self):
        from reports.models import Report, ReviewEvent

        def report(status, outcome, text):
            item = Report.objects.create(
                observer=self.user, submission_key=uuid4(), description=text, redacted_description=text,
                status=status, occurred_at=timezone.now(),
                incident_details={"category": "intimidation_violence", "language": "en"},
            )
            if outcome:
                ReviewEvent.objects.create(
                    report=item, actor=self.user, action=ReviewEvent.Action.CLOSE, version=1,
                    change={"outcome": outcome},
                )
            return item

        closed = report(Report.Status.CLOSED, "corroborated", "Young men threatening voters near the gate")
        report(Report.Status.CLOSED, None, "Young men threatening voters near the gate without outcome")
        report(Report.Status.SUBMITTED, None, "Young men threatening voters near the gate still open")
        claim = self.create(text="Young men are threatening voters near the gate").json()
        body = self.client.get(f'{self.url}/{claim["id"]}/matches').json()
        self.assertEqual([item["report_id"] for item in body["observations"]], [str(closed.pk)])
        item = body["observations"][0]
        self.assertTrue(len(item["excerpt"]) <= 280)
        self.assertEqual(set(item) & {"receipt_code", "observer_code", "media", "observer"}, set())


class PublishErrorTests(TwoOrganisations):
    url = "/api/v1/publish/snapshots"

    def test_roles_and_separation(self):
        for role in ("org_admin", "reviewer"):
            _, client = signed_in(role)
            self.assertEqual(client.get(self.url).status_code, 403, role)
            self.assertEqual(send(client, "post", self.url, {}).status_code, 403, role)
            self.assertEqual(send(client, "put", "/api/v1/publish/schedule", {"hourly": True, "version": 0}).status_code, 403)
        created = send(self.client, "post", self.url, {})
        self.assertEqual(created.status_code, 201)
        snapshot_id = created.json()["id"]
        self.assertEqual(self.other_client.get(f"{self.url}/{snapshot_id}").status_code, 404)
        for action in ("approve", "discard"):
            response = send(self.other_client, "post", f"{self.url}/{snapshot_id}/{action}", {"version": 0})
            self.assertEqual(response.status_code, 404)
        self.assertEqual(self.other_client.get(self.url).json()["items"], [])

    def test_create_cutoff_validation(self):
        too_recent = timezone.now().astimezone().isoformat()
        response = send(self.client, "post", self.url, {"cutoff": too_recent})
        self.assertEqual((response.status_code, field_code(response, "cutoff")), (422, "too_recent"))
        self.assertIn("60 minutes", response.json()["error"]["fields"]["cutoff"]["message"])
        for bad in ("tomorrow", "2026-12-05T10:00:00", 12):
            self.assertEqual(field_code(send(self.client, "post", self.url, {"cutoff": bad}), "cutoff"), "invalid_datetime")
        old = (timezone.now() - timedelta(hours=3)).astimezone().isoformat()
        self.assertEqual(send(self.client, "post", self.url, {"cutoff": old}).status_code, 201)
        self.assertEqual(code_of(send(self.client, "post", self.url, {}, key=False)), "idempotency_key_required")

    def test_create_requires_csrf_and_replays(self):
        _, client = signed_in("coordinator", csrf=True)
        self.assertEqual(code_of(send(client, "post", self.url, {})), "csrf_failed")
        key = str(uuid4())
        first = send(self.client, "post", self.url, {}, key=key)
        replay = send(self.client, "post", self.url, {}, key=key)
        self.assertEqual(first.json()["id"], replay.json()["id"])
        self.assertEqual(replay["Idempotent-Replayed"], "true")
        self.assertEqual(code_of(send(self.client, "post", self.url, {"cutoff": "2020-01-01T00:00:00+01:00"}, key=key)),
                         "idempotency_key_reused")

    def test_approve_discard_and_transitions(self):
        snapshot = send(self.client, "post", self.url, {}).json()
        path = f'{self.url}/{snapshot["id"]}'
        self.assertEqual(code_of(send(self.client, "post", path + "/approve", {"version": 5})), "stale_version")
        self.assertEqual(send(self.client, "post", path + "/approve", {}).status_code, 422)
        self.assertEqual(send(self.client, "post", path + "/approve", {"version": "0"}).status_code, 422)
        published = send(self.client, "post", path + "/approve", {"version": 0})
        self.assertEqual(published.json()["status"], "published")
        self.assertEqual(code_of(send(self.client, "post", path + "/discard", {"version": 1})), "invalid_transition")
        second = send(self.client, "post", self.url, {}).json()
        discard = send(self.client, "post", f'{self.url}/{second["id"]}/discard', {"version": 0})
        self.assertEqual(discard.json()["status"], "discarded")
        self.assertEqual(
            code_of(send(self.client, "post", f'{self.url}/{second["id"]}/approve', {"version": 1})),
            "invalid_transition",
        )
        third = send(self.client, "post", self.url, {}).json()
        send(self.client, "post", f'{self.url}/{third["id"]}/approve', {"version": 0})
        self.assertEqual(Snapshot.objects.get(pk=snapshot["id"]).status, "superseded")
        self.assertEqual(Snapshot.objects.filter(status="published").count(), 1)

    def test_list_and_schedule_validation(self):
        self.assertEqual(self.client.get(self.url, {"limit": 0}).status_code, 422)
        self.assertEqual(self.client.get(self.url, {"cursor": "junk"}).status_code, 422)
        schedule = "/api/v1/publish/schedule"
        self.assertEqual(send(self.client, "put", schedule, {"hourly": "yes", "version": 0}).status_code, 422)
        self.assertEqual(code_of(send(self.client, "put", schedule, {"hourly": True, "version": 3})), "stale_version")
        ok = send(self.client, "put", schedule, {"hourly": True, "version": 0})
        self.assertEqual(ok.json(), {"hourly": True, "version": 1})
        event = AuditEvent.objects.filter(action="update_publish_schedule").get()
        self.assertEqual(event.actor_ref, str(self.user.public_id))

    def test_public_results_are_open_empty_first_and_never_leak(self):
        anonymous = Client()
        empty = anonymous.get("/api/v1/public/results")
        self.assertEqual((empty.status_code, empty.json()["snapshots"]), (200, []))
        self.assertEqual(empty["Cache-Control"], "public, max-age=300")
        self.assertEqual(anonymous.post("/api/v1/public/results").status_code, 405)
        snapshot = send(self.client, "post", self.url, {}).json()
        send(self.client, "post", f'{self.url}/{snapshot["id"]}/approve', {"version": 0})
        live = anonymous.get("/api/v1/public/results")
        self.assertEqual(len(live.json()["snapshots"]), 1)
        self.assertEqual(anonymous.get("/api/v1/public/results", HTTP_IF_NONE_MATCH=live["ETag"]).status_code, 304)
        text = live.content.decode()
        for forbidden in ("ward_code", "polling_unit", "receipt", "observer_code", "description"):
            self.assertNotIn(forbidden, text)


class SecurityErrorTests(TwoOrganisations):
    url = "/api/v1/security/alerts"

    def alert(self, organisation=None, **overrides):
        values = dict(
            organisation=organisation or self.user.organisation, rule="repeated_failed_pins", severity="medium",
            subject_type="observer_code", subject_label="OBS-7K2P9D", details={"failures": 12},
            first_seen_at=timezone.now(), last_seen_at=timezone.now(), detector="rules",
        )
        return Alert.objects.create(**{**values, **overrides})

    def test_roles(self):
        self.alert()
        for role in ("coordinator", "org_admin"):
            _, client = signed_in(role)
            self.assertEqual(client.get(self.url).status_code, 200, role)
        _, reviewer = signed_in("reviewer")
        self.assertEqual(reviewer.get(self.url).status_code, 403)
        self.assertEqual(Client().get(self.url).status_code, 401)

    def test_list_validation_and_filters(self):
        self.alert()
        self.alert(severity="high", status="resolved")
        self.assertEqual(self.client.get(self.url, {"status": "weird"}).status_code, 422)
        self.assertEqual(self.client.get(self.url, {"severity": "weird"}).status_code, 422)
        self.assertEqual(self.client.get(self.url, {"cursor": "junk"}).status_code, 422)
        self.assertEqual(len(self.client.get(self.url).json()["items"]), 1)
        self.assertEqual(len(self.client.get(self.url, {"status": "resolved", "severity": "high"}).json()["items"]), 1)
        self.assertEqual(self.other_client.get(self.url).json()["items"], [])

    def test_update_errors_and_audit(self):
        alert = self.alert()
        path = f"{self.url}/{alert.pk}"
        self.assertEqual(code_of(send(self.client, "post", path, {"status": "resolved", "version": 4})), "stale_version")
        for body in ({"status": "open", "version": 0}, {"status": "bogus", "version": 0}, {"version": 0}):
            self.assertEqual(send(self.client, "post", path, body).status_code, 422)
        self.assertEqual(send(self.client, "post", path, {"status": "resolved"}).status_code, 422)
        self.assertEqual(send(self.client, "post", path, {"status": "resolved", "version": 0, "note": "x" * 501}).status_code, 422)
        self.assertEqual(send(self.other_client, "post", path, {"status": "resolved", "version": 0}).status_code, 404)
        done = send(self.client, "post", path, {"status": "false_positive", "version": 0, "note": "Training run"})
        self.assertEqual((done.status_code, done.json()["version"]), (200, 1))
        self.assertTrue(AuditEvent.objects.filter(action="update_security_alert").exists())
        _, reviewer = signed_in("reviewer")
        self.assertEqual(send(reviewer, "post", path, {"status": "resolved", "version": 1}).status_code, 404)

    def test_details_never_carry_reports_or_addresses(self):
        alert = self.alert(details={"failures": 3})
        item = self.client.get(self.url).json()["items"][0]
        self.assertEqual(item["id"], str(alert.pk))
        self.assertEqual(set(item["subject"]), {"type", "label"})


class AuditErrorTests(TwoOrganisations):
    def test_export_and_verify_roles(self):
        admin, admin_client = signed_in("org_admin")
        record(admin.organisation_id, "test_event", "organisation", admin.organisation_id, actor=admin)
        export = admin_client.get("/api/v1/audit/export", {"format": "jsonl"})
        self.assertEqual(export.status_code, 200)
        self.assertIn("attachment", export["Content-Disposition"])
        self.assertEqual(self.client.get("/api/v1/audit/export").status_code, 403)
        _, reviewer = signed_in("reviewer")
        self.assertEqual(reviewer.get("/api/v1/audit/verify").status_code, 403)
        self.assertEqual(self.client.get("/api/v1/audit/verify").status_code, 200)
        self.assertEqual(admin_client.get("/api/v1/audit/verify").status_code, 200)
        self.assertEqual(Client().get("/api/v1/audit/verify").status_code, 401)

    def test_export_validation_and_content(self):
        admin, client = signed_in("org_admin")
        record(admin.organisation_id, "test_event", "organisation", admin.organisation_id, actor=admin, content={"secret": "x"})
        url = "/api/v1/audit/export"
        for query in ({"format": "xml"}, {"from": "bogus"}, {"from": "2026-01-01", "to": "2026-06-01"},
                      {"from": "2026-02-01", "to": "2026-01-01"}):
            with self.subTest(query=query):
                self.assertEqual(client.get(url, query).status_code, 422)
        csv_body = b"".join(client.get(url, {"format": "csv"}).streaming_content).decode()
        self.assertIn("content_digest", csv_body.splitlines()[0])
        self.assertNotIn("secret", csv_body)
        self.assertTrue(AuditEvent.objects.filter(action="export_audit").exists() or "export" in " ".join(
            AuditEvent.objects.values_list("action", flat=True)))

    def test_verify_reports_the_first_broken_event(self):
        admin, client = signed_in("org_admin")
        for index in range(3):
            record(admin.organisation_id, f"event_{index}", "organisation", admin.organisation_id)
        clean = client.get("/api/v1/audit/verify").json()
        self.assertTrue(clean["intact"])
        self.assertIsNone(clean["first_broken_event_id"])
        broken = AuditEvent.objects.filter(organisation_id=admin.organisation_id).order_by("sequence")[1]
        AuditEvent.objects.filter(pk=broken.pk).update(action="tampered")
        result = client.get("/api/v1/audit/verify").json()
        self.assertFalse(result["intact"])
        self.assertEqual(result["first_broken_event_id"], str(broken.pk))

    def test_chains_are_per_organisation(self):
        record(self.user.organisation_id, "one", "x")
        record(self.other_org.pk, "two", "x")
        mine = self.client.get("/api/v1/audit/verify").json()
        theirs = self.other_client.get("/api/v1/audit/verify").json()
        self.assertNotEqual(mine["head"]["hash"], theirs["head"]["hash"])


class CodeErrorTests(TwoOrganisations):
    def setUp(self):
        super().setUp()
        self.admin, self.admin_client = signed_in("org_admin")
        self.batches = "/api/v1/admin/code-batches"

    def make(self, count=2, label="Training"):
        return send(self.admin_client, "post", self.batches, {"label": label, "count": count})

    def test_only_org_admins(self):
        for client in (self.client, signed_in("reviewer")[1]):
            self.assertEqual(client.get(self.batches).status_code, 403)
            self.assertEqual(send(client, "post", self.batches, {"label": "x", "count": 1}).status_code, 403)
            self.assertEqual(client.get("/api/v1/admin/codes").status_code, 403)

    def test_create_validation_replay_and_cache(self):
        for body in ({"label": "", "count": 1}, {"label": "x" * 81, "count": 1}, {"label": "x", "count": 0},
                     {"label": "x", "count": 501}, {"label": "x", "count": "5"}, {"count": 1}):
            self.assertEqual(send(self.admin_client, "post", self.batches, body).status_code, 422, body)
        key = str(uuid4())
        first = send(self.admin_client, "post", self.batches, {"label": "Kano", "count": 2}, key=key)
        again = send(self.admin_client, "post", self.batches, {"label": "Kano", "count": 2}, key=key)
        self.assertEqual(first.status_code, 201)
        self.assertEqual(again["Idempotent-Replayed"], "true")
        self.assertEqual(first.json()["cards"], again.json()["cards"])
        self.assertIn("no-store", first["Cache-Control"])
        self.assertEqual(len(first.json()["cards"][0]["setup_pin"]), 8)
        reused = send(self.admin_client, "post", self.batches, {"label": "Kano", "count": 3}, key=key)
        self.assertEqual(code_of(reused), "idempotency_key_reused")

    def test_daily_limit(self):
        from zoneinfo import ZoneInfo

        from .models import CodeIssuance

        today = timezone.now().astimezone(ZoneInfo("Africa/Lagos")).date()
        CodeIssuance.objects.create(organisation=self.admin.organisation, day=today, count=1999)
        over = self.make(2)
        self.assertEqual((over.status_code, code_of(over)), (429, "rate_limited"))
        self.assertIn("Retry-After", over)
        self.assertEqual(self.make(1).status_code, 201)
        self.assertEqual(self.make(1).status_code, 429)

    def test_print_data_needs_confirmation_and_reissues_pins(self):
        batch = self.make().json()
        path = f'{self.batches}/{batch["batch"]["id"]}/print-data'
        self.assertEqual(code_of(send(self.admin_client, "post", path, {})), "confirmation_required")
        self.assertEqual(code_of(send(self.admin_client, "post", path, {"confirm_reset_setup_pins": False})),
                         "confirmation_required")
        printed = send(self.admin_client, "post", path, {"confirm_reset_setup_pins": True})
        self.assertEqual(printed.status_code, 200)
        old = {card["observer_code"]: card["setup_pin"] for card in batch["cards"]}
        new = {card["observer_code"]: card["setup_pin"] for card in printed.json()["cards"]}
        self.assertEqual(old.keys(), new.keys())
        self.assertTrue(all(old[code] != new[code] for code in old))
        self.assertIsNotNone(self.admin_client.get(self.batches).json()["items"][0]["printed_at"])
        self.assertEqual(send(self.admin_client, "post", f"{self.batches}/{uuid4()}/print-data",
                              {"confirm_reset_setup_pins": True}).status_code, 404)

    def test_code_list_filters(self):
        batch = self.make(3).json()
        url = "/api/v1/admin/codes"
        listing = self.admin_client.get(url, {"batch_id": batch["batch"]["id"]}).json()
        self.assertEqual(len(listing["items"]), 3)
        self.assertEqual(set(listing["items"][0]) & {"reports", "report_count", "setup_pin"}, set())
        self.assertEqual(self.admin_client.get(url, {"status": "weird"}).status_code, 422)
        self.assertEqual(self.admin_client.get(url, {"batch_id": "nope"}).status_code, 422)
        self.assertEqual(self.admin_client.get(url, {"status": "revoked"}).json()["items"], [])
        code = batch["cards"][0]["observer_code"]
        self.assertEqual(len(self.admin_client.get(url, {"q": code}).json()["items"]), 1)

    def test_revoke_reissue_reset_pin_transitions(self):
        cards = self.make(3).json()["cards"]
        first, second, third = (card["observer_code"] for card in cards)
        base = "/api/v1/admin/codes"
        self.assertEqual(send(self.admin_client, "post", f"{base}/{first}/revoke", {"reason": "bogus"}).status_code, 422)
        revoked = send(self.admin_client, "post", f"{base}/{first}/revoke", {"reason": "lost_phone"})
        self.assertEqual(revoked.json()["status"], "revoked")
        self.assertIn("sessions_ended", revoked.json())
        self.assertEqual(code_of(send(self.admin_client, "post", f"{base}/{first}/revoke", {"reason": "lost_phone"})),
                         "invalid_transition")
        self.assertEqual(code_of(send(self.admin_client, "post", f"{base}/{first}/reset-pin", {})), "invalid_transition")
        self.assertEqual(code_of(send(self.admin_client, "post", f"{base}/{first}/reissue", {"reason": "lost_phone"})),
                         "invalid_transition")
        reissued = send(self.admin_client, "post", f"{base}/{second}/reissue", {"reason": "left_programme"}).json()
        self.assertEqual(reissued["revoked"], second)
        self.assertNotEqual(reissued["card"]["observer_code"], second)
        reset = send(self.admin_client, "post", f"{base}/{third}/reset-pin", {}).json()
        self.assertEqual(reset["card"]["observer_code"], third)
        self.assertNotEqual(reset["card"]["setup_pin"], cards[2]["setup_pin"])
        self.assertEqual(send(self.admin_client, "post", f"{base}/OBS-ZZZZZZ/revoke", {"reason": "other"}).status_code, 404)
        self.assertEqual(AuditEvent.objects.filter(action__contains="code").count() >= 3, True)

    def test_other_organisation_cannot_touch_codes(self):
        card = self.make(1).json()["cards"][0]["observer_code"]
        _, other_admin = signed_in("org_admin", organisation=self.other_org)
        for operation, body in (("revoke", {"reason": "other"}), ("reissue", {"reason": "other"}), ("reset-pin", {})):
            self.assertEqual(send(other_admin, "post", f"/api/v1/admin/codes/{card}/{operation}", body).status_code, 404)
        self.assertEqual(other_admin.get("/api/v1/admin/codes").json()["items"], [])


class SettingsErrorTests(TwoOrganisations):
    url = "/api/v1/admin/settings"

    def setUp(self):
        super().setUp()
        self.admin, self.admin_client = signed_in("org_admin")

    def patch(self, body, client=None):
        return (client or self.admin_client).patch(self.url, body, content_type="application/json")

    def test_roles(self):
        for client in (self.client, signed_in("reviewer")[1]):
            self.assertEqual(client.get(self.url).status_code, 403)
            self.assertEqual(self.patch({"intake_paused": True, "version": 0}, client).status_code, 403)

    def test_validation_and_limits(self):
        shape = self.admin_client.get(self.url).json()
        for key in ("version", "intake_paused", "retention_days", "election_day", "public_delay_minutes",
                    "party_labels", "coverage_area", "simulator_enabled", "updated_by", "updated_at"):
            self.assertIn(key, shape)
        bad = [
            {"retention_days": 29}, {"retention_days": 731}, {"retention_days": "90"},
            {"public_delay_minutes": 59}, {"public_delay_minutes": 1441},
            {"party_labels": ["A"]}, {"party_labels": ["a", "b"]}, {"party_labels": ["AAAA", "B"]},
            {"party_labels": list("ABCDEFGHIJKLM")}, {"intake_paused": "yes"}, {"election_day": "soon"},
            {"coverage_area": {"state_codes": ["ZZ"], "lga_codes": []}},
        ]
        for body in bad:
            with self.subTest(body=body):
                self.assertEqual(self.patch({**body, "version": 0, "confirm": True}).status_code, 422)
        self.assertEqual(self.patch({"intake_paused": True}).status_code, 422)

    def test_version_confirmation_and_effects(self):
        self.assertEqual(code_of(self.patch({"intake_paused": True, "version": 3})), "stale_version")
        confirm = self.patch({"retention_days": 30, "version": 0})
        self.assertEqual((confirm.status_code, code_of(confirm)), (409, "confirmation_required"))
        self.assertIn("permanently delete", confirm.json()["error"]["message"])
        done = self.patch({"retention_days": 30, "version": 0, "confirm": True, "public_delay_minutes": 120})
        self.assertEqual((done.status_code, done.json()["version"]), (200, 1))
        self.assertEqual(done.json()["public_delay_minutes"], 120)
        self.assertEqual(self.patch({"retention_days": 90, "version": 1}).status_code, 200)
        self.assertTrue(AuditEvent.objects.filter(action__contains="settings").exists())
        self.assertEqual(self.client.get("/api/v1/auth/me").status_code, 200)

    def test_settings_are_per_organisation(self):
        _, other_admin = signed_in("org_admin", organisation=self.other_org)
        self.assertEqual(self.patch({"intake_paused": True, "version": 0}).status_code, 200)
        self.assertFalse(other_admin.get(self.url).json()["intake_paused"])

    def test_election_day_and_party_labels_change(self):
        ok = self.patch({"election_day": date(2026, 12, 5).isoformat(), "party_labels": ["A", "B", "C"], "version": 0})
        self.assertEqual(ok.status_code, 200)
        self.assertEqual(ok.json()["party_labels"], ["A", "B", "C"])
        self.assertEqual(ok.json()["election_day"], "2026-12-05")


class OperationsErrorTests(TwoOrganisations):
    def warning(self, organisation=None, **overrides):
        values = dict(
            organisation=organisation or self.user.organisation, category="intimidation_violence",
            area={"state_code": "KN", "state_name": "Kano", "lga_code": "KN-04", "lga_name": "Dala"},
            lga_code="KN-04", report_ids=[str(uuid4()) for _ in range(5)], baseline=0.8,
            window_start=timezone.now() - timedelta(hours=1), window_end=timezone.now(),
        )
        return ClusterWarning.objects.create(**{**values, **overrides})

    def test_roles(self):
        for path in ("/api/v1/ops/clusters", "/api/v1/ops/cluster-settings", "/api/v1/ops/coverage"):
            for role in ("org_admin", "reviewer"):
                _, client = signed_in(role)
                self.assertEqual(client.get(path).status_code, 403, (path, role))
            self.assertEqual(Client().get(path).status_code, 401)

    def test_cluster_list_review_and_separation(self):
        warning = self.warning()
        url = "/api/v1/ops/clusters"
        self.assertEqual(self.client.get(url, {"status": "weird"}).status_code, 422)
        self.assertEqual(self.client.get(url, {"cursor": "junk"}).status_code, 422)
        listing = self.client.get(url).json()
        self.assertEqual([item["id"] for item in listing["items"]], [str(warning.pk)])
        self.assertEqual(listing["items"][0]["report_count"], 5)
        self.assertEqual(self.other_client.get(url).json()["items"], [])
        path = f"{url}/{warning.pk}/review"
        self.assertEqual(send(self.other_client, "post", path, {}).status_code, 404)
        self.assertEqual(send(self.client, "post", path, {"note": "x" * 501}).status_code, 422)
        first = send(self.client, "post", path, {"note": "Looked at it"}).json()
        again = send(self.client, "post", path, {}).json()
        self.assertEqual((first["status"], again["status"], first["reviewed_at"]), ("reviewed", "reviewed", again["reviewed_at"]))
        self.assertEqual(len(self.client.get(url, {"status": "reviewed"}).json()["items"]), 1)
        self.assertEqual(self.client.get(url).json()["items"], [])
        self.assertEqual(AuditEvent.objects.filter(action="review_cluster_warning").count(), 1)

    def test_cluster_settings(self):
        url = "/api/v1/ops/cluster-settings"
        current = self.client.get(url).json()
        body = {"window_minutes": 90, "min_reports": 4, "categories": ["intimidation_violence"],
                "version": current["version"]}
        self.assertEqual(self.client.put(url, body, content_type="application/json").status_code, 200)
        for key, value in (("window_minutes", 14), ("window_minutes", 361), ("min_reports", 2), ("min_reports", 51),
                           ("categories", []), ("categories", ["nonsense"]), ("window_minutes", "60")):
            bad = self.client.put(url, {**body, "version": 1, key: value}, content_type="application/json")
            self.assertEqual(bad.status_code, 422, (key, value))
        stale = self.client.put(url, {**body, "version": 0}, content_type="application/json")
        self.assertEqual(code_of(stale), "stale_version")
        self.assertEqual(self.other_client.get(url).json()["window_minutes"], current["window_minutes"])

    def test_coverage_validation(self):
        url = "/api/v1/ops/coverage"
        self.assertEqual(self.client.get(url, {"date": "05/12/2026"}).status_code, 422)
        self.assertEqual(self.client.get(url, {"stage": "lunch"}).status_code, 422)
        self.assertEqual(self.client.get(url, {"lga_code": "NOPE"}).status_code, 422)
        self.assertEqual(self.client.get(url, {"limit": 0}).status_code, 422)
        self.assertEqual(self.client.get(url, {"cursor": "junk"}).status_code, 422)
        ok = self.client.get(url, {"date": "2026-12-05", "stage": "opening"})
        self.assertEqual(ok.status_code, 200)
        self.assertEqual(set(ok.json()), {"date", "stage", "as_of", "rows", "most_no_answers", "next_cursor"})


from unittest import skipUnless  # noqa: E402

from ops.observations import STRUCTURED  # noqa: E402
from reports.models import Report  # noqa: E402


@skipUnless(STRUCTURED, "checklist reports need the observer extras")
class CoverageChecklistTests(TwoOrganisations):
    def checklist(self, unit, answers, supersedes=None):
        details = {"stage": "opening", "answers": answers, "note": None}
        if supersedes:
            details["supersedes"] = str(supersedes)
        return Report.objects.create(
            observer=self.user, submission_key=uuid4(), description="", kind="checklist",
            polling_unit_code=unit, occurred_at=timezone.now(), structured_details=details,
        )

    def test_counts_use_latest_checklist_and_no_answers(self):
        from reference.models import AreaDataset

        call_command("load_reference_areas", stdout=StringIO())
        release = AreaDataset.objects.first()
        state_code, state = next(iter(release.states.items()))
        lga = state["lgas"][0]
        unit = lga["wards"][0]["units"][0][0]
        organisation = self.user.organisation
        organisation.coverage_state_codes = [state_code]
        organisation.save()
        first = self.checklist(unit, [{"question": "opened_on_time", "answer": "no"}])
        self.checklist(unit, [{"question": "opened_on_time", "answer": "yes"}], supersedes=first.pk)
        today = timezone.now().astimezone().date().isoformat()
        body = self.client.get("/api/v1/ops/coverage", {"date": today, "stage": "opening"}).json()
        row = next(item for item in body["rows"] if item["lga_code"] == lga["lga_code"])
        self.assertEqual(row["lga_name"], lga["name"])
        self.assertEqual((row["units_with_checklist"], row["no_answers"]), (1, 0))
