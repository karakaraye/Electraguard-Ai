import csv
from collections import Counter, defaultdict
from datetime import timedelta
from itertools import combinations
from pathlib import Path

from django.core.management.base import BaseCommand, CommandError

from reports.models import Triage
from reports.triage import METHOD_VERSION, categorize, duplicate_score, tokens

DATASET = Path(__file__).resolve().parents[4] / "evaluation" / "synthetic_triage.csv"


def percentage(correct, total):
    return f"{correct / total:.1%} ({correct}/{total})" if total else "undefined (0/0)"


class Command(BaseCommand):
    help = "Evaluate the unchanged triage method on held-out labeled synthetic reports."

    def handle(self, *args, **options):
        with DATASET.open(encoding="utf-8", newline="") as source:
            rows = list(csv.DictReader(source))
        splits = defaultdict(set)
        for row in rows:
            splits[row["incident"]].add(row["split"])
        if any(len(split) != 1 for split in splits.values()):
            raise CommandError("An incident crosses evaluation splits.")
        heldout = [row for row in rows if row["split"] == "heldout"]
        incidents = len({row["incident"] for row in heldout})
        self.stdout.write(
            f"Synthetic held-out evaluation | {METHOD_VERSION} | "
            f"{len(rows) - len(heldout)} development reports | {len(heldout)} held-out reports, {incidents} incidents"
        )
        actual, predicted, correct = Counter(), Counter(), Counter()
        category_errors = []
        for row in heldout:
            label = categorize(row["description"])
            actual[row["category"]] += 1
            predicted[label] += 1
            if label == row["category"]:
                correct[label] += 1
            else:
                category_errors.append(f"{row['id']}: expected {row['category']}, suggested {label}")
        for category in Triage.Category.values:
            self.stdout.write(
                f"{category}: support {actual[category]}; "
                f"precision {percentage(correct[category], predicted[category])}; "
                f"recall {percentage(correct[category], actual[category])}"
            )

        outcomes = Counter()
        errors = defaultdict(list)
        for left, right in combinations(heldout, 2):
            same_incident = left["incident"] == right["incident"]
            gap = timedelta(minutes=abs(int(left["minutes"]) - int(right["minutes"])))
            score = duplicate_score(
                gap, set(tokens(left["location"])), tokens(left["description"]),
                set(tokens(right["location"])), tokens(right["description"]),
            )
            suggested = score is not None
            outcomes[same_incident, suggested] += 1
            if same_incident != suggested:
                errors[same_incident].append(f"{left['id']}–{right['id']}")
        tp, fp, fn = outcomes[True, True], outcomes[False, True], outcomes[True, False]
        self.stdout.write(
            f"Duplicate pairs: {sum(outcomes.values())}; positives {tp + fn}; negatives {sum(outcomes.values()) - tp - fn}; "
            f"precision {percentage(tp, tp + fp)}; recall {percentage(tp, tp + fn)}"
        )
        self.stdout.write("Category errors: " + (", ".join(category_errors) or "none"))
        self.stdout.write("False positive pairs: " + (", ".join(errors[False][:5]) or "none"))
        self.stdout.write("Missed duplicate pairs: " + (", ".join(errors[True][:5]) or "none"))
