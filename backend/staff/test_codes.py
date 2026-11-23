from uuid import uuid4

from django.test import TestCase

from accounts.models import ObserverCode, User
from accounts.staff_auth import VERIFIED

from .models import CodeRequest


class ObserverCodeAdminTests(TestCase):
    def test_batch_replay_and_reissue_keep_pin_responses_private(self):
        admin = User.objects.create_user("admin@example.org", role="org_admin")
        self.client.force_login(admin)
        session = self.client.session
        session[VERIFIED] = True
        session.save()
        batches = "/api/v1/admin/code-batches"
        key, body = str(uuid4()), {"label": "Training group", "count": 1}
        result = self.client.post(batches, body, content_type="application/json", HTTP_IDEMPOTENCY_KEY=key)
        self.assertEqual(result.status_code, 201)
        saved = CodeRequest.objects.get()
        self.assertIsNone(saved.body)
        self.assertTrue(saved.encrypted)
        response = self.client.post(batches, body, content_type="application/json", HTTP_IDEMPOTENCY_KEY=key)
        self.assertEqual(response.json(), result.json())
        self.assertNotContains(self.client.get(batches), "setup_pin")
        code = result.json()["cards"][0]["observer_code"]
        result = self.client.post(
            f"/api/v1/admin/codes/{code}/reissue", {"reason": "lost_phone"},
            content_type="application/json", HTTP_IDEMPOTENCY_KEY=str(uuid4()),
        )
        self.assertEqual(result.status_code, 200)
        original = ObserverCode.objects.get(code=code)
        self.assertEqual(original.status, "revoked")
        self.assertEqual(original.replaced_by.code, result.json()["card"]["observer_code"])
