from django.http import JsonResponse

from accounts.observer_auth import endpoint, validation, wat
from staff.audit import authorize

from .models import LateMaterialsRun


RISK_FIELDS = (
    "rank", "lga_code", "lga_name", "ward_code", "ward_name", "polling_unit_code",
    "predicted_transit_hours", "risk", "factors",
)


@endpoint("GET")
def late_materials_risk(request):
    denied = authorize(request, roles={"coordinator"})
    if denied is not None:
        return denied
    try:
        limit = int(request.GET.get("limit", 50))
        if not 1 <= limit <= 100:
            raise ValueError
    except ValueError:
        return validation({"limit": {"code": "invalid", "message": "Use a value from 1 to 100."}})
    run = LateMaterialsRun.objects.filter(
        organisation_id=request.user.organisation_id,
    ).order_by("-generated_at", "-pk").first()
    if run is None:
        return JsonResponse({
            "model_version": None, "generated_at": None, "data_source": None,
            "metrics": {}, "rows": [],
        })
    rows = run.risks.all()
    if state := request.GET.get("state_code"):
        rows = rows.filter(state_code=state)
    return JsonResponse({
        "model_version": run.model_version, "generated_at": wat(run.generated_at),
        "data_source": run.data_source, "metrics": run.metrics,
        "rows": list(rows.values(*RISK_FIELDS)[:limit]),
    })
