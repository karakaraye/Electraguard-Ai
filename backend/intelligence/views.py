from django.db.models import Q
from django.http import JsonResponse

from accounts.observer_auth import endpoint, error, validation, wat
from reports.operations_views import coordinator_required
from accounts.observer_credentials import rate_limit
from reference.models import AreaDataset
from reports.incident_input import field

from .models import MaterialsRisk


@endpoint("GET")
def materials_risk(request):
    user = request.user
    blocked = coordinator_required(request)
    if blocked is not None:
        return blocked
    retry = rate_limit("staff-materials-risk", str(user.public_id), 600, 60)
    if retry is not None:
        return error(429, "rate_limited", "Too many requests. Try again later.", retry=retry)
    try:
        limit = int(request.GET.get("limit", "50"))
        if not 1 <= limit <= 100:
            raise ValueError
    except ValueError:
        return validation({"limit": field("invalid", "Use a limit from 1 to 100.")})

    risks = MaterialsRisk.objects.filter(organisation_id=user.organisation_id)
    latest = risks.order_by("-generated_at").first()
    state = request.GET.get("state_code")
    if state:
        match = Q(state_code__iexact=state)
        reference = AreaDataset.objects.first()
        if reference:
            name = next((item["name"] for item in reference.states.values()
                         if item["state_code"].casefold() == state.casefold()), None)
            if name:
                match |= Q(state_code__iexact=name)
        risks = risks.filter(match)
    rows = risks.order_by("-prediction__predicted_transit_hours", "polling_unit_code")[:limit]
    return JsonResponse({
        "model_version": "gbm-logistics-2026.12",
        "generated_at": wat(latest.generated_at) if latest else None,
        "data_source": "synthetic", "metrics": latest.metrics if latest else {},
        "rows": [{"rank": rank, **row.prediction} for rank, row in enumerate(rows, 1)],
    })
