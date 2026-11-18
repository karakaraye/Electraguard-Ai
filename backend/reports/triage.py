"""Local text-only triage using synthetic examples and lexical similarity."""

import re
from collections import Counter
from datetime import timedelta
from math import sqrt

from django.db import transaction
from django.utils import timezone

from .models import Report, Triage, TriageMatch

METHOD_VERSION = "local-lexical-v1"
WINDOW = timedelta(minutes=90)
Category = Triage.Category

# Labeled synthetic examples for a nearest-example category baseline.
EXAMPLES = {
    Category.ACCESS: (
        "wheelchair users could not enter because the ramp was blocked",
        "a locked entrance gate prevented observers from entering",
        "the queue blocked the accessible entrance",
    ),
    Category.MATERIALS: (
        "ballot papers arrived late and the polling station ran out of forms",
        "the accreditation device stopped working and staff requested replacement equipment",
        "the seal on the materials box was damaged",
    ),
    Category.PROCEDURE: (
        "polling staff opened later than scheduled and did not explain the delay",
        "observers could not hear the counting procedure instructions",
        "the log omitted the time and staff repeated the accreditation steps",
    ),
    Category.CONDUCT: (
        "a staff member threatened an observer at the gate",
        "a crowd argued and pushed people near the entrance",
        "an observer reported intimidation or harassment",
    ),
}
STOP_WORDS = frozenset("a an and at by for from in is it of on or that the to was were with".split())


def tokens(value):
    return Counter(word for word in re.findall(r"\w+", value.casefold()) if word not in STOP_WORDS)


def cosine(left, right):
    denominator = sqrt(sum(n * n for n in left.values()) * sum(n * n for n in right.values()))
    return sum(n * right[word] for word, n in left.items()) / denominator if denominator else 0


EXAMPLE_TOKENS = {
    category: [tokens(example) for example in examples] for category, examples in EXAMPLES.items()
}


def categorize(description):
    words = tokens(description)
    scores = {
        category: max(cosine(words, sample) for sample in samples)
        for category, samples in EXAMPLE_TOKENS.items()
    }
    category = max(scores, key=scores.get)
    return category if scores[category] >= 0.30 else Category.OTHER


def duplicate_score(time_gap, location, words, other_location, other_words):
    if time_gap > WINDOW:
        return None
    union = location | other_location
    location_score = len(location & other_location) / len(union) if union else 0
    text_score = cosine(words, other_words)
    if location_score < 0.6 or text_score < 0.55:
        return None
    time_score = 1 - time_gap / WINDOW
    return (location_score + text_score + time_score) / 3


def shortlist(report):
    location = set(tokens(report.location))
    words = tokens(report.description)
    candidates = Report.objects.filter(
        occurred_at__range=(report.occurred_at - WINDOW, report.occurred_at + WINDOW),
    ).exclude(pk=report.pk).values_list("reference", "occurred_at", "location", "description")
    pairs = []
    for reference, occurred_at, label, description in candidates.iterator():
        score = duplicate_score(
            abs(occurred_at - report.occurred_at), location, words,
            set(tokens(label)), tokens(description),
        )
        if score is not None:
            first, second = sorted((report.pk, reference))
            pairs.append((first, second, score))
    return sorted(pairs)


@transaction.atomic
def process_next():
    job = Triage.objects.select_for_update(skip_locked=True).filter(
        status=Triage.Status.PENDING, method_version=METHOD_VERSION,
    ).order_by("pk").first()
    if job is None:
        return None

    job.attempted_at = timezone.now()
    try:
        with transaction.atomic():
            report = Report.objects.only("reference", "occurred_at", "location", "description").get(pk=job.report_id)
            category = categorize(report.description)
            for first, second, score in shortlist(report):
                TriageMatch.objects.get_or_create(
                    first_id=first, second_id=second, defaults={"score": score},
                )
    except Exception:
        # Roll back any partial matches. The worker can retry this job explicitly.
        job.status = Triage.Status.FAILED
    else:
        job.category = category
        job.status = Triage.Status.READY

    job.save(update_fields=["attempted_at", "category", "status"])
    return job.status
