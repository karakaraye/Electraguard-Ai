from collections import defaultdict
from itertools import combinations
from statistics import mean

import numpy as np
from django.core.management.base import BaseCommand
from sklearn.metrics import brier_score_loss, confusion_matrix, f1_score, mean_absolute_error
from sklearn.metrics import precision_score, recall_score

from intelligence.learning import ROOT, SEED, category_label, csv_rows, incident_models
from intelligence.learning import logistics_features, logistics_model, rank_claims, rumour_label, rumour_models, severe
from intelligence.result_checks import CHECKS, evaluate_sheet
from intelligence.triage import DUPLICATE_THRESHOLD, burst, grams, similarity, urgency


def binary(actual, predicted):
    return (f"precision {precision_score(actual, predicted, zero_division=0):.3f}, "
            f"recall {recall_score(actual, predicted, zero_division=0):.3f}, support {sum(actual)}")


def evaluate():
    category, severity, threshold, test = incident_models()
    texts = [row["description"] for row in test]
    gold = [category_label(row) for row in test]
    probabilities = category.predict_proba(texts)
    choices = category.classes_[probabilities.argmax(axis=1)]
    retained = probabilities.max(axis=1) >= threshold
    accepted_accuracy = (choices[retained] == np.array(gold)[retained]).mean() if retained.any() else None
    rng = np.random.default_rng(SEED)
    bootstrapped = []
    for _ in range(1000):
        sample = rng.integers(0, len(test), len(test))
        bootstrapped.append(f1_score(np.array(gold)[sample], choices[sample],
                                     labels=category.classes_, average="macro", zero_division=0))
    low, high = np.quantile(bootstrapped, [.025, .975])
    yield "# Local model evaluation"
    yield f"Seed {SEED}. Grouped splits reserve 20% for testing and use a separate calibration split."
    yield "## A1–A3 · Incident triage"
    yield f"Held-out incident IDs: {len(test)}. No language field is supplied."
    yield f"Category macro-F1: {f1_score(gold, choices, average='macro'):.3f} (95% bootstrap interval {low:.3f}–{high:.3f})."
    for label, score in zip(category.classes_, f1_score(gold, choices, labels=category.classes_, average=None)):
        yield f"- {label}: F1 {score:.3f}"
    yield "Confusion matrix in the category order above: " + str(confusion_matrix(
        gold, choices, labels=category.classes_,
    ).tolist())
    severe_gold = [severe(row) for row in test]
    priorities = [
        urgency({}, predicted, row["has_photo_evidence"] == "True", False, risk)["value"]
        for row, predicted, risk in zip(test, choices, severity.predict_proba(texts)[:, 1])
    ]
    urgent = [value == "urgent" for value in priorities]
    false_urgent = mean([flag for actual, flag in zip(severe_gold, urgent) if not actual])
    yield f"Urgency: {binary(severe_gold, urgent)}; false-urgent rate {false_urgent:.3f}."
    yield "High or urgent: " + binary(severe_gold, [value in {"high", "urgent"} for value in priorities]) + "."
    yield "Danger, firsthand and cluster labels are unavailable in this dataset."
    accuracy = "undefined" if accepted_accuracy is None else f"{accepted_accuracy:.3f}"
    yield f"Abstention: threshold {threshold:.2f}, rate {1-retained.mean():.3f}, retained accuracy {accuracy}."
    failures = [row["incident_id"] for row, actual, guess, flag in zip(test, gold, choices, retained)
                if actual != guess or not flag]
    yield "Incorrect or abstained example IDs: " + (", ".join(failures[:5]) or "none")
    missed = [row["incident_id"] for row, actual, flag in zip(test, severe_gold, urgent) if actual and not flag]
    yield "Missed high-severity example IDs: " + (", ".join(missed[:5]) or "none")
    yield "## A4 · Duplicate similarity"
    pairs = list(combinations(test, 2))
    # The starter pack lacks duplicate links. Perturb held-out texts and use different-category incidents as distractors.
    positive = [similarity(grams(row["description"]), grams("Witness saw: " + row["description"]))
                >= DUPLICATE_THRESHOLD for row in test]
    negative = [similarity(grams(x["description"]), grams(y["description"])) >= DUPLICATE_THRESHOLD
                for x, y in pairs if x["pu_id"] == y["pu_id"] and x["category"] != y["category"]]
    yield f"Held-out text perturbations and {len(negative)} same-unit distractors: " + binary(
        [True]*len(positive) + [False]*len(negative), positive + negative,
    ) + ". These are proxy cases, without independently labeled paraphrases."
    yield "## A5 · Cluster detector"
    normal = rng.poisson(1, 1000)
    history = rng.poisson(16, 1000)
    flags = [burst(count, past)[0] for count, past in zip(normal, history)]
    injected = [burst(count + 5, past)[0] for count, past in zip(normal[:100], history[:100])]
    yield (f"Seeded stream of 1,000 windows with 100 injected spikes: {sum(injected)}/100 detected, "
           f"{1000*sum(flags)/sum(normal):.2f} false alarms per 1,000 background reports.")
    yield "## A6 · Result-sheet anomalies"
    results = csv_rows("results_synthetic.csv")
    labels = {row["pu_id"]: row["anomaly_type"] for row in csv_rows("anomaly_labels_HELD_OUT.csv")}
    actual, predicted = defaultdict(list), defaultdict(list)
    previous = None
    examples = []
    for row in results:
        sheet = {key: value if key == "pu_id" else int(value) for key, value in row.items()}
        flags = evaluate_sheet(sheet, previous)
        previous = sheet
        truth = labels[row["pu_id"]]
        if set(flags) != ({truth} if truth != "none" else set()):
            examples.append(f"{row['pu_id']} (label {truth}, flags {', '.join(flags) or 'none'})")
        for label in CHECKS:
            actual[label].append(label == truth)
            predicted[label].append(label in flags)
    yield f"Evaluation-only label set: {len(results)} sheets."
    for label in CHECKS:
        yield f"- {label}: {binary(actual[label], predicted[label])}"
    yield f"Alerts per 1,000 sheets: {1000*sum(map(sum, predicted.values()))/len(results):.2f}."
    yield "Disagreements: " + ", ".join(examples[:5])
    yield "## A8 · Claim ranking"
    _, claims = rumour_models()
    scores = rank_claims([row["text"] for row in claims])
    yield f"Held-out claim IDs: {len(claims)}. Targets proxy harm and check-worthiness from veracity and reach."
    for language in sorted({row["language"] for row in claims}):
        for i, target in enumerate(("harm", "check_worthiness")):
            pairs = [(rumour_label(row)[i], score[target]) for row, score in zip(claims, scores)
                     if row["language"] == language]
            truth, likelihood = zip(*pairs)
            yield (f"- {language} {target}: {binary(truth, [p >= .5 for p in likelihood])}; "
                   f"Brier score {brier_score_loss(truth, likelihood):.3f}.")
    misses = [row["claim_id"] for row, score in zip(claims, scores)
              if rumour_label(row)[0] and score["harm"] < .5]
    yield "Missed harm example IDs: " + (", ".join(misses[:5]) or "none")
    yield "## A13 · Transit risk"
    model, _, deliveries = logistics_model()
    predicted_hours = model.predict([logistics_features(row) for row in deliveries])
    actual_hours = np.array([float(row["transit_hours"]) for row in deliveries])
    count = max(1, len(deliveries)//5)
    top_predicted = set(np.argsort(predicted_hours)[-count:])
    top_actual = set(np.argsort(actual_hours)[-count:])
    yield (f"Held-out deliveries grouped by unit: {len(deliveries)}. MAE {mean_absolute_error(actual_hours, predicted_hours):.3f} hours. "
           f"Top-quintile precision {len(top_predicted & top_actual)/count:.3f}.")
    worst = np.argsort(abs(actual_hours - predicted_hours))[-3:][::-1]
    yield "Largest transit errors: " + ", ".join(
        f"{deliveries[i]['pu_id']} ({actual_hours[i]:.2f}h actual, {predicted_hours[i]:.2f}h predicted)" for i in worst
    )


class Command(BaseCommand):
    help = "Evaluate local suggestions on reproducible held-out data."

    def handle(self, *args, **options):
        report = "\n\n".join(evaluate()) + "\n"
        path = ROOT / "docs" / "eval" / "results.md"
        path.parent.mkdir(parents=True, exist_ok=True)
        path.write_text(report, encoding="utf-8")
        self.stdout.write(report)
