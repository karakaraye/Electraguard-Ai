from django.urls import include, path

from accounts import views
from accounts.models import User

from . import health

urlpatterns = [
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
