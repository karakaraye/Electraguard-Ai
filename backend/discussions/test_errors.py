from datetime import date, timedelta
from io import StringIO
from unittest.mock import patch
from uuid import uuid4

from django.core.management import call_command
from django.test import Client, TestCase
from django.utils import timezone

from accounts.models import INITIAL_ORGANISATION, ObserverCode, Organisation, User
from accounts.observer_credentials import check_symbol

from .models import Discussion, ModerationAction, Post

LISTING = "/api/v1/discussions"


def make_code(user, digits):
    code = f"OBS-{digits}{check_symbol(digits)}"
    ObserverCode.objects.create(code=code, user=user, organisation=user.organisation, status=ObserverCode.Status.ACTIVE)
    return code


class DiscussionErrorTests(TestCase):
    @classmethod
    def setUpTestData(cls):
        call_command("load_reference_areas", stdout=StringIO())
        cls.moderator = User.objects.create_user("mod-errors@example.test", role=User.Role.MODERATOR)
        cls.member = User.objects.create_user("member-errors@example.test", role=User.Role.OBSERVER)
        cls.outsider = User.objects.create_user("outsider-errors@example.test", role=User.Role.OBSERVER)
        cls.reviewer = User.objects.create_user("reviewer-errors@example.test", role=User.Role.REVIEWER)
        cls.foreign_org = Organisation.objects.create(name="Foreign synthetic group")
        cls.foreign_mod = User.objects.create_user(
            "foreign-mod-errors@example.test", role=User.Role.MODERATOR, organisation=cls.foreign_org)
        cls.foreign_obs = User.objects.create_user(
            "foreign-obs-errors@example.test", role=User.Role.OBSERVER, organisation=cls.foreign_org)
        cls.member_code = make_code(cls.member, "34567")
        cls.outsider_code = make_code(cls.outsider, "45678")
        cls.foreign_code = make_code(cls.foreign_obs, "56789")

    def setUp(self):
        self.client = Client(enforce_csrf_checks=True)
        self.future = (timezone.now() + timedelta(days=1)).isoformat()

    def post(self, url, data=None, key=None, **extra):
        csrf = self.client.get("/api/v1/auth/csrf").json()["csrf_token"]
        return self.client.post(url, data or {}, content_type="application/json", HTTP_X_CSRFTOKEN=csrf,
                                HTTP_IDEMPOTENCY_KEY=str(key or uuid4()), **extra)

    def as_user(self, user):
        self.client.force_login(user)

    def thread(self, accept=True):
        self.as_user(self.moderator)
        created = self.post(LISTING, {"title": "Ward observations", "ward_code": "SYN-KN-01-01", "closes_at": self.future})
        self.assertEqual(created.status_code, 201, created.content)
        url = f"{LISTING}/{created.json()['discussion']['id']}"
        invited = self.post(f"{url}/invitations", {"observer_codes": [self.member_code]})
        self.assertEqual(invited.json()["invited"], [self.member_code])
        if accept:
            self.as_user(self.member)
            self.assertEqual(self.post(f"{url}/membership", {"action": "accept"}).status_code, 200)
        return url

    def error(self, response, status, code):
        self.assertEqual((response.status_code, response.json()["error"]["code"]), (status, code), response.content)

    def test_permissions(self):
        self.error(self.client.get(LISTING), 401, "not_authenticated")
        self.as_user(self.reviewer)
        self.error(self.client.get(LISTING), 403, "forbidden")
        self.error(self.client.get("/api/v1/moderation/flags"), 403, "forbidden")
        self.as_user(self.member)
        self.error(self.post(LISTING, {"title": "Nope"}), 403, "forbidden")
        self.error(self.client.get("/api/v1/moderation/flags"), 403, "forbidden")
        self.as_user(self.moderator)
        self.error(self.client.post(LISTING, {}, content_type="application/json"), 403, "csrf_failed")
        csrf = self.client.get("/api/v1/auth/csrf").json()["csrf_token"]
        no_key = self.client.post(LISTING, {"title": "Ward", "ward_code": "SYN-KN-01-01"}, content_type="application/json",
                                  HTTP_X_CSRFTOKEN=csrf)
        self.error(no_key, 400, "idempotency_key_required")

    def test_create_validation_and_defaults(self):
        self.as_user(self.moderator)
        base = {"title": "Ward observations", "ward_code": "SYN-KN-01-01", "closes_at": self.future}
        for data, name, code in (
            ({**base, "title": "ab"}, "title", "invalid"),
            ({**base, "title": "x" * 121}, "title", "invalid"),
            ({**base, "topic": "t" * 501}, "topic", "invalid"),
            ({**base, "ward_code": "SYN-NOPE"}, "ward_code", "unknown_area"),
            ({k: v for k, v in base.items() if k != "ward_code"}, "ward_code", "unknown_area"),
            ({**base, "lga_code": "SYN-KN-01"}, "lga_code", "unknown_area"),
            ({k: v for k, v in base.items() if k != "ward_code"} | {"lga_code": "NOPE"}, "lga_code", "unknown_area"),
            ({**base, "closes_at": (timezone.now() - timedelta(hours=1)).isoformat()}, "closes_at", "invalid"),
            ({**base, "closes_at": "2999-01-01T00:00:00"}, "closes_at", "invalid"),
        ):
            response = self.post(LISTING, data)
            self.assertEqual((response.status_code, response.json()["error"]["fields"][name]["code"]), (422, code), data)
        no_deadline = {k: v for k, v in base.items() if k != "closes_at"}
        self.error(self.post(LISTING, no_deadline), 422, "validation_failed")
        Organisation.objects.filter(pk=INITIAL_ORGANISATION).update(election_day=timezone.localdate() + timedelta(days=3))
        self.moderator.refresh_from_db()
        self.moderator.organisation.refresh_from_db()
        created = self.post(LISTING, no_deadline)
        self.assertEqual(created.status_code, 201, created.content)
        closes = Discussion.objects.get(pk=created.json()["discussion"]["id"]).closes_at
        self.assertGreater(closes, timezone.now() + timedelta(days=4))
        by_lga = self.post(LISTING, {"title": "LGA talk", "lga_code": "SYN-KN-01", "closes_at": self.future})
        self.assertEqual(by_lga.status_code, 201, by_lga.content)
        self.assertIsNone(by_lga.json()["discussion"]["area"]["ward_code"])
        self.assertTrue(ModerationAction.objects.filter(action="create").exists())

    def test_listing_visibility_and_filters(self):
        url = self.thread(accept=False)
        self.as_user(self.member)
        item = self.client.get(LISTING).json()["items"][0]
        self.assertEqual((item["membership"], item["unread_posts"], item["last_post_at"]), ("invited", 0, None))
        self.assertNotIn("topic", item)
        thread = self.client.get(url).json()
        self.assertEqual(thread["posts"], [])
        self.assertNotIn("topic", thread["discussion"])
        self.as_user(self.outsider)
        self.assertEqual(self.client.get(LISTING).json()["items"], [])
        self.error(self.client.get(url), 404, "not_found")
        self.as_user(self.foreign_obs)
        self.error(self.client.get(url), 404, "not_found")
        self.as_user(self.foreign_mod)
        self.assertEqual(self.client.get(LISTING).json()["items"], [])
        self.error(self.client.get(url), 404, "not_found")
        self.as_user(self.moderator)
        self.assertEqual(self.client.get(LISTING, {"status": "open"}).json()["items"][0]["membership"], "moderator")
        self.assertEqual(self.client.get(LISTING, {"status": "closed"}).json()["items"], [])
        for params in ({"status": "bogus"}, {"limit": 0}, {"limit": "x"}, {"cursor": "nope"}):
            self.error(self.client.get(LISTING, params), 422, "validation_failed")
        self.error(self.client.get(f"{url}?limit=0"), 422, "validation_failed")
        self.error(self.client.get(f"{url}?after=nope"), 422, "validation_failed")
        self.error(self.client.get(f"{url}?after={uuid4()}"), 404, "not_found")
        self.error(self.client.get(f"{LISTING}/{uuid4()}"), 404, "not_found")

    def test_post_validation_flags_and_rate_limit(self):
        url = self.thread()
        for body in ("", "x" * 1001, None, 5):
            self.error(self.post(f"{url}/posts", {"body": body}), 422, "validation_failed")
        self.error(self.post(f"{url}/posts", {"body": "ok", "extra": 1}), 422, "validation_failed")
        self.error(self.post(f"{url}/posts", {"body": "see syn-kn-01-01-001 now"}), 422, "validation_failed")
        key = uuid4()
        first = self.post(f"{url}/posts", {"body": "Chief Okafor was at the gate."}, key)
        self.assertEqual(first.status_code, 201, first.content)
        self.assertEqual(self.post(f"{url}/posts", {"body": "Chief Okafor was at the gate."}, key).status_code, 200)
        self.error(self.post(f"{url}/posts", {"body": "Changed"}, key), 409, "idempotency_key_reused")
        self.assertEqual(Post.objects.count(), 1)
        self.assertTrue(Post.objects.get().name_check)
        with patch("discussions.views.rate_limit", return_value=11):
            limited = self.post(f"{url}/posts", {"body": "Another"})
        self.assertEqual((limited.status_code, limited["Retry-After"]), (429, "11"))
        item = f"{url}/posts/{first.json()['post']['id']}"
        self.error(self.post(f"{item}/flag", {"reason": "bogus"}), 422, "validation_failed")
        self.error(self.post(f"{url}/posts/{uuid4()}/flag", {"reason": "abusive"}), 404, "not_found")
        self.assertEqual(self.post(f"{item}/flag", {"reason": "abusive"}).status_code, 204)
        self.assertEqual(self.post(f"{item}/flag", {"reason": "abusive"}).status_code, 204)
        self.as_user(self.moderator)
        entry = self.client.get("/api/v1/moderation/flags").json()["items"][0]
        self.assertEqual((entry["reasons"], entry["name_check"], entry["flag_count"]), (["abusive"], True, 1))
        self.assertEqual(entry["post"]["hidden_body"], None)
        for params in ({"status": "closed"}, {"limit": 0}, {"cursor": "nope"}):
            self.error(self.client.get("/api/v1/moderation/flags", params), 422, "validation_failed")

    def test_membership_transitions(self):
        url = self.thread(accept=False)
        self.as_user(self.member)
        self.error(self.post(f"{url}/membership", {"action": "bogus"}), 422, "validation_failed")
        self.error(self.post(f"{url}/membership", {"action": "leave"}), 409, "invalid_transition")
        declined = self.post(f"{url}/membership", {"action": "decline"})
        self.assertEqual(declined.json(), {"discussion_id": url.rsplit("/", 1)[1], "membership": "declined"})
        self.assertEqual(self.post(f"{url}/membership", {"action": "decline"}).json()["membership"], "declined")
        self.assertEqual(self.client.get(LISTING).json()["items"], [])
        self.as_user(self.moderator)
        again = self.post(f"{url}/invitations", {"observer_codes": [self.member_code]})
        self.assertEqual(again.json()["invited"], [self.member_code])
        self.as_user(self.member)
        self.assertEqual(self.post(f"{url}/membership", {"action": "accept"}).json()["membership"], "member")
        self.assertEqual(self.post(f"{url}/membership", {"action": "leave"}).json()["membership"], "left")
        self.error(self.post(f"{url}/membership", {"action": "accept"}), 409, "invalid_transition")
        self.as_user(self.outsider)
        self.error(self.post(f"{url}/membership", {"action": "accept"}), 404, "not_found")
        self.as_user(self.moderator)
        self.error(self.post(f"{url}/membership", {"action": "accept"}), 403, "forbidden")

    def test_moderator_operations_and_errors(self):
        url = self.thread()
        self.as_user(self.moderator)
        for codes in (None, [], "OBS-1", [5], ["x" * 41], [f"OBS-{i}" for i in range(201)]):
            self.error(self.post(f"{url}/invitations", {"observer_codes": codes}), 422, "validation_failed")
        result = self.post(f"{url}/invitations", {"observer_codes": [
            self.member_code, self.outsider_code, self.foreign_code, "OBS-ZZZZZZ", self.member_code.lower()]}).json()
        self.assertEqual(result["already_members"], [self.member_code])
        self.assertEqual(result["invited"], [self.outsider_code])
        self.assertCountEqual(result["not_found"], [self.foreign_code, "OBS-ZZZZZZ"])
        ObserverCode.objects.filter(code=self.outsider_code).update(status=ObserverCode.Status.REVOKED)
        revoked = self.post(f"{url}/invitations", {"observer_codes": [self.outsider_code]}).json()
        self.assertEqual(revoked["not_found"], [self.outsider_code])
        self.as_user(self.member)
        post = self.post(f"{url}/posts", {"body": "Late materials."}).json()["post"]
        item = f"{url}/posts/{post['id']}"
        self.as_user(self.moderator)
        self.error(self.post(f"{item}/hide", {"reason": "bogus"}), 422, "validation_failed")
        self.error(self.post(f"{item}/hide", {"reason": "other", "note": "n" * 501}), 422, "validation_failed")
        self.error(self.post(f"{url}/posts/{uuid4()}/hide", {"reason": "other"}), 404, "not_found")
        hidden = self.post(f"{item}/hide", {"reason": "off_topic", "note": "Not about materials."}).json()["post"]
        self.assertEqual((hidden["state"], hidden["hidden_reason"], hidden["author_label"]), ("hidden", "off_topic", "Moderator"))
        self.as_user(self.member)
        self.assertEqual(self.client.get(url).json()["posts"][0]["body"], None)
        self.assertNotIn("hidden_body", self.client.get(url).json()["posts"][0])
        self.as_user(self.moderator)
        self.assertEqual(self.post(f"{item}/unhide").json()["post"]["state"], "visible")
        self.error(self.post(f"{url}/members/{self.member_code}/remove", {}), 422, "validation_failed")
        self.error(self.post(f"{url}/members/OBS-ZZZZZZ/remove", {"reason": "Left the role."}), 404, "not_found")
        self.error(self.post(f"{url}/members/{self.foreign_code}/remove", {"reason": "Not ours."}), 404, "not_found")
        self.assertEqual(self.post(f"{url}/members/{self.member_code}/remove", {"reason": "Role ended."}).json(),
                         {"membership": "removed"})
        self.as_user(self.foreign_mod)
        for suffix in ("invitations", "close"):
            self.error(self.post(f"{url}/{suffix}", {"observer_codes": [self.member_code]}), 404, "not_found")
        self.as_user(self.moderator)
        closed = self.post(f"{url}/close").json()["discussion"]
        self.assertEqual(closed["status"], "closed")
        self.assertEqual(
            set(ModerationAction.objects.values_list("action", flat=True)),
            {"create", "invite", "hide", "unhide", "remove", "close"})
        removal = ModerationAction.objects.get(action="remove")
        self.assertEqual((removal.actor, removal.details["observer_code"]), (self.moderator, self.member_code))

    def test_closed_discussions_refuse_changes(self):
        url = self.thread()
        post = self.post(f"{url}/posts", {"body": "Before closing."}).json()["post"]
        self.as_user(self.moderator)
        self.post(f"{url}/close")
        self.error(self.post(f"{url}/invitations", {"observer_codes": [self.outsider_code]}), 409, "discussion_closed")
        self.as_user(self.member)
        self.error(self.post(f"{url}/posts", {"body": "After closing."}), 409, "discussion_closed")
        self.error(self.post(f"{url}/posts/{post['id']}/flag", {"reason": "other"}), 409, "discussion_closed")
        self.error(self.post(f"{url}/membership", {"action": "leave"}), 409, "discussion_closed")
        self.assertEqual(self.client.get(LISTING, {"status": "closed"}).json()["items"][0]["status"], "closed")
        self.assertEqual(self.client.get(url).json()["posts"][0]["body"], "Before closing.")

    def test_unread_count_ignores_own_and_hidden_posts(self):
        url = self.thread()
        self.as_user(self.moderator)
        self.post(f"{url}/invitations", {"observer_codes": [self.outsider_code]})
        self.as_user(self.outsider)
        self.post(f"{url}/membership", {"action": "accept"})
        first = self.post(f"{url}/posts", {"body": "From outsider."}).json()["post"]
        self.post(f"{url}/posts", {"body": "Second from outsider."})
        self.assertEqual(self.client.get(LISTING).json()["items"][0]["unread_posts"], 0)
        self.as_user(self.moderator)
        self.post(f"{url}/posts/{first['id']}/hide", {"reason": "other"})
        self.as_user(self.member)
        self.assertEqual(self.client.get(LISTING).json()["items"][0]["unread_posts"], 1)
        page = self.client.get(f"{url}?limit=1").json()
        self.assertEqual(len(page["posts"]), 1)
        self.assertIsNotNone(page["next_after"])
        rest = self.client.get(f"{url}?after={page['next_after']}").json()
        self.assertEqual(len(rest["posts"]), 1)
        self.assertEqual(self.client.get(LISTING).json()["items"][0]["unread_posts"], 0)
