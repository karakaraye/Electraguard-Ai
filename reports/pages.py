from datetime import timedelta

from django.contrib.auth.decorators import login_required, permission_required
from django.shortcuts import render
from django.utils import timezone
from django.views.decorators.cache import never_cache
from django.views.decorators.http import require_GET

from .models import Report, ReportLink


@require_GET
def observer(request):
    return render(request, "reports/observer.html")


@require_GET
def worker(request):
    response = render(request, "reports/sw.js", content_type="application/javascript")
    response["Cache-Control"] = "no-cache"
    return response


@never_cache
@require_GET
@login_required(login_url="/review/sign-in/")
@permission_required("reports.view_report", raise_exception=True)
def reviewer(request):
    return render(request, "reports/reviewer.html", {
        "can_assign": request.user.has_perm("reports.assign_report"),
    })


@never_cache
@require_GET
@login_required(login_url="/review/sign-in/")
@permission_required(("reports.view_report", "reports.assign_report"), raise_exception=True)
def assignments(request):
    return render(request, "reports/reviewer.html", {"can_assign": True, "assignments": True})


@never_cache
@require_GET
@login_required(login_url="/review/sign-in/")
@permission_required(("reports.view_report", "reports.assign_report"), raise_exception=True)
def overview(request):
    days = 30 if request.GET.get("days") == "30" else 7
    window = Report.objects.filter(received_at__gte=timezone.now() - timedelta(days=days))
    rows = list(window.values_list("pk", "status", "assigned_to_id"))
    groups = {pk: pk for pk, _, _ in rows}
    counts = {status: 0 for status in Report.Status.values}

    def root(key):
        while groups[key] != key:
            groups[key] = groups[groups[key]]
            key = groups[key]
        return key

    links = ReportLink.objects.filter(
        decision=ReportLink.Decision.LINKED, first__in=window, second__in=window,
    ).values_list("first_id", "second_id")
    distinct = len(rows)
    for first, second in links.iterator():
        if first not in groups or second not in groups:
            continue
        left, right = root(first), root(second)
        if left != right:
            groups[right] = left
            distinct -= 1
    unassigned = 0
    for _, status, assignee in rows:
        counts[status] += 1
        unassigned += assignee is None and status != Report.Status.CLOSED
    return render(request, "reports/overview.html", {
        "days": days, "received": len(rows), "distinct": distinct,
        "counts": counts, "unassigned": unassigned,
    })
