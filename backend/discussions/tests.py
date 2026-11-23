from datetime import timedelta
from io import StringIO
from uuid import uuid4

from django.core.management import call_command
from django.test import TestCase
from django.utils import timezone

from accounts.models import ObserverCode, Organisation, User
from accounts.observer_credentials import check_symbol

from .models import Discussion, ModerationAction


class DiscussionTests(TestCase):
    def test_invitation_moderation_and_expiry(self):
        call_command("load_reference_areas", stdout=StringIO())
        moderator = User.objects.create_user("moderator-discussion@example.test", role=User.Role.MODERATOR)
        observer = User.objects.create_user("observer-discussion@example.test", role=User.Role.OBSERVER)
        peer = User.objects.create_user("peer-discussion@example.test", role=User.Role.OBSERVER)
        foreign = User.objects.create_user("foreign-discussion@example.test", role=User.Role.MODERATOR,
                                           organisation=Organisation.objects.create(name="Other"))
        code = f"OBS-12345{check_symbol('12345')}"
        peer_code = f"OBS-23456{check_symbol('23456')}"
        ObserverCode.objects.create(code=code, user=observer, status=ObserverCode.Status.ACTIVE)
        ObserverCode.objects.create(code=peer_code, user=peer, status=ObserverCode.Status.ACTIVE)

        def post(url, data, key=None):
            return self.client.post(url, data, content_type="application/json", HTTP_IDEMPOTENCY_KEY=str(key or uuid4()))

        self.client.force_login(moderator)
        future = (timezone.now() + timedelta(days=1)).isoformat()
        listing = "/api/v1/discussions"
        data = {"title": "Ward observations", "ward_code": "SYN-KN-01-01", "closes_at": future}
        key = uuid4()
        created = post(listing, data, key)
        self.assertEqual(created.status_code, 201, created.content)
        self.assertEqual(post(listing, data, key).status_code, 200)
        thread = f"{listing}/{created.json()['discussion']['id']}"
        self.assertEqual(post(f"{thread}/invitations", {"observer_codes": [code, peer_code]}).json()["invited"], [code, peer_code])
        self.client.force_login(foreign)
        self.assertEqual(self.client.get(thread).status_code, 404)
        self.client.force_login(observer)
        self.assertEqual(self.client.get(thread).json()["posts"], [])
        self.assertEqual(post(f"{thread}/posts", {"body": "A draft"}).json()["error"]["code"], "not_a_member")
        self.assertEqual(post(f"{thread}/membership", {"action": "accept"}).json()["membership"], "member")
        self.client.force_login(peer)
        self.assertEqual(post(f"{thread}/membership", {"action": "accept"}).status_code, 200)
        self.client.force_login(observer)
        self.assertEqual(post(f"{thread}/posts", {"body": "SYN-KN-01-01-001"}).status_code, 422)
        message = post(f"{thread}/posts", {"body": "Materials arrived."})
        self.assertEqual(message.status_code, 201, message.content)
        self.assertEqual(message.json()["post"]["author_label"], code)
        item = f"{thread}/posts/{message.json()['post']['id']}"
        self.assertEqual(post(f"{item}/flag", {"reason": "other"}).status_code, 204)
        self.client.force_login(peer)
        self.assertEqual(self.client.get(listing).json()["items"][0]["unread_posts"], 1)
        self.assertEqual(self.client.get(thread).json()["posts"][0]["author_label"], code)
        self.assertEqual(self.client.get(listing).json()["items"][0]["unread_posts"], 0)
        self.client.force_login(moderator)
        self.assertEqual(len(self.client.get("/api/v1/moderation/flags").json()["items"]), 1)
        self.assertEqual(post(f"{item}/hide", {"reason": "other"}).json()["post"]["hidden_body"], "Materials arrived.")
        self.client.force_login(observer)
        self.assertIsNone(self.client.get(thread).json()["posts"][0]["body"])
        self.client.force_login(moderator)
        self.assertEqual(post(f"{item}/unhide", {}).json()["post"]["state"], "visible")
        self.assertEqual(post(f"{thread}/members/{peer_code}/remove", {"reason": "Membership ended."}).status_code, 200)
        self.client.force_login(peer)
        self.assertEqual(self.client.get(thread).status_code, 404)
        self.assertEqual(post(f"{thread}/membership", {"action": "accept"}).json()["error"]["code"], "invalid_transition")
        self.client.force_login(observer)
        Discussion.objects.update(closes_at=timezone.now() - timedelta(seconds=1))
        call_command("close_expired_discussions", stdout=StringIO())
        self.assertEqual(post(f"{thread}/posts", {"body": "Late post"}).json()["error"]["code"], "discussion_closed")
        self.assertTrue(ModerationAction.objects.filter(action="auto_close").exists())
        self.client.force_login(moderator)
        self.assertEqual(post(f"{thread}/close", {}).json()["discussion"]["status"], "closed")
