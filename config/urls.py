from django.contrib import admin
from django.urls import path

from reports import views

urlpatterns = [
    path("admin/", admin.site.urls),
    path("api/csrf/", views.csrf),
    path("api/reports/", views.submit),
    path("api/receipt/", views.receipt),
    path("api/review/", views.queue),
    path("api/review/<uuid:reference>/", views.review),
]
