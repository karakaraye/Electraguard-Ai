from django.urls import include, path

from accounts import observer_auth, staff_admin, staff_auth, views
from accounts.models import User
from approved_answers.views import ask
from reports import conversation
from reports.result_ocr import read_photo

from intelligence.views import materials_risk

from . import health

from ops import clusters, observations
from publicdata import views as publish
from rumours import public_views as rumour_public
from rumours import views as rumour_views
from security import views as security_views
from staff import audit, codes, organisation_settings


urlpatterns = [
    path("api/v1/audit/export", audit.export),
    path("api/v1/audit/verify", audit.verify),
    path("api/v1/security/alerts", security_views.alerts),
    path("api/v1/security/alerts/<uuid:alert_id>", security_views.update),
    path("api/v1/admin/settings", organisation_settings.settings_view),
    path("api/v1/admin/code-batches", codes.batches),
    path("api/v1/admin/code-batches/<uuid:batch_id>/print-data", codes.print_data),
    path("api/v1/admin/codes", codes.code_list),
    path("api/v1/admin/codes/<str:observer_code>/revoke", codes.code_action, {"operation": "revoke"}),
    path("api/v1/admin/codes/<str:observer_code>/reissue", codes.code_action, {"operation": "reissue"}),
    path("api/v1/admin/codes/<str:observer_code>/reset-pin", codes.code_action, {"operation": "reset_pin"}),
    path("api/v1/ops/coverage", observations.coverage),
    path("api/v1/ops/clusters", clusters.clusters),
    path("api/v1/ops/clusters/<uuid:warning_id>/review", clusters.review),
    path("api/v1/ops/cluster-settings", clusters.settings_view),
    path("api/v1/publish/snapshots", publish.snapshots),
    path("api/v1/publish/snapshots/<uuid:snapshot_id>", publish.snapshot_detail),
    path("api/v1/publish/snapshots/<uuid:snapshot_id>/approve", publish.snapshot_decision, {"decision": "approve"}),
    path("api/v1/publish/snapshots/<uuid:snapshot_id>/discard", publish.snapshot_decision, {"decision": "discard"}),
    path("api/v1/publish/schedule", publish.schedule),
    path("api/v1/public/results", publish.results),
    path("api/v1/public/check", rumour_public.public_check_view),
    path("api/v1/rumours/claims", rumour_views.collection),
    path("api/v1/rumours/claims/<uuid:claim_id>", rumour_views.detail),
    path("api/v1/rumours/claims/<uuid:claim_id>/matches", rumour_views.matches),
    path("api/v1/rumours/claims/<uuid:claim_id>/response", rumour_views.draft),
    path("api/v1/rumours/claims/<uuid:claim_id>/response/approve", rumour_views.action, {"operation": "approve"}),
    path("api/v1/rumours/claims/<uuid:claim_id>/response/reject", rumour_views.action, {"operation": "reject"}),
    path("api/v1/rumours/claims/<uuid:claim_id>/dismiss", rumour_views.action, {"operation": "dismiss"}),
    path("api/v1/ops/late-materials-risk", materials_risk),
    path("api/v1/", include("phone_channels.urls")),
    path("api/v1/", include("discussions.urls")),
    path("api/v1/reports/<uuid:reference>/messages", conversation.collection),
    path("api/v1/reports/<uuid:reference>/messages/read", conversation.mark_read),
    path("api/v1/ask", ask),
    path("api/v1/result-sheets/ocr", read_photo),
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
