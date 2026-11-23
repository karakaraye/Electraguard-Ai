from django.urls import include, path

from accounts import observer_auth, views
from accounts.models import User
from approved_answers.views import ask
from reports.citizen import create_citizen, read_conversation, receipt_status, reply, withdraw as citizen_withdraw
from reports import conversation
from reports.result_ocr import read_photo

from . import health

urlpatterns = [
    path("api/v1/", include("discussions.urls")),
    path("api/v1/reports/<uuid:reference>/messages", conversation.collection),
    path("api/v1/reports/<uuid:reference>/messages/read", conversation.mark_read),
    path("api/v1/ask", ask),
    path("api/v1/result-sheets/ocr", read_photo),
    path("api/v1/public/reports", create_citizen),
    path("api/v1/public/receipts/<str:receipt_code>", receipt_status),
    path("api/v1/public/receipts/<str:receipt_code>/conversation", read_conversation),
    path("api/v1/public/receipts/<str:receipt_code>/reply", reply),
    path("api/v1/public/receipts/<str:receipt_code>/withdraw", citizen_withdraw),
    path("api/v1/", include("reports.v1_urls")),
    path("api/v1/reference/", include("reference.urls")),
    path("api/v1/auth/observer/pin/change", observer_auth.change_pin),
    path("api/v1/auth/csrf", observer_auth.csrf),
    path("api/v1/auth/observer/sign-in", observer_auth.sign_in),
    path("api/v1/auth/observer/pin", observer_auth.set_pin),
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
