from django.urls import path

from . import dashboard, triage_views, views, workflow

urlpatterns = [
    path("dashboard", dashboard.dashboard),
    path("assignments", workflow.assignments),
    path("assignments/<uuid:reference>", workflow.assign),
    path("review", workflow.review_queue),
    path("review/<uuid:reference>", workflow.review_case),
    path("review/<uuid:reference>/actions", workflow.review_action),
    path("review/<uuid:reference>/triage", triage_views.case_triage),
    path("review/<uuid:reference>/triage/category", triage_views.correct_category),
    path("review/<uuid:reference>/triage/matches/<uuid:candidate>", triage_views.decide_match),
    path(
        "review/<uuid:reference>/triage/matches/<uuid:candidate>/reverse",
        triage_views.reverse_match,
    ),
    path("reports/<uuid:reference>/clarification", workflow.clarify),
    path("reports", views.reports),
    path("reports/<uuid:reference>", views.report_detail),
    path("reports/<uuid:reference>/attachments", views.upload_evidence),
    path("reports/<uuid:reference>/attachments/<uuid:attachment_id>", views.download_evidence),
]
