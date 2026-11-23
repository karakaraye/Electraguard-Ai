from uuid import uuid4

from django.test import Client, TestCase

from accounts.models import Organisation, User
from accounts.staff_auth import PENDING, VERIFIED


ANY = uuid4()
ALL_STAFF = {"reviewer", "moderator", "coordinator", "org_admin"}

# method, path, roles that may use it (the permissions matrix), object route or not
ROUTES = [
    ("get", "/api/v1/review/queue", {"reviewer"}),
    ("get", f"/api/v1/review/cases/{ANY}", {"reviewer"}),
    ("post", f"/api/v1/review/cases/{ANY}/actions", {"reviewer"}),
    ("get", "/api/v1/assignments", {"coordinator"}),
    ("post", "/api/v1/assignments", {"coordinator"}),
    ("get", "/api/v1/ops/overview", {"coordinator"}),
    ("get", "/api/v1/ops/clusters", {"coordinator"}),
    ("post", f"/api/v1/ops/clusters/{ANY}/review", {"coordinator"}),
    ("get", "/api/v1/ops/coverage", {"coordinator"}),
    ("get", "/api/v1/ops/late-materials-risk", {"coordinator"}),
    ("get", "/api/v1/rumours/claims", {"coordinator"}),
    ("get", f"/api/v1/rumours/claims/{ANY}", {"coordinator"}),
    ("get", "/api/v1/publish/snapshots", {"coordinator"}),
    ("post", "/api/v1/publish/snapshots", {"coordinator"}),
    ("get", f"/api/v1/publish/snapshots/{ANY}", {"coordinator"}),
    ("get", "/api/v1/admin/code-batches", {"org_admin"}),
    ("post", "/api/v1/admin/code-batches", {"org_admin"}),
    ("get", "/api/v1/admin/codes", {"org_admin"}),
    ("get", "/api/v1/admin/staff", {"org_admin"}),
    ("post", "/api/v1/admin/staff", {"org_admin"}),
    ("get", "/api/v1/admin/settings", {"org_admin"}),
    ("get", "/api/v1/security/alerts", {"coordinator", "org_admin"}),
    ("get", "/api/v1/audit/export", {"org_admin"}),
    ("get", "/api/v1/audit/verify", {"coordinator", "org_admin"}),
]


def signed_in(role, organisation=None, *, verified=True, **extra):
    user = User.objects.create_user(f"{role}-{uuid4().hex[:8]}@example.org", role=role, **extra)
    if organisation:
        user.organisation = organisation
        user.save(update_fields=["organisation"])
    client = Client()
    client.force_login(user)
    session = client.session
    if verified:
        session[VERIFIED] = True
    session.save()
    return user, client


def call(client, method, path):
    kwargs = {"content_type": "application/json"} if method == "post" else {}
    if method == "post":
        kwargs["HTTP_IDEMPOTENCY_KEY"] = str(uuid4())
        return client.post(path, {}, **kwargs)
    return client.get(path)


class PermissionMatrixTests(TestCase):
    def test_anonymous_gets_401_everywhere(self):
        for method, path, _ in ROUTES:
            with self.subTest(path=path):
                response = call(Client(), method, path)
                self.assertEqual(response.status_code, 401, path)
                self.assertEqual(response.json()["error"]["code"], "not_authenticated")

    def test_every_staff_route_matches_the_matrix(self):
        clients = {role: signed_in(role)[1] for role in ALL_STAFF | {"observer"}}
        for method, path, allowed in ROUTES:
            object_route = str(ANY) in path
            for role, client in clients.items():
                with self.subTest(path=path, role=role):
                    response = call(client, method, path)
                    if role in allowed:
                        self.assertNotIn(response.status_code, (401, 403), (path, role))
                        continue
                    self.assertEqual(response.status_code, 404 if object_route else 403, (path, role))
                    code = "not_found" if object_route else "forbidden"
                    self.assertEqual(response.json()["error"]["code"], code)

    def test_pre_totp_session_is_refused(self):
        user, client = signed_in("coordinator", verified=False)
        for method, path, allowed in ROUTES:
            if "coordinator" in allowed:
                with self.subTest(path=path):
                    response = call(client, method, path)
                    self.assertEqual(response.status_code, 403)
                    self.assertEqual(response.json()["error"]["code"], "totp_required")

    def test_legacy_administrator_acts_as_coordinator_only(self):
        _, client = signed_in("administrator")
        self.assertEqual(client.get("/api/v1/ops/overview").status_code, 200)
        self.assertEqual(client.get("/api/v1/admin/staff").status_code, 403)

    def test_writes_require_csrf(self):
        user, _ = signed_in("coordinator")
        client = Client(enforce_csrf_checks=True)
        client.force_login(user)
        for path in ("/api/v1/publish/snapshots", "/api/v1/assignments", "/api/v1/auth/sign-out"):
            with self.subTest(path=path):
                response = client.post(path, {}, content_type="application/json",
                                       HTTP_IDEMPOTENCY_KEY=str(uuid4()))
                self.assertEqual(response.status_code, 403)
                self.assertEqual(response.json()["error"]["code"], "csrf_failed")

    def test_object_routes_hide_other_organisations(self):
        other = Organisation.objects.create(name="Other")
        _, outsider = signed_in("coordinator", other)
        _, insider = signed_in("coordinator")
        created = insider.post("/api/v1/publish/snapshots", {}, content_type="application/json",
                               HTTP_IDEMPOTENCY_KEY=str(uuid4()))
        self.assertEqual(created.status_code, 201)
        path = f"/api/v1/publish/snapshots/{created.json()['id']}"
        self.assertEqual(insider.get(path).status_code, 200)
        self.assertEqual(outsider.get(path).status_code, 404)
        approve = outsider.post(path + "/approve", {"version": 0}, content_type="application/json",
                                HTTP_IDEMPOTENCY_KEY=str(uuid4()))
        self.assertEqual(approve.status_code, 404)

    def test_pending_session_marker_is_not_a_login(self):
        client = Client()
        session = client.session
        session[PENDING] = {"user": 1}
        session.save()
        self.assertEqual(client.get("/api/v1/ops/overview").status_code, 403)
