from django.db import transaction
from django.db.models import Q
from django.http import Http404
from django.shortcuts import get_object_or_404
from django.views.decorators.cache import never_cache
from rest_framework import serializers
from rest_framework.decorators import api_view, parser_classes
from rest_framework.parsers import JSONParser
from rest_framework.response import Response

from .capabilities import GROUPING_ENABLED
from .models import ReviewEvent, Triage, TriageMatch
from .triage import METHOD_VERSION
from .workflow import Conflict, assigned_reports, locked_report, record_change


@never_cache
@api_view(["GET"])
@transaction.atomic
def case_triage(request, reference):
    reports = assigned_reports(request)
    report = get_object_or_404(reports.select_for_update(no_key=True), reference=reference)
    job = Triage.objects.filter(report=report).first()
    if job is None:
        return Response({"status": Triage.Status.PENDING, "method_version": METHOD_VERSION})

    result = {
        "status": job.status, "method_version": job.method_version,
        "attempted_at": job.attempted_at,
    }
    if job.status == Triage.Status.READY:
        result.update({
            "category": job.category,
            "corrected_category": job.corrected_category,
            "categories": dict(Triage.Category.choices),
        })
        if GROUPING_ENABLED:
            matches = TriageMatch.objects.filter(
                Q(first=report) | Q(second=report),
                first__assigned_reviewer=request.user,
                second__assigned_reviewer=request.user,
            ).select_related("first", "second").defer(
                "first__description", "second__description",
            ).order_by("-score", "pk")[:5]
            result["matches"] = [match_summary(match, report.pk) for match in matches]
    return Response(result)


def match_summary(match, reference):
    candidate = match.second if match.first_id == reference else match.first
    return {
        "reference": candidate.reference,
        "location": candidate.location,
        "occurred_at": candidate.occurred_at,
        "decision": match.decision,
    }


class FeedbackVersion(serializers.Serializer):
    version = serializers.IntegerField(min_value=0)


class CategoryCorrection(FeedbackVersion):
    category = serializers.ChoiceField(choices=Triage.Category.choices)


class MatchDecision(FeedbackVersion):
    decision = serializers.ChoiceField(
        choices=[TriageMatch.Decision.CONFIRMED, TriageMatch.Decision.DISMISSED]
    )


def ready_job(reference):
    job = Triage.objects.filter(report_id=reference, status=Triage.Status.READY).first()
    if job is None:
        raise Conflict("Triage suggestions are unavailable for this case.")
    return job


@never_cache
@api_view(["POST"])
@parser_classes([JSONParser])
@transaction.atomic
def correct_category(request, reference):
    reports = assigned_reports(request)
    serializer = CategoryCorrection(data=request.data)
    serializer.is_valid(raise_exception=True)
    data = serializer.validated_data
    report = locked_report(reports, reference, data["version"])
    job = ready_job(reference)
    previous = job.corrected_category or job.category
    if previous == data["category"]:
        raise Conflict("This category is already selected.")
    job.corrected_category = data["category"]
    job.save(update_fields=["corrected_category"])
    record_change(report, request.user, ReviewEvent.Action.CORRECT_CATEGORY, {
        "previous_category": previous, "category": job.corrected_category,
    })
    return Response({"version": report.version})


@never_cache
@api_view(["POST"])
@parser_classes([JSONParser])
@transaction.atomic
def decide_match(request, reference, candidate):
    reports = assigned_reports(request)
    if not GROUPING_ENABLED:
        raise Http404
    serializer = MatchDecision(data=request.data)
    serializer.is_valid(raise_exception=True)
    data = serializer.validated_data
    # Hold both report locks in a consistent order so neither assignment can change.
    locked = list(reports.filter(pk__in=[reference, candidate]).order_by("pk").select_for_update())
    if len(locked) != 2:
        raise Http404
    first, second = locked
    report = first if first.pk == reference else second
    if report.version != data["version"]:
        raise Conflict("This case has changed. Refresh before trying again.")
    ready_job(reference)
    match = get_object_or_404(TriageMatch, first=first, second=second)
    if match.decision != TriageMatch.Decision.PENDING:
        raise Conflict("This match already has a Reviewer decision.")
    match.decision = data["decision"]
    match.save(update_fields=["decision"])
    record_change(report, request.user, ReviewEvent.Action.DECIDE_MATCH, {
        "candidate": str(candidate), "match_decision": match.decision,
    })
    return Response({"version": report.version})
