from urllib.parse import urlencode
from uuid import uuid4

from django.core.management import call_command
from django.test import Client, TestCase, override_settings

from accounts.models import Organisation, User
from reference.models import AreaDataset
from reports.models import CitizenReply, Report, ReviewEvent, Triage
from reports.workflow import record_change

from .handlers import LIMIT, menu
from .intake import public_organisation
from .models import Callback, OutboundSMS, PhoneLanguage

PHONE = "+2348012345678"
SMS = "/api/v1/channels/sms/inbound/"
USSD = "/api/v1/channels/ussd/"
SIM = "/api/v1/simulator/"


@override_settings(CHANNEL_WEBHOOK_SECRET="test-key", CHANNEL_REQUIRE_GATEWAY_ALLOWLIST=False,
                   SIMULATOR_ENABLED=True, OBSERVATION_INTAKE_ENABLED=True)
class PhoneTests(TestCase):
    @classmethod
    def setUpTestData(cls):
        call_command("load_reference_areas", verbosity=0)
        cls.configure_organisation_simulator(True)

    @staticmethod
    def configure_organisation_simulator(enabled):
        organisation = public_organisation()
        if hasattr(organisation, "simulator_enabled"):
            organisation.simulator_enabled = enabled
            organisation.save(update_fields=["simulator_enabled"])

    def form(self, path, data):
        return self.client.post(path, urlencode(data), content_type="application/x-www-form-urlencoded")

    def sms(self, text, identifier=None, phone=PHONE, secret="test-key"):
        return self.form(SMS + secret, {"from": phone, "to": "1234", "text": text,
                                        "id": identifier or str(uuid4())})

    def ussd(self, text, session="abc", secret="test-key"):
        return self.form(USSD + secret, {"phoneNumber": PHONE, "sessionId": session,
                                         "serviceCode": "*347*88#", "text": text}).content.decode()

    def sim(self, path, data, key=None, client=None, **headers):
        return (client or self.client).post(SIM + path, data, content_type="application/json",
                                           HTTP_IDEMPOTENCY_KEY=str(key or uuid4()), **headers)

    def test_sms_report_and_status_replay(self):
        identifier = str(uuid4())
        response = self.sms("REPORT 4 Evidence at the gate", identifier)
        self.assertEqual((response.status_code, response.content), (200, b""))
        self.sms("REPORT 4 Evidence at the gate", identifier)
        report = Report.objects.get()
        self.assertIsNone(report.observer)
        self.assertEqual(report.incident_details["channel"], "sms")
        self.assertIsNone(report.incident_details["danger_now"])
        self.assertIsNone(report.incident_details["firsthand"])
        self.assertEqual(Triage.objects.count(), 1)
        self.assertEqual(ReviewEvent.objects.get().action, "create")
        self.assertEqual(OutboundSMS.objects.count(), 1)
        self.sms("STATUS " + report.receipt_code)
        self.assertIn("received", OutboundSMS.objects.last().text)

    def test_sms_language_help_invalid_commands(self):
        for command, language in (("LANG EN", "en"), ("LANG PCM", "pcm"), ("HARSHE HA", "ha"),
                                  ("ÈDÈ YO", "yo"), ("ASUSU IG", "ig")):
            self.sms(command)
            self.assertEqual(PhoneLanguage.objects.get().language, language)
        self.sms("nonsense")
        self.assertIn("KPUO", OutboundSMS.objects.last().text)
        self.sms("REPORT 4 KN-99-99 missing")
        self.assertFalse(Report.objects.exists())
        self.sms("STATUS EG-0000-0000")
        self.assertIn("could not find", OutboundSMS.objects.last().text)

    def test_sms_replies_only_from_original_phone_and_open_case(self):
        self.sms("REPORT 1 The forms were late")
        report = Report.objects.get()
        report.status = Report.Status.NEEDS_CLARIFICATION
        record_change(report, None, ReviewEvent.Action.REQUEST_CLARIFICATION,
                      {"note": "Where did this happen?"}, "status")
        command = f"REPLY {report.receipt_code} Outside the gate"
        self.sms(command, phone="+2348012345679")
        self.assertEqual(ReviewEvent.objects.count(), 2)
        self.sms(command)
        self.assertEqual(CitizenReply.objects.get(report=report).body, "Outside the gate")
        self.assertNotIn("note", ReviewEvent.objects.last().change)
        self.sms(command)
        self.assertEqual(ReviewEvent.objects.count(), 3)

    def test_invalid_secret_and_invalid_phone(self):
        self.assertEqual(self.sms("REPORT 1 Description", secret="wrong").status_code, 200)
        self.sms("REPORT 1 Description", phone="invalid")
        self.assertTrue(self.ussd("", secret="wrong").startswith("END "))
        self.assertFalse(Callback.objects.exists())

    @override_settings(OBSERVATION_INTAKE_ENABLED=False)
    def test_paused(self):
        self.assertIn("paused", self.ussd(""))
        self.sms("REPORT 1 The forms were late")
        self.assertIn("paused", OutboundSMS.objects.get().text)

    def test_sms_limits(self):
        for _ in range(33):
            self.sms("REPORT 1 The forms were late")
        self.assertEqual(Report.objects.count(), 10)
        self.assertEqual(OutboundSMS.objects.filter(text=LIMIT).count(), 1)

    def test_ussd_menu_and_confirm(self):
        self.assertIn("ElectraGuard", self.ussd(""))
        for number in range(1, 6):
            menu_text = self.ussd(str(number))
            self.assertIn("9 ", menu_text)
            self.assertLessEqual(len(menu_text), 182)
            self.assertTrue(menu_text.isascii())
        self.assertIn("danger", self.ussd("1*4"))
        self.assertIn("Call 112", self.ussd("1*4*1"))
        self.assertIn("Choose LGA", self.ussd("1*4*1*1"))
        self.assertIn("Choose state", self.ussd("1*4*1*1*0"))
        self.assertIn("max 140", self.ussd("1*4*1*1*1"))
        self.assertIn("max 140", self.ussd("1*4*1*1*1*" + "x"*141))
        self.assertIn("Send?", self.ussd("1*4*1*1*1*At*the gate"))
        self.assertIn("Cancelled", self.ussd("1*4*1*1*1*At*the gate*2"))
        self.assertFalse(Report.objects.exists())
        confirmation = "1*4*1*1*1*At*the gate*1"
        received = self.ussd(confirmation)
        self.assertEqual(self.ussd(confirmation), received)
        report = Report.objects.get()
        self.assertIn(report.receipt_code, received)
        self.assertEqual(report.description, "At*the gate")
        self.assertTrue(report.incident_details["danger_now"])
        self.assertIsNone(report.incident_details["area"]["ward_code"])
        self.assertEqual(OutboundSMS.objects.count(), 1)

    def test_ussd_description_can_end_in_literal_star_one(self):
        prefix = "1*4*2*1*1*Lane*1"
        self.assertIn("Send?", self.ussd(prefix))
        self.assertFalse(Report.objects.exists())
        self.assertIn("Received", self.ussd(prefix + "*1"))
        self.assertEqual(Report.objects.get().description, "Lane*1")

    def test_ussd_paging(self):
        release = AreaDataset.objects.first()
        base = next(iter(release.states.values()))
        release.states = {f"S{i}": dict(base, name=f"Test Name {i:02d}", state_code=f"S{i}") for i in range(10)}
        release.save()
        self.assertIn("98 More", self.ussd("1*1*2"))
        self.assertIn("Test Name 08", self.ussd("1*1*2*98"))
        self.assertIn("Test Name 00", self.ussd("1*1*2*98*0"))
        self.assertLessEqual(len("CON " + menu("Call 112 if you can.\nChoose state", list(release.states.values()))), 182)

    def test_simulator_inbox_reset_and_replay(self):
        key = uuid4()
        first = self.sim("sms", {"text": "REPORT 4 At the gate"}, key)
        self.assertEqual(first.status_code, 200)
        self.assertEqual(self.sim("sms", {"text": "REPORT 4 At the gate"}, key).json(), first.json())
        self.assertEqual(self.sim("sms", {"text": "HELP"}, key).json()["error"]["code"], "idempotency_key_reused")
        self.assertEqual(self.sim("sms", {"text": "HELP"}, "invalid").status_code, 400)
        self.assertEqual(self.sim("sms", {"text": ""}).status_code, 422)
        message = first.json()["replies"][0]
        self.assertTrue(Report.objects.get().incident_details["simulated"])
        self.assertFalse(OutboundSMS.objects.exists())
        self.assertEqual(self.client.get(SIM + "inbox?after=" + message["id"]).json()["messages"], [])
        self.assertEqual(Client().get(SIM + "inbox").json()["messages"], [])
        old = self.client.get(SIM + "inbox").json()["phone_label"]
        self.assertNotEqual(self.sim("reset", {}).json()["phone_label"], old)
        self.assertEqual(self.client.get(SIM + "inbox").json()["messages"], [])

    def test_simulator_ussd(self):
        data = {"session_id": str(uuid4()), "service_code": "*347*88#"}
        self.assertEqual(self.sim("ussd", data | {"input": "1"}).status_code, 422)
        for value in ("", "1", "4", "2", "1", "1", "At*the gate"):
            self.assertEqual(self.sim("ussd", data | {"input": value}).json()["type"], "CON")
        self.assertEqual(self.sim("ussd", data | {"input": "1"}).json()["type"], "END")
        self.assertEqual(len(self.client.get(SIM + "inbox").json()["messages"]), 1)

    def test_simulator_report_limit_survives_reset(self):
        for _ in range(10):
            self.assertEqual(self.sim("sms", {"text": "REPORT 4 At the gate"}).status_code, 200)
        self.sim("reset", {})
        response = self.sim("sms", {"text": "REPORT 4 At the gate"})
        self.assertEqual(response.status_code, 429)
        self.assertIn("Retry-After", response)
        self.assertEqual(Report.objects.count(), 10)

    def test_simulator_csrf_organisation_disabled_and_rate_limit(self):
        client = Client(enforce_csrf_checks=True)
        self.assertEqual(self.sim("sms", {"text": "HELP"}, client=client).json()["error"]["code"], "csrf_failed")
        client.get("/api/v1/auth/csrf")
        token = client.cookies["csrftoken"].value
        self.assertEqual(self.sim("sms", {"text": "HELP"}, client=client, HTTP_X_CSRFTOKEN=token).status_code, 200)
        self.configure_organisation_simulator(False)
        with self.settings(SIMULATOR_ENABLED=False):
            self.assertEqual(self.client.get(SIM + "inbox").status_code, 404)
        self.configure_organisation_simulator(True)
        for _ in range(60):
            self.assertEqual(self.client.get(SIM + "inbox").status_code, 200)
        self.assertEqual(self.client.get(SIM + "inbox").status_code, 429)
        other = Organisation.objects.create(name="Other")
        self.client.force_login(User.objects.create_user("other@example.test", organisation=other))
        self.assertEqual(self.client.get(SIM + "inbox").status_code, 404)

    def test_sms_report_with_real_unit_and_ward_codes(self):
        for code, field in (("SYN-KN-01-01-001", "polling_unit_code"), ("SYN-KN-01-01", "ward_code")):
            self.sms(f"REPORT 4 {code} Young men scaring voters")
            report = Report.objects.latest("pk")
            self.assertEqual(report.description, "Young men scaring voters")
            self.assertEqual(report.incident_details["area"][field], code)
            self.assertEqual(report.incident_details["area"]["ward_code"], "SYN-KN-01-01")
        self.sms("REPORT 4 SYN-KN-09-09-009 Young men scaring voters")
        self.assertEqual(Report.objects.count(), 2)
        self.assertIn("REPORT <0-9>", OutboundSMS.objects.last().text)

    def test_sms_hyphenated_first_word_without_digits_is_description_text(self):
        self.sms("REPORT 4 Mid-term style harassment at the gate")
        self.assertEqual(Report.objects.get().description, "Mid-term style harassment at the gate")

    def test_sms_keywords_tolerate_case_and_whitespace(self):
        self.sms("report\n4   Thugs at the gate")
        self.assertEqual(Report.objects.get().description, "Thugs at the gate")
        self.sms("  Status\t" + Report.objects.get().receipt_code)
        self.assertIn("received", OutboundSMS.objects.last().text)

    def test_ussd_screens_match_contract_in_every_language(self):
        for language in "12345":
            for text in ("", language, f"{language}*4", f"{language}*4*2", f"{language}*4*2*1",
                         f"{language}*4*2*1*1", f"{language}*4*2*1*1*At*the gate"):
                screen = self.ussd(text, session=f"s{language}")
                self.assertTrue(screen.startswith("CON "), screen)
                self.assertLessEqual(len(screen), 182)
                self.assertTrue(screen.isascii())
        self.assertIn("Choose state:", self.ussd("1*4*2"))
        self.assertIn("Choose LGA:", self.ussd("1*4*2*1"))
        self.assertTrue(self.ussd("1*4*2*1*1").endswith("letters):"))
        confirm = self.ussd("1*4*2*1*1*At the gate")
        self.assertRegex(confirm, r"^CON Send\? Violence/threats in .+\n1 Send 2 Cancel$")

    def test_ussd_report_has_no_ward_or_unit_and_unknown_firsthand(self):
        self.ussd("1*4*2*1*1*At the gate")
        self.ussd("1*4*2*1*1*At the gate*1")
        details = Report.objects.get().incident_details
        self.assertEqual(details["channel"], "ussd")
        self.assertIsNone(details["firsthand"])
        self.assertFalse(details["danger_now"])
        self.assertIsNone(details["area"]["polling_unit_code"])
        self.assertTrue(details["area"]["lga_code"])
