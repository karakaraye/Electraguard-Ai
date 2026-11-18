from collections import Counter
from datetime import datetime, time
from zoneinfo import ZoneInfo

from django.views.decorators.cache import never_cache
from rest_framework import serializers
from rest_framework.decorators import api_view
from rest_framework.response import Response

from accounts.models import User
from accounts.permissions import require_role

from .models import Report, Triage, TriageMatch


class DateFilters(serializers.Serializer):
    start = serializers.DateField(required=False)
    end = serializers.DateField(required=False)

    def validate(self, dates):
        if dates.get("start") and dates.get("end") and dates["start"] > dates["end"]:
            raise serializers.ValidationError("The start date must be on or before the end date.")
        return dates


def incident_count(selected, links):
    parents = {}

    def root(report):
        while report in parents:
            report = parents[report]
        return report

    sizes = Counter()
    for first, second in links:
        first, second = root(first), root(second)
        if first != second:
            if sizes[first] < sizes[second]:
                first, second = second, first
            parents[second] = first
            sizes[first] += sizes.pop(second, 0) + 1
    return len({root(reference) for reference in selected})


@never_cache
@api_view(["GET"])
def dashboard(request):
    require_role(request.user, User.Role.ADMINISTRATOR)
    filters = DateFilters(data=request.query_params)
    filters.is_valid(raise_exception=True)
    dates = filters.validated_data
    reports = Report.objects.all()
    for field, date in dates.items():
        comparison = "gte" if field == "start" else "lte"
        boundary = time.min if field == "start" else time.max
        reports = reports.filter(**{
            f"occurred_at__{comparison}": datetime.combine(date, boundary, ZoneInfo("Africa/Lagos"))
        })
    rows = list(reports.order_by().values_list(
        "reference", "status", "triage__corrected_category", "triage__category"
    ))
    statuses = Counter(status for _, status, _, _ in rows)
    categories = Counter(corrected or suggested or "uncategorized" for _, _, corrected, suggested in rows)
    links = TriageMatch.objects.filter(
        decision=TriageMatch.Decision.CONFIRMED
    ).values_list("first_id", "second_id").iterator()
    return Response({
        "report_count": len(rows),
        "incident_count": incident_count((row[0] for row in rows), links) if rows else 0,
        "statuses": [{"label": label, "count": statuses[key]} for key, label in Report.Status.choices],
        "categories": [
            {"label": label, "count": categories[key]}
            for key, label in [*Triage.Category.choices, ("uncategorized", "Uncategorized")]
        ],
    })
