import json
from pathlib import Path
from tempfile import TemporaryDirectory
from unittest.mock import patch

from django.core.management import call_command
from django.test import Client, TestCase

from .models import ApprovedDocument


class ApprovedAnswerTests(TestCase):
    def test_quotes_exactly_abstains_and_protects_observer_documents(self):
        public = "Ṣàyẹ̀wò ìwé àṣẹ rẹ."
        ApprovedDocument.objects.create(language="yo", body=public, title="Guide",
                                        source=dict(document_id="public", section="1", version="1", url="/guide"))
        ApprovedDocument.objects.create(language="en", body="Accreditation procedures", title="Private",
                                        source=dict(document_id="observer"), observer_only=True)
        client = Client(enforce_csrf_checks=True)
        csrf = client.get("/api/v1/auth/csrf").json()["csrf_token"]

        def ask(question, language="yo", **headers):
            return client.post("/api/v1/ask", dict(question=question, language=language, audience="observer"),
                               content_type="application/json", **headers)

        self.assertEqual(ask(public).status_code, 403)
        self.assertEqual(ask(public, HTTP_X_CSRFTOKEN=csrf).json()["passages"][0]["text"], public)
        self.assertEqual(ask("Accreditation procedures", "en", HTTP_X_CSRFTOKEN=csrf).json()["status"], "abstained")
        self.assertEqual(ask("x", HTTP_X_CSRFTOKEN=csrf).status_code, 422)
        ApprovedDocument.objects.create(language="en", body="Keep distance from ballot boxes.", title="Public",
                                        source=dict(document_id="public-en", section="1", version="1", url="/guide"))
        fallback = ask("ballot boxes", "ig", HTTP_X_CSRFTOKEN=csrf).json()
        self.assertTrue(fallback["fallback_language_used"])
        self.assertEqual(fallback["passages"][0]["source"]["language"], "en")
        with patch("approved_answers.views.rate_limit", return_value=31):
            self.assertEqual(ask(public, HTTP_X_CSRFTOKEN=csrf).status_code, 429)

    def test_loader_updates_each_language_without_duplicates(self):
        texts = {
            "en": "Check the register.",
            "pcm": "Check di regista.",
            "ha": "Duba rajista.",
            "yo": "Ṣàyẹ̀wò ìwé àkọsílẹ̀.",
            "ig": "Lelee ndekọ ahụ.",
        }
        with TemporaryDirectory() as folder:
            for language, text in texts.items():
                source = dict(document_id="test-guide", title="Guide test", section="1",
                              version="1", language=language, url="/guide")
                Path(folder, f"{language}.md").write_text(f"---\n{json.dumps(source)}\n---\n{text}", encoding="utf-8")
            call_command("load_approved_documents", folder)
            call_command("load_approved_documents", folder)
        self.assertEqual(ApprovedDocument.objects.count(), 5)
        for language, text in texts.items():
            response = self.client.post("/api/v1/ask", dict(question=text, language=language, audience="public"),
                                        content_type="application/json").json()
            self.assertEqual(response["passages"][0]["text"], text)
            self.assertFalse(response["fallback_language_used"])
