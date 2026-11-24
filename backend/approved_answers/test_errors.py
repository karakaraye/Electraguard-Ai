import json
from io import StringIO
from pathlib import Path
from tempfile import TemporaryDirectory
from unittest.mock import patch

from django.core.management import CommandError, call_command
from django.test import Client, TestCase

from accounts.models import User

from .models import AnswerCount, ApprovedDocument

SOURCE = dict(document_id="guide", section="3", version="2026-11-25", url="/guide/late")


def document(language="en", body="Report a late opening to your coordinator.", observer_only=False, **source):
    return ApprovedDocument.objects.create(
        language=language, title="Guide", body=body, observer_only=observer_only, source={**SOURCE, **source})


class AskTests(TestCase):
    def setUp(self):
        self.client = Client(enforce_csrf_checks=True)

    def ask(self, data=None, **headers):
        csrf = self.client.get("/api/v1/auth/csrf").json()["csrf_token"]
        payload = {"question": "late opening", "language": "en", "audience": "public", **(data or {})}
        return self.client.post("/api/v1/ask", payload, content_type="application/json", HTTP_X_CSRFTOKEN=csrf, **headers)

    def test_answer_shape_quotes_one_paragraph_and_counts(self):
        document(body="Opening times.\n\nIf the polling unit opens late, report a late opening to your coordinator.\n\nBallot boxes.")
        body = self.ask().json()
        self.assertEqual(set(body), {"status", "language", "passages", "fallback_language_used"})
        self.assertEqual(body["status"], "answered")
        passage = body["passages"][0]
        self.assertEqual(passage["text"], "If the polling unit opens late, report a late opening to your coordinator.")
        self.assertEqual(passage["source"], {**SOURCE, "title": "Guide", "language": "en"})
        self.assertTrue(0 < passage["score"] <= 1)
        self.assertFalse(body["fallback_language_used"])
        self.assertEqual(AnswerCount.objects.get(language="en", status="answered").count, 1)

    def test_abstains_below_threshold_and_with_no_documents(self):
        self.assertEqual(self.ask().json(), {"status": "abstained", "language": "en", "passages": [], "fallback_language_used": False})
        document(body="Ballot boxes are sealed before voting starts.")
        body = self.ask({"question": "weather forecast tomorrow"}).json()
        self.assertEqual((body["status"], body["passages"]), ("abstained", []))
        self.assertEqual(self.ask({"question": "???"}).json()["status"], "abstained")
        self.assertEqual(AnswerCount.objects.get(language="en", status="abstained").count, 3)

    def test_validation_csrf_and_rate_limit(self):
        for data, name in (
            ({"question": "ab"}, "question"), ({"question": "x" * 501}, "question"), ({"question": 5}, "question"),
            ({"question": None}, "question"), ({"language": "fr"}, "language"), ({"language": None}, "language"),
            ({"audience": "staff"}, "audience"),
        ):
            response = self.ask(data)
            self.assertEqual((response.status_code, response.json()["error"]["code"]), (422, "validation_failed"), data)
            self.assertIn(name, response.json()["error"]["fields"])
        plain = Client(enforce_csrf_checks=True)
        denied = plain.post("/api/v1/ask", {}, content_type="application/json")
        self.assertEqual((denied.status_code, denied.json()["error"]["code"]), (403, "csrf_failed"))
        self.assertEqual(self.client.get("/api/v1/ask").status_code, 405)
        with patch("approved_answers.views.rate_limit", return_value=8):
            limited = self.ask()
        self.assertEqual((limited.status_code, limited["Retry-After"]), (429, "8"))
        self.assertFalse(AnswerCount.objects.exists())

    def test_observer_guide_needs_an_observer_session_and_audience(self):
        document(body="Observers record the queue size at accreditation.", observer_only=True, document_id="observer-guide")
        data = {"question": "queue size at accreditation"}
        self.assertEqual(self.ask(data).json()["status"], "abstained")
        self.assertEqual(self.ask({**data, "audience": "observer"}).json()["status"], "abstained")
        observer = User.objects.create_user("ask-observer@example.test", role=User.Role.OBSERVER)
        reviewer = User.objects.create_user("ask-reviewer@example.test", role=User.Role.REVIEWER)
        self.client.force_login(reviewer)
        self.assertEqual(self.ask({**data, "audience": "observer"}).json()["status"], "abstained")
        self.client.force_login(observer)
        self.assertEqual(self.ask({**data, "audience": "public"}).json()["status"], "abstained")
        answer = self.ask({**data, "audience": "observer"}).json()
        self.assertEqual(answer["passages"][0]["source"]["document_id"], "observer-guide")

    def test_languages_fall_back_to_english_only_when_needed(self):
        document("ha", "Duba rajistar ka kafin zaɓe.", document_id="ha-guide")
        document("en", "Check your register before the election.", document_id="en-guide")
        own = self.ask({"question": "rajistar ka", "language": "ha"}).json()
        self.assertEqual((own["passages"][0]["source"]["language"], own["fallback_language_used"]), ("ha", False))
        fallback = self.ask({"question": "register before election", "language": "ig"}).json()
        self.assertEqual((fallback["passages"][0]["source"]["language"], fallback["fallback_language_used"]), ("en", True))
        self.assertEqual(self.ask({"question": "unrelated gibberish words", "language": "yo"}).json()["status"], "abstained")

    def test_diacritics_do_not_block_matching(self):
        document("yo", "Ṣàyẹ̀wò ìwé àkọsílẹ̀ rẹ.", document_id="yo-guide")
        body = self.ask({"question": "sayewo iwe akosile", "language": "yo"}).json()
        self.assertEqual(body["status"], "answered")


