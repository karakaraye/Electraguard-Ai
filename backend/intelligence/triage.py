from collections import Counter
from datetime import timedelta
from math import sqrt

from django.db import transaction
from django.db.models import Q
from django.utils import timezone

from reports.models import Report, Triage, TriageMatch
from privacy.redactor import safe_text

from .learning import incident_models

VERSIONS = {"category": "tfidf-lr-2026.13", "urgency": "rules+lr-2026.13", "duplicates": "char-3gram-2026.12"}
WINDOW = timedelta(minutes=90)
BASELINE_WINDOWS = 16
DUPLICATE_THRESHOLD = .65


def grams(text):
    text = " ".join(text.casefold().split())
    return Counter(text[index:index + 3] for index in range(len(text) - 2))


def similarity(left, right):
    denominator = sqrt(sum(x*x for x in left.values()) * sum(x*x for x in right.values()))
    return sum(count * right[part] for part, count in left.items()) / denominator if denominator else 0


def burst(count, history, windows=BASELINE_WINDOWS):
    baseline = history / windows
    return count >= max(4, 3 * baseline), baseline


def urgency(details, category, evidence, cluster, severity, threshold=.5):
    """Score rules plus the text model's severity probability. Missing an urgent case costs most, so
    each strong signal (danger, violence, a high severity score) is enough on its own."""
    factors = [
        (details.get("danger_now") is True, 5, "Immediate danger reported"),
        (category == "intimidation_violence", 3, "Threats or violence reported"),
        (severity >= threshold, 3, "Text resembles higher-severity reports"),
        (details.get("firsthand") is True, 1, "Seen firsthand"),
        (evidence, 1, "Evidence attached"),
        (cluster, 1, "Local spike in similar reports"),
    ]
    score = sum(weight for active, weight, _ in factors if active)
    value = "urgent" if score >= 3 else "high" if score == 2 else "normal" if score else "low"
    reasons = [reason for active, _, reason in factors if active]
    return {"value": value, "confidence": "medium", "reasons": reasons or ["No urgency signals detected"]}


def active_reports(report):
    return Report.objects.filter(organisation_id=report.organisation_id).exclude(
        status=Report.Status.WITHDRAWN,
    )


def visible_description(report):
    return safe_text(report)


def suggest_duplicates(report, area):
    ward = area.get("ward_code")
    if not ward or not report.occurred_at:
        return
    samples = active_reports(report).exclude(pk=report.pk).filter(
        incident_details__area__ward_code=ward,
        occurred_at__range=(report.occurred_at - WINDOW, report.occurred_at + WINDOW),
    ).order_by("pk")
    source = grams(visible_description(report))
    for peer in samples.select_for_update(no_key=True, skip_locked=True):
        if peer.incident_details.get("simulated", False) != report.incident_details.get("simulated", False):
            continue
        score = similarity(source, grams(visible_description(peer)))
        if score >= DUPLICATE_THRESHOLD:
            first, second = sorted((report.pk, peer.pk))
            TriageMatch.objects.get_or_create(
                organisation_id=report.organisation_id, first_id=first, second_id=second,
                defaults={"score": score},
            )


def suggest_cluster(report, area, category):
    if not category or not area.get("lga_code") or report.incident_details.get("simulated"):
        return False
    end = report.created_at.replace(minute=0, second=0, microsecond=0) + timedelta(hours=1)
    start = end - WINDOW
    candidates = active_reports(report).filter(
        Q(incident_details__simulated=False) | Q(incident_details__simulated__isnull=True),
        incident_details__area__lga_code=area["lga_code"],
        incident_details__category_observer=category,
    )
    count = candidates.filter(created_at__gte=start, created_at__lt=end).count()
    history = candidates.filter(created_at__gte=start - WINDOW * BASELINE_WINDOWS, created_at__lt=start).count()
    flagged, baseline = burst(count, history)
    return flagged


@transaction.atomic
def process_next():
    # Lock the report first, matching the lock order used by withdrawal.
    report = Report.objects.filter(
        receipt_code__isnull=False, triage__status=Triage.Status.PENDING,
    ).exclude(status=Report.Status.WITHDRAWN).select_for_update(
        of=("self",), no_key=True, skip_locked=True,
    ).order_by("created_at").first()
    if report is None:
        return False
    job = Triage.objects.get(report=report, organisation_id=report.organisation_id)
    try:
        with transaction.atomic():
            write_suggestions(report, job)
    except (OSError, ValueError, KeyError, TypeError):
        job.status = Triage.Status.FAILED
        job.attempted_at = timezone.now()
        job.save(update_fields=["status", "attempted_at"])
    return job.status


def write_suggestions(report, job):
    models = incident_models()
    category, severity, threshold = models.category, models.severity, models.abstain
    description = visible_description(report)
    probabilities = category.predict_proba([description])[0]
    confidence = float(probabilities.max())
    value = str(category.classes_[probabilities.argmax()]) if confidence >= threshold else None
    details = report.incident_details
    area = details.get("area") or {}
    suggest_duplicates(report, area)
    cluster = suggest_cluster(report, area, details.get("category_observer"))
    risk = severity.predict_proba([description])[0, 1]
    job.suggestions = {
        **job.suggestions,
        "status": "ready", "model_versions": VERSIONS, "abstained": value is None,
        "category": {
            "value": value, "confidence": "high" if confidence >= .8 else "medium" if value else "low",
            "reasons": ["Local text classifier"] if value else ["Needs a person"],
            "decision": None, "corrected_value": None,
        },
        "urgency": {"decision": None, "corrected_value": None, **urgency(details, value or details.get("category_observer"),
                           report.attachments.filter(organisation_id=report.organisation_id).exists()
                           or report.media_items.filter(organisation_id=report.organisation_id).exists(),
                           cluster, risk, models.urgency_threshold)},
    }
    job.status = Triage.Status.READY
    job.method_version = VERSIONS["category"]
    job.attempted_at = timezone.now()
    job.save(update_fields=["status", "attempted_at", "suggestions", "method_version"])
