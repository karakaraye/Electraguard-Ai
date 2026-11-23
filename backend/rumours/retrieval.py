import re

from django.db.models import OuterRef, Subquery

from accounts.observer_auth import wat
from reports.models import Report, ReviewEvent
from staff.cases import category

from .models import Claim


def tokens(text):
    return set(re.findall(r"[^\W_]{2,}", text.casefold()))


def score(query, text):
    candidate = tokens(text)
    if not candidate:
        return 0
    return round(len(query & candidate) / len(query | candidate), 4)


def observations_for(claim, query):
    closure = ReviewEvent.objects.filter(
        organisation_id=claim.organisation_id, report_id=OuterRef("pk"), action=ReviewEvent.Action.CLOSE,
    ).order_by("-version").values("change__outcome")
    reports = Report.objects.filter(
        organisation_id=claim.organisation_id, status=Report.Status.CLOSED,
    ).annotate(outcome_value=Subquery(closure[:1]))
    matched = []
    for report in reports.iterator():
        details = report.incident_details
        if details.get("kind", "incident") != "incident" or report.outcome_value not in Report.Outcome.values:
            continue
        translation = details.get("translation") or {}
        if translation.get("status") == "ready" and translation.get("redacted") is True:
            text = translation.get("text") or ""
        elif details.get("language") == "en":
            text = details.get("redacted_description") or ""
        else:
            continue
        similarity = score(query, text)
        if similarity <= 0:
            continue
        area = details.get("area") or {}
        matched.append({
            "report_id": str(report.pk), "category": category(report)["value"],
            "area": {key: area.get(key) for key in ("lga_code", "lga_name", "ward_code", "ward_name")},
            "occurred_at": wat(report.occurred_at) if report.occurred_at else None,
            "status": "closed", "outcome": report.outcome_value, "similarity": similarity, "excerpt": text[:280],
        })
    return sorted(matched, key=lambda item: (-item["similarity"], item["report_id"]))[:20]


def similar_claims(claim, query):
    candidates = Claim.objects.filter(organisation_id=claim.organisation_id, status="response_approved").exclude(
        pk=claim.pk,
    ).values("id", "text", "response")
    matches = []
    for candidate in candidates.iterator():
        similarity = score(query, candidate["text"])
        if similarity > 0:
            response = candidate["response"]
            matches.append({
                "claim_id": str(candidate["id"]), "text": candidate["text"], "similarity": similarity,
                "response": {"text": response["text"], "approved_at": response["approved_at"]},
            })
    return sorted(matches, key=lambda item: (-item["similarity"], item["claim_id"]))[:20]
