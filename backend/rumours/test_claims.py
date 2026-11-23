from io import BytesIO
from uuid import uuid4

from django.core.files.uploadedfile import SimpleUploadedFile
from django.test import Client, TestCase
from PIL import Image

from accounts.models import User
from accounts.staff_auth import VERIFIED

from .models import Claim


class ClaimTests(TestCase):
    url = "/api/v1/rumours/claims"

    def client_for(self, email):
        user = User.objects.create_user(email, role="coordinator")
        client = Client()
        client.force_login(user)
        session = client.session
        session[VERIFIED] = True
        session.save()
        return client

    def test_response_requires_another_coordinator_and_is_replayable(self):
        first = self.client_for("coordinator@example.org")
        second = self.client_for("approver@example.org")
        created = first.post(self.url, {
            "text": "Thugs seen near the queue", "seen_on": "whatsapp", "language": "en",
        }, content_type="application/json", HTTP_IDEMPOTENCY_KEY=str(uuid4()))
        self.assertEqual(created.status_code, 201)
        claim_url = f'{self.url}/{created.json()["id"]}'
        draft = first.put(claim_url + "/response", {
            "text": "The observation team is checking this claim.", "version": 0, "language": "en",
        }, content_type="application/json")
        self.assertEqual(draft.json()["status"], "response_draft")
        approve = claim_url + "/response/approve"
        key = str(uuid4())
        body = {"version": 1}
        rejected = first.post(approve, body, content_type="application/json", HTTP_IDEMPOTENCY_KEY=key)
        self.assertEqual(rejected.json()["error"]["code"], "same_person_approval")
        approved = second.post(approve, body, content_type="application/json", HTTP_IDEMPOTENCY_KEY=key)
        self.assertEqual(approved.json()["status"], "response_approved")
        self.assertEqual(second.post(
            approve, body, content_type="application/json", HTTP_IDEMPOTENCY_KEY=key,
        )["Idempotent-Replayed"], "true")

    def test_image_metadata_is_removed(self):
        client = self.client_for("coordinator@example.org")
        source = BytesIO()
        image = Image.new("RGB", (3, 2))
        exif = Image.Exif()
        exif[271] = "Sensitive camera make"
        image.save(source, format="JPEG", exif=exif)
        response = client.post(self.url, {
            "seen_on": "whatsapp", "language": "en",
            "image": SimpleUploadedFile("image.jpg", source.getvalue(), content_type="image/jpeg"),
        }, HTTP_IDEMPOTENCY_KEY=str(uuid4()))
        self.assertEqual(response.status_code, 201)
        self.assertEqual(response.json()["image_check"]["metadata"]["camera_make"], "redacted")
        with Image.open(BytesIO(Claim.objects.get().image)) as stored:
            self.assertFalse(stored.getexif())
