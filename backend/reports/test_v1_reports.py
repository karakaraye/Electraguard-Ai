import json
from concurrent.futures import ThreadPoolExecutor
from datetime import timedelta
from io import StringIO
from pathlib import Path
from tempfile import TemporaryDirectory
from threading import Barrier
from uuid import uuid4

from django.core.management import call_command
from django.db import connections
from django.test import Client, TestCase, TransactionTestCase, override_settings
from django.utils import timezone

from accounts.models import INITIAL_ORGANISATION, Organisation, User
from accounts.observer_credentials import check_symbol
from reference.management.commands.load_reference_areas import DEFAULT_DATA

from .models import Evidence, Report, ReportIdempotency, ReviewEvent, Triage

PATH = "/api/v1/reports"


class ObserverReportTests(TestCase):
    @classmethod
    def setUpTestData(cls):
        call_command("load_reference_areas", stdout=StringIO())
        cls.observer = User.objects.create_user("observer@reports-v1.example", role=User.Role.OBSERVER)
        cls.other = User.objects.create_user("other@reports-v1.example", role=User.Role.OBSERVER)
        group = Organisation.objects.create(name="Other synthetic group")
        cls.foreign = User.objects.create_user(
            "foreign@reports-v1.example", role=User.Role.OBSERVER, organisation=group,
        )

    def setUp(self):
        self.client = Client(enforce_csrf_checks=True)
        self.client.force_login(self.observer)
        self.now = timezone.now()
        self.valid = {
            "kind": "incident", "language": "en", "occurred_at": self.now.isoformat(),
            "place": {"polling_unit_code": "SYN-KN-01-01-001", "ward_code": "SYN-KN-01-01"},
            "category_observer": "access_barrier", "access_barrier_details": ["steps_no_ramp"],
            "danger_now": False, "firsthand": True, "description": "Synthetic access observation.",
            "input_method": "typed", "device_saved_at": self.now.isoformat(),
        }

    def post(self, data=None, key=None, path=PATH, **headers):
        csrf = self.client.get("/api/v1/auth/csrf").json()["csrf_token"]
        return self.client.post(
            path, self.valid if data is None else data, content_type="application/json",
            HTTP_IDEMPOTENCY_KEY=str(key or uuid4()), HTTP_X_CSRFTOKEN=csrf, **headers,
        )

    def create(self):
        response = self.post()
        self.assertEqual(response.status_code, 201, response.content)
        return response.json()

    def test_receipt_idempotency_and_pause(self):
        key = uuid4()
        first = self.post(key=key)
        self.assertEqual(first.status_code, 201, first.content)
        body = first.json()
        self.assertEqual(body["status"], "received")
        self.assertRegex(body["receipt_code"], r"^EG-[0-9A-HJKMNP-TV-Z]{4}-[0-9A-HJKMNP-TV-Z]{4}$")
        suffix = body["receipt_code"][3:].replace("-", "")
        self.assertEqual(suffix[-1], check_symbol(suffix[:7]))
        with override_settings(OBSERVATION_INTAKE_ENABLED=False):
            repeat = self.post(dict(reversed(list(self.valid.items()))), key=key, HTTP_X_DEVICE_TIME="ignored-on-replay")
            self.assertEqual((repeat.status_code, repeat.json(), repeat["Idempotent-Replayed"]), (200, body, "true"))
            conflict = self.post({**self.valid, "description": "Different"}, key=key)
            self.assertEqual((conflict.status_code, conflict.json()["error"]["code"]), (409, "idempotency_key_reused"))
            paused = self.post()
            self.assertEqual((paused.status_code, paused.json()["error"]["code"], paused["Retry-After"]), (503, "intake_paused", "600"))
        self.assertEqual(Report.objects.count(), 1)
        self.assertEqual(ReportIdempotency.objects.count(), 1)
        self.assertEqual(Triage.objects.count(), 1)
        self.assertTrue(ReviewEvent.objects.filter(action="create", version=0).exists())

    def test_validation_and_fixing_failed_request_with_same_key(self):
        cases = [
            ({"kind": "checklist"}, "kind", "not_supported_yet"),
            ({"kind": "result_sheet"}, "kind", "not_supported_yet"),
            ({"kind": "other"}, "kind", "invalid_choice"),
            ({"language": "xx"}, "language", "invalid_choice"),
            ({"category_observer": "other"}, "category_observer", "invalid_choice"),
            ({"category_observer": "vote_buying"}, "access_barrier_details", "not_allowed_for_kind"),
            ({"access_barrier_details": ["invalid"]}, "access_barrier_details", "invalid_choice"),
            ({"access_barrier_details": ["distance", "distance"]}, "access_barrier_details", "duplicate"),
            ({"danger_now": "false"}, "danger_now", "invalid"),
            ({"firsthand": None}, "firsthand", "invalid"),
            ({"time_known": "false"}, "time_known", "invalid"),
            ({"description": " "}, "description", "required"),
            ({"description": "a" * 2001}, "description", "max_length"),
            ({"description": "description\x00x"}, "description", "invalid"),
            ({"input_method": "other"}, "input_method", "invalid_choice"),
            ({"device_saved_at": "2026-11-22"}, "device_saved_at", "invalid_datetime"),
            ({"occurred_at": "2026-11-22T12:00:00"}, "occurred_at", "invalid_datetime"),
            ({"occurred_at": (self.now + timedelta(minutes=6)).isoformat()}, "occurred_at", "in_future"),
            ({"occurred_at": (self.now - timedelta(days=31)).isoformat()}, "occurred_at", "too_old"),
            ({"related_report_id": "bad"}, "related_report_id", "invalid"),
            ({"from_checklist_question": "opened_on_time"}, "from_checklist_question", "not_allowed_for_kind"),
            ({"place": {}}, "place.ward_code", "required"),
            ({"place": {"polling_unit_code": "bad"}}, "place.polling_unit_code", "unknown_area"),
            ({"place": {"ward_code": "bad"}}, "place.ward_code", "unknown_area"),
            ({"place": {"polling_unit_code": "SYN-KN-01-01-001", "ward_code": "SYN-KN-01-02"}}, "place.ward_code", "unknown_area"),
        ]
        for patch, name, expected in cases:
            with self.subTest(name=name, expected=expected):
                response = self.post({**self.valid, **patch})
                self.assertEqual(response.status_code, 422, response.content)
                self.assertEqual(response.json()["error"]["fields"][name]["code"], expected)
        key = uuid4()
        self.assertEqual(self.post({**self.valid, "description": ""}, key=key).status_code, 422)
        self.assertFalse(ReportIdempotency.objects.exists())
        self.assertEqual(self.post(key=key).status_code, 201)
        self.assertEqual(self.post(key="not-a-uuid").json()["error"]["code"], "idempotency_key_required")
        self.assertEqual(self.post({**self.valid, "description": "x" * 66000}).status_code, 413)
        self.assertEqual(self.post(HTTP_X_DEVICE_TIME=(self.now - timedelta(hours=1)).isoformat()).json()["error"]["fields"]["occurred_at"]["code"], "in_future")

    def test_historical_area_date_only_and_description_normalization(self):
        data = json.loads(DEFAULT_DATA.read_text())
        data["dataset_version"] = "2026-11-22.2"
        data["states"][0]["lgas"][0]["wards"][0]["units"].pop(0)
        with TemporaryDirectory() as folder:
            path = Path(folder) / "next.json"
            path.write_text(json.dumps(data))
            call_command("load_reference_areas", file=path, stdout=StringIO())
        response = self.post({
            **self.valid, "occurred_at": self.now.date().isoformat(), "time_known": False,
            "description": "  Cafe\u0301 " + "x" * 1200 + "  ",
        })
        self.assertEqual(response.status_code, 201, response.content)
        detail = self.client.get(f"{PATH}/{response.json()['id']}").json()
        self.assertFalse(detail["time_known"])
        self.assertTrue(detail["occurred_at"].endswith("T00:00:00+01:00"))
        self.assertTrue(detail["description"].startswith("Café "))
        self.assertEqual(detail["area"]["polling_unit_code"], "SYN-KN-01-01-001")

    def test_paging_counts_and_isolation(self):
        ids = [self.create()["id"] for _ in range(3)]
        first = self.client.get(PATH, {"limit": 2}).json()
        second = self.client.get(PATH, {"limit": 2, "cursor": first["next_cursor"]}).json()
        self.assertEqual([row["id"] for row in first["items"] + second["items"]], ids[::-1])
        self.assertIsNone(second["next_cursor"])
        Report.objects.filter(pk=ids[0]).update(status=Report.Status.NEEDS_CLARIFICATION)
        attention = self.client.get(PATH, {"needs_attention": "true"}).json()
        self.assertEqual((attention["counts"]["total"], attention["counts"]["needs_attention"]), (3, 1))
        self.assertEqual([row["id"] for row in attention["items"]], ids[:1])
        self.assertIsNone(attention["items"][0]["last_message_preview"])
        for other in (self.other, self.foreign):
            self.client.force_login(other)
            self.assertEqual(self.client.get(f"{PATH}/{ids[0]}").status_code, 404)
            self.assertEqual(self.post({"confirm": True}, path=f"{PATH}/{ids[0]}/withdraw").status_code, 404)
            self.assertEqual(self.client.get(PATH).json()["counts"]["total"], 0)
            self.assertEqual(self.client.get(PATH, {"cursor": first["next_cursor"]}).status_code, 422)

    def test_withdraw_purges_content_and_replaces_replay_body(self):
        key = uuid4()
        created = self.post(key=key).json()
        reference = created["id"]
        report = Report.objects.get(pk=reference)
        Evidence.objects.create(report=report, name="old.png", content_type="image/png", sha256="digest", content=b"bytes")
        detail = self.client.get(f"{PATH}/{reference}").json()
        self.assertEqual(detail["media"][0]["size_bytes"], 5)
        self.assertFalse(detail["reviewer_assigned"])
        self.assertTrue(detail["can_message"])
        path = f"{PATH}/{reference}/withdraw"
        self.assertEqual(self.post({}, path=path).status_code, 422)
        result = self.post({"confirm": True}, path=path)
        self.assertEqual(result.status_code, 200, result.content)
        stub = result.json()
        self.assertEqual((stub["status"], stub["version"]), ("withdrawn", 1))
        self.assertEqual(self.post({"confirm": True}, path=path).json(), stub)
        self.assertEqual(self.client.get(f"{PATH}/{reference}").json(), stub)
        self.assertEqual(self.post(key=key).json(), stub)
        report.refresh_from_db()
        self.assertEqual((report.description, report.location, report.incident_details, report.occurred_at), ("", "", {}, None))
        self.assertFalse(Evidence.objects.exists())
        self.assertFalse(Triage.objects.exists())
        self.assertEqual(list(report.review_events.values_list("action", flat=True)), ["create", "withdraw"])
        self.assertEqual(self.client.get(f"/api/reports/{reference}").status_code, 404)

        active = self.create()["id"]
        Report.objects.filter(pk=active).update(status=Report.Status.IN_REVIEW)
        blocked = self.post({"confirm": True}, path=f"{PATH}/{active}/withdraw")
        self.assertEqual((blocked.status_code, blocked.json()["error"]["code"]), (409, "withdraw_unavailable"))


