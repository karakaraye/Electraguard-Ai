from django.urls import path

from . import views

urlpatterns = [
    path("channels/sms/inbound/<str:secret>", views.inbound_sms),
    path("channels/ussd/<str:secret>", views.inbound_ussd),
    path("simulator/sms", views.simulator_sms),
    path("simulator/ussd", views.simulator_ussd),
    path("simulator/inbox", views.simulator_inbox),
    path("simulator/reset", views.simulator_reset),
]
