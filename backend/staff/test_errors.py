from datetime import timedelta
from uuid import uuid4
from zoneinfo import ZoneInfo

from django.test import Client, TestCase, override_settings
from django.utils import timezone

from accounts.models import Organisation, User
from accounts.observer_credentials import digest
from accounts.staff_auth import totp
from ops.models import LateMaterialsRun
from reports.models import Report
from security.detectors import notice

from .audit import record
from .models import AuditEvent, CodeIssuance
from .test_permissions import signed_in


def send(client, method, path, body=None, *, key=True):
    headers = {"HTTP_IDEMPOTENCY_KEY": str(uuid4())} if key else {}
    if method == "get":
        return client.get(path)
    return getattr(client, method)(path, body or {}, content_type="application/json", **headers)


def code_of(response):
    return response.json()["error"]["code"]


class AdminErrorTests(TestCase):
    def setUp(self):
        self.admin, self.client = signed_in("org_admin")

    def invite(self, **overrides):
        body = {"email": f"{uuid4().hex[:8]}@example.org", "display_name": "Ada Reviewer", "roles": ["reviewer"]}
        return send(self.client, "post", "/api/v1/admin/staff", {**body, **overrides})

    def test_invite_validation_and_duplicates(self):
        first = self.invite(email="dup@example.org")
        self.assertEqual(first.status_code, 201)
        duplicate = self.invite(email="DUP@example.org")
        self.assertEqual(duplicate.status_code, 422)
        self.assertEqual(duplicate.json()["error"]["fields"]["email"]["code"], "duplicate")
        for field, value in (("email", "nope"), ("display_name", "A"), ("roles", []),
                             ("roles", ["org_admin", "reviewer"]), ("roles", ["pilot"])):
            with self.subTest(field=field, value=value):
                response = self.invite(**{field: value})
                self.assertEqual(response.status_code, 422)
                self.assertIn(field, response.json()["error"]["fields"])
        self.assertEqual(send(self.client, "post", "/api/v1/admin/staff", {}, key=False).status_code, 400)

    def test_invite_key_reuse_with_other_body(self):
        key = str(uuid4())
        body = {"email": "one@example.org", "display_name": "Ada Reviewer", "roles": ["reviewer"]}
        path = "/api/v1/admin/staff"
        self.client.post(path, body, content_type="application/json", HTTP_IDEMPOTENCY_KEY=key)
        again = self.client.post(path, {**body, "email": "two@example.org"},
                                 content_type="application/json", HTTP_IDEMPOTENCY_KEY=key)
        self.assertEqual(code_of(again), "idempotency_key_reused")

    def test_staff_writes_check_version_scope_and_self(self):
        member = User.objects.get(email=self.invite().json()["staff"]["email"])
        base = f"/api/v1/admin/staff/{member.public_id}"
        stale = send(self.client, "post", base + "/reset-2fa", {"version": 9}, key=False)
        self.assertEqual(code_of(stale), "stale_version")
        self.assertEqual(send(self.client, "post", base + "/reset-2fa", {}, key=False).status_code, 422)
        unknown = send(self.client, "post", f"/api/v1/admin/staff/{uuid4()}/reset-2fa", {"version": 0}, key=False)
        self.assertEqual(unknown.status_code, 404)
        own = f"/api/v1/admin/staff/{self.admin.public_id}/offboard"
        refused = send(self.client, "post", own, {"version": 0, "reason": "access_ended"}, key=False)
        self.assertEqual(refused.status_code, 403)
        bad = send(self.client, "post", base + "/offboard", {"version": 0, "reason": "bored"}, key=False)
        self.assertEqual(bad.status_code, 422)
        done = send(self.client, "post", base + "/offboard", {"version": 0, "reason": "credential_risk"}, key=False)
        self.assertEqual(done.status_code, 200)
        again = send(self.client, "post", base + "/offboard", {"version": 1, "reason": "credential_risk"}, key=False)
        self.assertEqual(code_of(again), "invalid_transition")

    def test_last_admin_cannot_be_offboarded_by_another_admin(self):
        other, _ = signed_in("org_admin")
        self.admin.staff_invite_digest = "x" * 64
        self.admin.save()
        path = f"/api/v1/admin/staff/{other.public_id}/offboard"
        # the only other active admin is the target, so removing it would leave none
        response = send(self.client, "post", path, {"version": 0, "reason": "access_ended"}, key=False)
        self.assertEqual(code_of(response), "last_admin")

    def test_reset_2fa_clears_secret_and_ends_sessions(self):
        member, session_client = signed_in("reviewer", totp_secret="JBSWY3DPEHPK3PXP")
        self.assertTrue(session_client.get("/api/v1/auth/me").json()["authenticated"])
        path = f"/api/v1/admin/staff/{member.public_id}/reset-2fa"
        self.assertEqual(send(self.client, "post", path, {"version": 0}, key=False).status_code, 200)
        member.refresh_from_db()
        self.assertEqual(member.totp_secret, "")
        self.assertFalse(session_client.get("/api/v1/auth/me").json()["authenticated"])

    def test_settings_validation_version_and_confirmation(self):
        url = "/api/v1/admin/settings"
        self.assertEqual(self.client.get(url).json()["version"], 0)

        def patch(body):
            return self.client.patch(url, body, content_type="application/json")

        self.assertEqual(patch({"retention_days": 10, "version": 0}).status_code, 422)
        self.assertEqual(patch({"retention_days": 90}).status_code, 422)
        self.assertEqual(patch({"party_labels": ["A"], "version": 0}).status_code, 422)
        self.assertEqual(patch({"public_delay_minutes": 5, "version": 0}).status_code, 422)
        self.assertEqual(code_of(patch({"intake_paused": True, "version": 4})), "stale_version")
        self.assertEqual(code_of(patch({"retention_days": 30, "version": 0})), "confirmation_required")
        ok = patch({"retention_days": 30, "version": 0, "confirm": True, "intake_paused": True})
        self.assertEqual(ok.status_code, 200)
        self.assertEqual(ok.json()["version"], 1)
        self.assertTrue(ok.json()["intake_paused"])
        self.assertFalse(self.client.get("/api/v1/auth/me").json()["citizen_intake_open"])

    def test_code_batch_limits_and_card_errors(self):
        batches = "/api/v1/admin/code-batches"
        for body in ({"label": "", "count": 1}, {"label": "x", "count": 0}, {"label": "x", "count": 501},
                     {"label": "x", "count": "5"}):
            with self.subTest(body=body):
                self.assertEqual(send(self.client, "post", batches, body).status_code, 422)
        created = send(self.client, "post", batches, {"label": "Training", "count": 2})
        batch = created.json()["batch"]["id"]
        old = created.json()["cards"][0]
        no_confirm = send(self.client, "post", f"{batches}/{batch}/print-data", {}, key=False)
        self.assertEqual(code_of(no_confirm), "confirmation_required")
        printed = send(self.client, "post", f"{batches}/{batch}/print-data",
                       {"confirm_reset_setup_pins": True}, key=False)
        pins = {c["observer_code"]: c["setup_pin"] for c in printed.json()["cards"]}
        self.assertEqual(len(pins), 2)
        self.assertNotEqual(pins[old["observer_code"]], old["setup_pin"])
        missing = send(self.client, "post", f"{batches}/{uuid4()}/print-data",
                       {"confirm_reset_setup_pins": True}, key=False)
        self.assertEqual(missing.status_code, 404)
        code = old["observer_code"]
        revoke = f"/api/v1/admin/codes/{code}/revoke"
        self.assertEqual(send(self.client, "post", revoke, {"reason": "bad"}).status_code, 422)
        self.assertEqual(send(self.client, "post", revoke, {"reason": "lost_phone"}).json()["status"], "revoked")
        self.assertEqual(code_of(send(self.client, "post", revoke, {"reason": "lost_phone"})), "invalid_transition")
        reset = send(self.client, "post", f"/api/v1/admin/codes/{code}/reset-pin")
        self.assertEqual(code_of(reset), "invalid_transition")
        unknown = send(self.client, "post", "/api/v1/admin/codes/OBS-NOSUCH/revoke", {"reason": "other"})
        self.assertEqual(unknown.status_code, 404)
        listing = self.client.get("/api/v1/admin/codes", {"status": "revoked"}).json()["items"]
        self.assertEqual([item["observer_code"] for item in listing], [code])
        self.assertEqual(self.client.get("/api/v1/admin/codes", {"status": "nope"}).status_code, 422)

    def test_daily_code_limit(self):
        today = timezone.now().astimezone(ZoneInfo("Africa/Lagos")).date()
        CodeIssuance.objects.create(organisation=self.admin.organisation, day=today, count=1999)
        response = send(self.client, "post", "/api/v1/admin/code-batches", {"label": "x", "count": 2})
        self.assertEqual(response.status_code, 429)
        self.assertIn("Retry-After", response)
        self.assertEqual(code_of(response), "rate_limited")

    def test_audit_export_is_limited_to_ten_an_hour(self):
        for _ in range(10):
            self.assertEqual(self.client.get("/api/v1/audit/export").status_code, 200)
        limited = self.client.get("/api/v1/audit/export")
        self.assertEqual(limited.status_code, 429)
        self.assertEqual(code_of(limited), "rate_limited")


