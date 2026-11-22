from django.urls import path
from django.views.decorators.cache import never_cache

from . import v1_views as views


def collection(request):
    if request.method == "POST":
        return views.create(request)
    response = views.list_reports(request)
    if response.status_code == 405:
        response["Allow"] = "GET, POST"
    return response


@never_cache
def invalid_reference(request, reference):
    return views.missing()


urlpatterns = [
    path("reports", collection),
    path("reports/<uuid:reference>", views.detail),
    path("reports/<uuid:reference>/withdraw", views.withdraw),
    path("reports/<str:reference>", invalid_reference),
    path("reports/<str:reference>/withdraw", invalid_reference),
]