class LoaderTests(TestCase):
    def load(self, files):
        with TemporaryDirectory() as folder:
            for name, text in files.items():
                Path(folder, name).write_text(text, encoding="utf-8", newline="")
            call_command("load_approved_documents", folder, stdout=StringIO())

    def header(self, **changes):
        return json.dumps({"document_id": "g", "title": "Guide", "section": "1", "version": "1",
                           "language": "en", "url": "/g", **changes})

    def test_crlf_files_and_restricted_flag_load(self):
        self.load({"a.md": f"---\r\n{self.header(observer_only=True)}\r\n---\r\nBody text here.\r\n"})
        stored = ApprovedDocument.objects.get()
        self.assertTrue(stored.observer_only)
        self.assertEqual(stored.body.strip(), "Body text here.")

    def test_invalid_files_are_rejected_without_partial_loads(self):
        good = f"---\n{self.header()}\n---\nGood body.\n"
        cases = {
            "no-delimiters.md": "Just text",
            "bad-json.md": "---\n{oops\n---\nBody\n",
            "bad-language.md": f"---\n{self.header(language='fr')}\n---\nBody\n",
            "missing-key.md": "---\n" + json.dumps({"document_id": "g", "title": "t", "language": "en"}) + "\n---\nBody\n",
            "empty-body.md": f"---\n{self.header()}\n---\n   \n",
            "bad-flag.md": f"---\n{self.header(observer_only='yes')}\n---\nBody\n",
            "empty-value.md": f"---\n{self.header(url='')}\n---\nBody\n",
            "leading-text.md": f"x---\n{self.header()}\n---\nBody\n",
        }
        for name, text in cases.items():
            with self.assertRaises(CommandError, msg=name):
                self.load({"a-good.md": good, name: text})
            self.assertFalse(ApprovedDocument.objects.exists(), name)

    def test_missing_folder_and_updates_in_place(self):
        with self.assertRaises(CommandError):
            call_command("load_approved_documents", "no-such-folder")
        self.load({"a.md": f"---\n{self.header()}\n---\nFirst version.\n"})
        self.load({"a.md": f"---\n{self.header(version='2', title='Renamed')}\n---\nSecond version.\n"})
        stored = ApprovedDocument.objects.get()
        self.assertEqual((stored.title, stored.source["version"], stored.body.strip()), ("Renamed", "2", "Second version."))