class CoordinatorErrorTests(TestCase):
    def setUp(self):
        self.coordinator, self.client = signed_in("coordinator")

    def test_assignment_errors(self):
        reviewer = User.objects.create_user("rev@example.org", role="reviewer")
        report = Report.objects.create(observer=self.coordinator, submission_key=uuid4())
        url = "/api/v1/assignments"
        item = {"report_id": str(report.pk), "reviewer_id": str(reviewer.public_id), "version": 0}
        self.assertEqual(send(self.client, "post", url, {"items": [item]}, key=False).status_code, 400)
        self.assertEqual(send(self.client, "post", url, {"items": []}).status_code, 422)
        self.assertEqual(send(self.client, "post", url, {"items": [{"report_id": "x"}]}).status_code, 422)
        stale = send(self.client, "post", url, {"items": [{**item, "version": 7}]}).json()
        self.assertEqual(stale["results"][0]["error"]["code"], "stale_version")
        ghost = send(self.client, "post", url, {"items": [{**item, "reviewer_id": str(uuid4())}]}).json()
        self.assertEqual(ghost["results"][0]["error"]["code"], "validation_failed")
        self.assertTrue(send(self.client, "post", url, {"items": [item]}).json()["results"][0]["ok"])
        report.refresh_from_db()
        again = send(self.client, "post", url, {"items": [{**item, "version": report.version}]}).json()
        self.assertEqual(again["results"][0]["error"]["code"], "already_assigned")
        key = str(uuid4())
        self.client.post(url, {"items": [{**item, "version": report.version}]},
                         content_type="application/json", HTTP_IDEMPOTENCY_KEY=key)
        reused = self.client.post(url, {"items": [item]}, content_type="application/json", HTTP_IDEMPOTENCY_KEY=key)
        self.assertEqual(code_of(reused), "idempotency_key_reused")

    def test_cluster_and_alert_errors(self):
        path = f"/api/v1/ops/clusters/{uuid4()}/review"
        self.assertEqual(send(self.client, "post", path, key=False).status_code, 404)
        settings = "/api/v1/ops/cluster-settings"
        body = {"window_minutes": 60, "min_reports": 5, "categories": ["vote_buying"], "version": 0}

        def put(data):
            return self.client.put(settings, data, content_type="application/json")

        self.assertEqual(put({**body, "window_minutes": 1}).status_code, 422)
        self.assertEqual(code_of(put({**body, "version": 3})), "stale_version")
        self.assertEqual(put(body).json()["version"], 1)
        alerts = "/api/v1/security/alerts"
        notice(self.coordinator.organisation_id, "intake_burst", "organisation", "x", "Org", {"reports": 1})
        item = self.client.get(alerts).json()["items"][0]
        self.assertEqual(self.client.get(alerts, {"status": "bad"}).status_code, 422)
        self.assertEqual(self.client.get(alerts, {"severity": "bad"}).status_code, 422)
        missing = send(self.client, "post", f"{alerts}/{uuid4()}", {"status": "resolved", "version": 0}, key=False)
        self.assertEqual(missing.status_code, 404)
        to_open = send(self.client, "post", f"{alerts}/{item['id']}", {"status": "open", "version": 0}, key=False)
        self.assertEqual(to_open.status_code, 422)
        long_note = send(self.client, "post", f"{alerts}/{item['id']}",
                         {"status": "resolved", "version": 0, "note": "x" * 501}, key=False)
        self.assertEqual(long_note.status_code, 422)

    def test_public_snapshot_errors(self):
        url = "/api/v1/publish/snapshots"
        draft = send(self.client, "post", url).json()
        approve = f"{url}/{draft['id']}/approve"
        self.assertEqual(send(self.client, "post", approve, {}).status_code, 422)
        self.assertEqual(code_of(send(self.client, "post", approve, {"version": 5})), "stale_version")
        self.assertEqual(send(self.client, "post", approve, {"version": 0}, key=False).status_code, 400)
        self.assertEqual(send(self.client, "get", f"{url}/{uuid4()}").status_code, 404)

    def test_rumour_validation_and_scope(self):
        url = "/api/v1/rumours/claims"
        self.assertEqual(send(self.client, "post", url, {}).status_code, 422)
        bad = send(self.client, "post", url, {"text": "x", "seen_on": "nowhere", "language": "en"})
        self.assertEqual(bad.status_code, 422)
        self.assertEqual(send(self.client, "get", f"{url}/{uuid4()}").status_code, 404)
        created = send(self.client, "post", url,
                       {"text": "A rumour about queues", "seen_on": "whatsapp", "language": "en"})
        self.assertEqual(created.status_code, 201)
        outsider = signed_in("coordinator", Organisation.objects.create(name="O"))[1]
        self.assertEqual(outsider.get(f"{url}/{created.json()['id']}").status_code, 404)
        self.assertEqual(outsider.get(f"{url}/{created.json()['id']}/matches").status_code, 404)

    def test_late_materials_reads_only_own_organisation(self):
        other = Organisation.objects.create(name="Other")
        LateMaterialsRun.objects.create(
            organisation=other, model_version="m1", generated_at=timezone.now(), data_source="test", metrics={},
        )
        self.assertIsNone(self.client.get("/api/v1/ops/late-materials-risk").json()["model_version"])
        self.assertEqual(self.client.get("/api/v1/ops/late-materials-risk", {"limit": 500}).status_code, 422)


