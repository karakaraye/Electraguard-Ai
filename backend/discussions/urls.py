from django.urls import path

from . import views

urlpatterns = [
    path("discussions", views.collection),
    path("discussions/<uuid:discussion_id>", views.thread),
    path("discussions/<uuid:discussion_id>/posts", views.observer_write, {"operation": "post"}),
    path("discussions/<uuid:discussion_id>/posts/<uuid:post_id>/flag", views.observer_write, {"operation": "flag"}),
    path("discussions/<uuid:discussion_id>/membership", views.observer_write, {"operation": "membership"}),
    path("discussions/<uuid:discussion_id>/invitations", views.moderate, {"operation": "invite"}),
    path("discussions/<uuid:discussion_id>/posts/<uuid:post_id>/hide", views.moderate, {"operation": "hide"}),
    path("discussions/<uuid:discussion_id>/posts/<uuid:post_id>/unhide", views.moderate, {"operation": "unhide"}),
    path("discussions/<uuid:discussion_id>/members/<str:observer_code>/remove", views.moderate, {"operation": "remove"}),
    path("discussions/<uuid:discussion_id>/close", views.moderate, {"operation": "close"}),
    path("moderation/flags", views.flags),
]
