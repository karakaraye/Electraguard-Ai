from hashlib import sha256
from io import BytesIO

from django.db import transaction
from django.db.models import Prefetch
from django.http import FileResponse
from django.shortcuts import get_object_or_404
from django.views.decorators.cache import never_cache
from rest_framework import serializers
from rest_framework.decorators import api_view, parser_classes
from rest_framework.parsers import JSONParser, MultiPartParser
from rest_framework.response import Response

from accounts.models import User
from accounts.permissions import require_role

from .models import Evidence, Report, Triage
from .serializers import EvidenceSerializer, ObserverReportDetailSerializer, ReportSerializer
from .triage import METHOD_VERSION
from .uploads import read_evidence


def own_reports(request):
    require_role(request.user, User.Role.OBSERVER)
    return Report.objects.filter(observer=request.user)


@never_cache
@api_view(["GET", "POST"])
@parser_classes([JSONParser])
@transaction.atomic
def reports(request):
    queryset = own_reports(request)
    if request.method == "GET":
        return Response(ReportSerializer(queryset, many=True).data)

    key = serializers.UUIDField(required=True).run_validation(
        request.headers.get("Idempotency-Key", serializers.empty)
    )
    serializer = ReportSerializer(data=request.data)
    serializer.is_valid(raise_exception=True)
    fields = serializer.validated_data
    report, created = queryset.get_or_create(
        observer=request.user, submission_key=key, defaults=fields
    )
    if not created and any(getattr(report, field) != value for field, value in fields.items()):
        return Response({"detail": "This submission key belongs to a different report."}, status=409)
    Triage.objects.get_or_create(report=report, defaults={"method_version": METHOD_VERSION})
    return Response(ReportSerializer(report).data, status=201 if created else 200)


def with_attachment_metadata(queryset):
    return queryset.prefetch_related(
        Prefetch("attachments", queryset=Evidence.objects.only("id", "report_id", "name"))
    )


@never_cache
@api_view(["GET"])
def report_detail(request, reference):
    report = get_object_or_404(
        with_attachment_metadata(own_reports(request)),
        reference=reference,
    )
    return Response(ObserverReportDetailSerializer(report).data)


@never_cache
@api_view(["POST"])
@parser_classes([MultiPartParser])
@transaction.atomic
def upload_evidence(request, reference):
    # Serialize with closure, including its attachment snapshot.
    report = get_object_or_404(own_reports(request).select_for_update(), reference=reference)
    if report.status == Report.Status.CLOSED:
        return Response({"detail": "Evidence uploads are unavailable because this case is closed."}, status=409)
    upload = request.FILES.get("file")
    content, content_type = read_evidence(upload)
    attachment, created = Evidence.objects.only("id", "name").get_or_create(
        report=report,
        sha256=sha256(content).hexdigest(),
        defaults={"name": upload.name, "content_type": content_type, "content": content},
    )
    return Response(EvidenceSerializer(attachment).data, status=201 if created else 200)


@never_cache
@api_view(["GET"])
def download_evidence(request, reference, attachment_id):
    if request.user.role == User.Role.REVIEWER:
        accessible = Report.objects.filter(assigned_reviewer=request.user)
    else:
        accessible = own_reports(request)
    attachment = get_object_or_404(
        Evidence, report__in=accessible.filter(reference=reference), id=attachment_id
    )
    extension = "jpg" if attachment.content_type == "image/jpeg" else "png"
    return FileResponse(
        BytesIO(attachment.content),
        as_attachment=True,
        filename=f"evidence-{attachment.id}.{extension}",
        content_type=attachment.content_type,
    )