class ConcurrentReportReplayTests(TransactionTestCase):
    def test_concurrent_requests_commit_one_report(self):
        Organisation.objects.get_or_create(pk=INITIAL_ORGANISATION, defaults={"name": "Synthetic organisation"})
        call_command("load_reference_areas", stdout=StringIO())
        observer = User.objects.create_user("observer@race-v1.example", role=User.Role.OBSERVER)
        key = str(uuid4())
        gate = Barrier(2)
        data = {
            "kind": "incident", "language": "en", "occurred_at": timezone.now().isoformat(),
            "place": {"ward_code": "SYN-KN-01-01"}, "category_observer": "not_sure",
            "danger_now": False, "firsthand": True, "description": "Synthetic concurrent report.",
        }

        def submit():
            try:
                phone = Client(enforce_csrf_checks=True)
                phone.force_login(observer)
                csrf = phone.get("/api/v1/auth/csrf").json()["csrf_token"]
                gate.wait(timeout=10)
                response = phone.post(
                    PATH, data, content_type="application/json",
                    HTTP_IDEMPOTENCY_KEY=key, HTTP_X_CSRFTOKEN=csrf,
                )
                return response.status_code, response.json()
            finally:
                connections.close_all()

        with ThreadPoolExecutor(max_workers=2) as executor:
            first, second = list(executor.map(lambda _: submit(), range(2)))
        self.assertEqual(sorted((first[0], second[0])), [200, 201])
        self.assertEqual(first[1], second[1])
        self.assertEqual(Report.objects.count(), 1)
        self.assertEqual(ReportIdempotency.objects.count(), 1)
