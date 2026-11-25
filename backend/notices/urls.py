from django.urls import path

from . import views

urlpatterns = [
    path("notices", lambda r: views.create_notice(r) if r.method == "POST" else views.list_notices(r)),
    path("notices/questions", views.list_questions),
    path("notices/<uuid:notice_id>/approve", views.approve_notice),
    path("notices/<uuid:notice_id>/reject", views.reject_notice),
    path("notices/<uuid:notice_id>/results", views.notice_results),
    path("observer/notices", views.observer_notices),
    path("observer/notices/<uuid:notice_id>/answer", views.answer_notice),
]