@override_settings(PASSWORD_HASHERS=["django.contrib.auth.hashers.MD5PasswordHasher"])
class TotpTests(TestCase):
    password = "mountains-are-quiet-27"

    def setUp(self):
        self.user = User.objects.create_user(
            "staff@example.org", self.password, role="reviewer", totp_secret="JBSWY3DPEHPK3PXP",
        )

    def start(self):
        client = Client()
        client.post("/api/v1/auth/staff/sign-in", {"email": self.user.email, "password": self.password},
                    content_type="application/json")
        return client

    def code(self, offset=0):
        return totp(self.user.totp_secret, int(timezone.now().timestamp()) // 30 + offset)

    def verify(self, client, code):
        return client.post("/api/v1/auth/staff/totp", {"code": code}, content_type="application/json")

    def test_adjacent_step_accepted_and_far_step_refused(self):
        self.assertEqual(self.verify(self.start(), self.code(-1)).status_code, 200)
        self.assertEqual(code_of(self.verify(self.start(), self.code(-3))), "totp_invalid")

    def test_five_wrong_codes_end_the_pending_session(self):
        client = self.start()
        for _ in range(5):
            self.assertEqual(code_of(self.verify(client, "000000")), "totp_invalid")
        self.assertEqual(code_of(self.verify(client, self.code())), "totp_required")

    def test_malformed_code_and_pending_session_gate(self):
        client = self.start()
        self.assertEqual(self.verify(client, "12ab").status_code, 422)
        self.assertEqual(client.get("/api/v1/review/queue").json()["error"]["code"], "totp_required")
        anonymous = Client().post("/api/v1/auth/staff/totp", {"code": "123456"}, content_type="application/json")
        self.assertEqual(code_of(anonymous), "totp_required")

    def test_offboarded_account_cannot_sign_in(self):
        self.user.is_active = False
        self.user.save()
        response = Client().post("/api/v1/auth/staff/sign-in", {"email": self.user.email, "password": self.password},
                                 content_type="application/json")
        self.assertEqual(code_of(response), "invalid_credentials")

    def test_expired_invite_and_weak_password(self):
        token = "inv_expired_token_for_test"
        self.user.staff_invite_digest = digest("staff-invite", token)
        self.user.staff_invite_expires_at = timezone.now() - timedelta(minutes=1)
        self.user.save()

        def post(body):
            return Client().post("/api/v1/auth/staff/invite", body, content_type="application/json")

        self.assertEqual(code_of(post({"token": token, "password": self.password})), "invalid_credentials")
        self.user.staff_invite_expires_at = timezone.now() + timedelta(hours=1)
        self.user.save()
        self.assertEqual(post({"token": token, "password": "short"}).status_code, 422)
        self.assertEqual(post({"token": token, "password": "1234567890123"}).status_code, 422)
        self.assertEqual(post({"token": token, "password": "staffexample.org"}).status_code, 422)

    def test_sign_out_is_idempotent(self):
        response = Client().post("/api/v1/auth/sign-out", {"everywhere": False}, content_type="application/json")
        self.assertEqual(response.status_code, 204)


class AuditChainTests(TestCase):
    def test_range_verify_and_gap_detection(self):
        admin, client = signed_in("org_admin")
        events = [record(admin.organisation_id, "a", "report", i) for i in range(3)]
        self.assertTrue(client.get("/api/v1/audit/verify").json()["intact"])
        AuditEvent.objects.filter(pk=events[1].pk).delete()
        result = client.get("/api/v1/audit/verify").json()
        self.assertFalse(result["intact"])
        self.assertEqual(result["first_broken_event_id"], str(events[2].pk))
        too_long = client.get("/api/v1/audit/verify", {"from": "2026-01-01", "to": "2026-12-31"})
        self.assertEqual(too_long.status_code, 422)
