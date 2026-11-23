from django.urls import include, path

from accounts import observer_auth, staff_admin, staff_auth, views
from accounts.models import User

from intelligence.views import materials_risk

from . import health

urlpatterns = [
    path("api/v1/ops/late-materials-risk", materials_risk),
    path("api/v1/", include("phone_channels.urls")),
    path("api/v1/", include("reports.v1_urls")),
    path("api/v1/reference/", include("reference.urls")),
    path("api/v1/auth/observer/pin/change", observer_auth.change_pin),
    path("api/v1/auth/csrf", observer_auth.csrf),
    path("api/v1/auth/observer/sign-in", observer_auth.sign_in),
    path("api/v1/auth/observer/pin", observer_auth.set_pin),
    path("api/v1/auth/staff/sign-in", staff_auth.sign_in),
    path("api/v1/auth/staff/totp", staff_auth.verify),
    path("api/v1/auth/staff/totp/enrolment", staff_auth.enrol),
    path("api/v1/auth/staff/totp/enrolment/confirm", staff_auth.confirm),
    path("api/v1/auth/staff/invite", staff_auth.accept_invite),
    path("api/v1/admin/staff", staff_admin.staff_collection),
    path("api/v1/admin/staff/<int:account_id>", staff_admin.update_staff),
    path("api/v1/admin/staff/<int:account_id>/reset-2fa", staff_admin.reset_2fa),
    path("api/v1/admin/staff/<int:account_id>/offboard", staff_admin.offboard_staff),
    path("api/v1/auth/sign-out", observer_auth.sign_out),
    path("api/v1/auth/me", observer_auth.me),
    path("health/live", health.live),
    path("health/ready", health.ready),
    path("api/", include("reports.urls")),
    path("api/auth/csrf", views.csrf_token),
    path("api/auth/sign-in", views.sign_in),
    path("api/auth/sign-out", views.sign_out),
    path("api/auth/me", views.current_user),
    *[
        path(f"api/workspaces/{role}", views.workspace, {"role": role})
        for role in User.Role
    ],
]
