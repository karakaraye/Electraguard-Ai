from django.urls import path
from django.views.decorators.cache import never_cache

from . import citizen_views as public
from . import media_views as media
from . import operations_views as operations
from . import reviewer_views as review
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
    path("assignments", operations.assignments),
    path("ops/overview", operations.overview),
    path("review/queue", review.queue),
    path("review/cases/<uuid:reference>", review.case),
    path("review/cases/<uuid:reference>/actions", review.actions),
    path("review/cases/<uuid:reference>/suggestions/<str:kind>", review.suggestion),
    path("review/cases/<uuid:reference>/redaction", review.redact),
    path("public/reports", public.submit),
    path("public/receipts/<str:receipt_code>", public.receipt_status),
    path("public/receipts/<str:receipt_code>/conversation", public.conversation),
    path("public/receipts/<str:receipt_code>/reply", public.reply),
    path("public/receipts/<str:receipt_code>/withdraw", public.withdraw),
    path("reports/<uuid:reference>/uploads", media.start),
    path("uploads/<uuid:reference>", media.upload_endpoint),
    path("uploads/<uuid:reference>/complete", media.complete),
    path("media/<uuid:reference>/content", media.download),
    path("reports/<uuid:reference>/media/<uuid:media_id>", media.remove),
    path("reports", collection),
    path("reports/<uuid:reference>", views.detail),
    path("reports/<uuid:reference>/withdraw", views.withdraw),
    path("reports/<str:reference>", invalid_reference),
    path("reports/<str:reference>/withdraw", invalid_reference),
]
