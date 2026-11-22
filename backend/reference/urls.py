from django.urls import path

from . import views

urlpatterns = [
    path("areas", views.area_index),
    path("areas/<str:state_code>", views.area_state),
    path("settings", views.public_settings),
]
