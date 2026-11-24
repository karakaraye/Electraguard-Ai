from hashlib import sha256
from io import BytesIO

from django.conf import settings
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
from accounts.organisations import org_scope
from accounts.permissions import require_role

from .models import Evidence, Report, ReviewEvent, Triage
from .serializers import EvidenceSerializer, ObserverReportDetailSerializer, ReportSerializer
from .triage import METHOD_VERSION
from .uploads import read_evidence


def own_reports(request):
    require_role(request.user, User.Role.OBSERVER)
    return org_scope(request, Report).filter(observer=request.user).exclude(status=Report.Status.WITHDRAWN)


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
    if settings.OBSERVATION_INTAKE_ENABLED and not request.user.organisation.intake_paused:
        report, created = queryset.get_or_create(
            observer=request.user, submission_key=key,
            defaults={**fields, "organisation_id": request.user.organisation_id}
        )
    else:
        report = queryset.filter(submission_key=key).first()
        if report is None:
            return Response({
                "code": "intake_paused",
                "detail": "New reports are paused. Keep this page open and try again when intake resumes.",
            }, status=503)
        created = False
    if not created and any(getattr(report, field) != value for field, value in fields.items()):
        return Response({"detail": "This submission key belongs to a different report."}, status=409)
    org_scope(request, Triage).get_or_create(
        report=report, defaults={"method_version": METHOD_VERSION, "organisation_id": report.organisation_id}
    )
    return Response(ReportSerializer(report).data, status=201 if created else 200)


def with_attachment_metadata(request, queryset):
    return queryset.prefetch_related(
        Prefetch("attachments", queryset=org_scope(request, Evidence).only("id", "report_id", "name"))
    )


@never_cache
@api_view(["GET"])
def report_detail(request, reference):
    report = get_object_or_404(
        with_attachment_metadata(request, own_reports(request)),
        reference=reference,
    )
    report.observer_events = list(org_scope(request, ReviewEvent).filter(
        report=report, action__in=[
            ReviewEvent.Action.REQUEST_CLARIFICATION, ReviewEvent.Action.RESPOND,
            ReviewEvent.Action.CLOSE,
        ],
        version__lte=report.version,
    ).only("action", "change", "created_at"))
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
    attachment, created = org_scope(request, Evidence).only("id", "name").get_or_create(
        report=report,
        sha256=sha256(content).hexdigest(),
        defaults={
            "name": upload.name, "content_type": content_type,
            "content": content, "organisation_id": report.organisation_id,
        },
    )
    return Response(EvidenceSerializer(attachment).data, status=201 if created else 200)


@never_cache
@api_view(["GET"])
def download_evidence(request, reference, attachment_id):
    if request.user.has_role(User.Role.REVIEWER):
        # Pre-v1 reports only. New reports use MED-04, where reviewers see blurred copies.
        accessible = org_scope(request, Report).filter(
            assigned_reviewer=request.user, receipt_code__isnull=True,
        )
    else:
        accessible = own_reports(request)
    attachment = get_object_or_404(
        org_scope(request, Evidence), report__in=accessible.filter(reference=reference), id=attachment_id
    )
    extension = "jpg" if attachment.content_type == "image/jpeg" else "png"
    return FileResponse(
        BytesIO(attachment.content),
        as_attachment=True,
        filename=f"evidence-{attachment.id}.{extension}",
        content_type=attachment.content_type,
    )
