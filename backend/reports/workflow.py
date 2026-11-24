from django.db import transaction
from django.db.models import Prefetch
from django.shortcuts import get_object_or_404
from django.views.decorators.cache import never_cache
from rest_framework.decorators import api_view, parser_classes
from rest_framework.exceptions import APIException, ValidationError
from rest_framework.parsers import JSONParser
from rest_framework.response import Response

from accounts.models import User
from accounts.organisations import org_scope
from accounts.permissions import require_role

from .media_lifecycle import cancel_report_uploads
from .models import Report, ReviewEvent
from .serializers import (
    AssignmentSerializer,
    AssignmentSummarySerializer,
    ClarificationSerializer,
    ReportSerializer,
    ReviewActionSerializer,
    ReviewCaseSerializer,
)
from .views import own_reports, with_attachment_metadata

Action = ReviewEvent.Action
Status = Report.Status

TRANSITIONS = {
    Action.START: (Status.SUBMITTED, Status.IN_REVIEW),
    Action.REQUEST_CLARIFICATION: (Status.IN_REVIEW, Status.NEEDS_CLARIFICATION),
    Action.RESPOND: (Status.NEEDS_CLARIFICATION, Status.IN_REVIEW),
    Action.CLOSE: (Status.IN_REVIEW, Status.CLOSED),
}


class Conflict(APIException):
    status_code = 409


def assigned_reports(request):
    require_role(request.user, User.Role.REVIEWER)
    return org_scope(request, Report).filter(assigned_reviewer=request.user)


def locked_report(queryset, reference, version):
    report = get_object_or_404(queryset.select_for_update(), reference=reference)
    if report.version != version:
        raise Conflict("This case has changed. Refresh before trying again.")
    return report


def record_change(report, actor, action, change, field=None):
    # The calling view holds the report lock until both changes are committed.
    report.version += 1
    report.save(update_fields=["version", field] if field else ["version"])
    ReviewEvent.objects.create(
        report=report, organisation_id=report.organisation_id, actor=actor, action=action, version=report.version, change=change
    )
    if action in (Action.START, Action.REQUEST_CLARIFICATION, Action.CLOSE):
        try:
            from clocks.calculator import stop_clock, pause_clock
            if action == Action.REQUEST_CLARIFICATION:
                pause_clock(report)
            stop_clock(report)
        except Exception:
            pass
    elif action == Action.RESPOND:
        try:
            from clocks.calculator import resume_clock
            resume_clock(report)
        except Exception:
            pass


def closure_snapshot(report):
    snapshot = {"attachment_ids": [
        str(attachment_id) for attachment_id in report.attachments.filter(organisation_id=report.organisation_id).values_list("id", flat=True)
    ]}
    pending = cancel_report_uploads(report)
    media = [
        # A recording still being processed is identified by its verified upload hash.
        {"id": str(pk), "sha256": digest} if digest else {"id": str(pk), "original_sha256": original, "status": status}
        for pk, digest, original, status in report.media_items.filter(organisation_id=report.organisation_id)
        .order_by("pk").values_list("pk", "sha256", "original_sha256", "status")
    ]
    if media or pending:
        snapshot.update(media_ids=media, pending_uploads=pending)
    return snapshot


def transition(report, actor, action, data):
    before, after = TRANSITIONS[action]
    if report.status != before:
        raise Conflict("This action is unavailable for the current case status.")
    change = {"from_status": before, "to_status": after}
    change.update({field: data[field] for field in ("note", "outcome") if field in data})
    if action == Action.CLOSE:
        change.update(closure_snapshot(report))
    report.status = after
    record_change(report, actor, action, change, "status")
    return Response({"version": report.version, "status": report.status})


@never_cache
@api_view(["GET"])
def assignments(request):
    require_role(request.user, User.Role.ADMINISTRATOR)
    reports = org_scope(request, Report).exclude(status__in=[Status.CLOSED, Status.WITHDRAWN]).select_related("assigned_reviewer")
    reviewers = org_scope(request, User).filter(User.with_role(User.Role.REVIEWER), is_active=True).order_by("email")
    return Response({
        "reports": AssignmentSummarySerializer(reports, many=True).data,
        "reviewers": list(reviewers.values("id", "email")),
    })


@never_cache
@api_view(["POST"])
@parser_classes([JSONParser])
@transaction.atomic
def assign(request, reference):
    require_role(request.user, User.Role.ADMINISTRATOR)
    serializer = AssignmentSerializer(data=request.data)
    serializer.is_valid(raise_exception=True)
    data = serializer.validated_data
    report = locked_report(org_scope(request, Report), reference, data["version"])
    if report.status in (Status.CLOSED, Status.WITHDRAWN):
        raise Conflict("A closed case cannot be reassigned.")
    reviewer = org_scope(request, User).select_for_update().filter(
        User.with_role(User.Role.REVIEWER), pk=data["reviewer"], is_active=True
    ).first()
    if reviewer is None:
        raise ValidationError("Select an active Reviewer.")
    if report.assigned_reviewer_id == reviewer.pk:
        raise Conflict("This Reviewer already has the case.")
    previous = report.assigned_reviewer
    report.assigned_reviewer = reviewer
    record_change(report, request.user, Action.ASSIGN, {
        "previous_reviewer": previous.email if previous else None,
        "reviewer": reviewer.email,
    }, "assigned_reviewer")
    return Response(AssignmentSummarySerializer(report).data)


@never_cache
@api_view(["GET"])
def review_queue(request):
    return Response(ReportSerializer(assigned_reports(request), many=True, context={"staff": True}).data)


@never_cache
@api_view(["GET"])
@transaction.atomic
def review_case(request, reference):
    report = get_object_or_404(with_attachment_metadata(request, assigned_reports(request).select_for_update()).prefetch_related(
        Prefetch("review_events", queryset=org_scope(request, ReviewEvent).select_related("actor", "citizen_reply"))
    ), reference=reference)
    return Response(ReviewCaseSerializer(report, context={"reviewer": request.user, "request": request}).data)


@never_cache
@api_view(["POST"])
@parser_classes([JSONParser])
@transaction.atomic
def review_action(request, reference):
    queryset = assigned_reports(request)
    serializer = ReviewActionSerializer(data=request.data)
    serializer.is_valid(raise_exception=True)
    data = serializer.validated_data
    report = locked_report(queryset, reference, data["version"])
    return transition(report, request.user, data["action"], data)


@never_cache
@api_view(["POST"])
@parser_classes([JSONParser])
@transaction.atomic
def clarify(request, reference):
    queryset = own_reports(request)
    serializer = ClarificationSerializer(data=request.data)
    serializer.is_valid(raise_exception=True)
    data = serializer.validated_data
    report = locked_report(queryset, reference, data["version"])
    return transition(report, request.user, Action.RESPOND, data)
