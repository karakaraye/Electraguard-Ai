from django.contrib import admin
from django.contrib.auth import views as auth
from django.urls import path

from reports import pages, views

urlpatterns = [
    path("", pages.observer),
    path("service-worker.js", pages.worker),
    path("review/", pages.reviewer),
    path("review/assignments/", pages.assignments),
    path("review/overview/", pages.overview),
    path("review/sign-in/", auth.LoginView.as_view(
        template_name="reports/login.html", next_page="/review/",
    )),
    path("review/sign-out/", auth.LogoutView.as_view(
        next_page="/review/sign-in/",
    ), name="review-logout"),
    path("admin/", admin.site.urls),
    path("api/csrf/", views.csrf),
    path("api/reports/", views.submit),
    path("api/receipt/", views.receipt),
    path("api/review/", views.queue),
    path("api/review/assignees/", views.assignees),
    path("api/review/<uuid:reference>/", views.review),
    path("api/review/<uuid:reference>/assignment/", views.assign),
    path("api/review/<uuid:reference>/links/<uuid:candidate>/", views.decide_link),
]
