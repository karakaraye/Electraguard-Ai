from collections import Counter, defaultdict
from itertools import combinations
from statistics import mean

import numpy as np
from django.core.management.base import BaseCommand
from sklearn.metrics import brier_score_loss, confusion_matrix, f1_score, mean_absolute_error
from sklearn.metrics import precision_score, recall_score

from intelligence.learning import ROOT, SEED, URGENCY_RECALL_TARGET, authored_rows, category_label, csv_rows
from intelligence.learning import incident_models, normalise_description
from intelligence.learning import logistics_features, logistics_model, rank_claims, rumour_label, rumour_models, severe
from intelligence.result_checks import CHECKS, evaluate_sheet
from intelligence.triage import DUPLICATE_THRESHOLD, burst, grams, similarity, urgency


def binary(actual, predicted):
    return (f"precision {precision_score(actual, predicted, zero_division=0):.3f}, "
            f"recall {recall_score(actual, predicted, zero_division=0):.3f}, support {sum(actual)}")


def table(header, rows):
    lines = ["| " + " | ".join(header) + " |", "|" + "---|" * len(header)]
    return "\n".join(lines + ["| " + " | ".join(str(cell) for cell in row) + " |" for row in rows])


def prf(actual, predicted):
    precision = precision_score(actual, predicted, zero_division=0)
    recall = recall_score(actual, predicted, zero_division=0)
    f1 = f1_score(actual, predicted, zero_division=0)
    return f"{precision:.3f}", f"{recall:.3f}", f"{f1:.3f}"


def bootstrap_interval(rng, gold, choices, labels):
    gold, choices = np.array(gold), np.array(choices)
    scores = []
    for _ in range(1000):
        sample = rng.integers(0, len(gold), len(gold))
        scores.append(f1_score(gold[sample], choices[sample], labels=labels, average="macro", zero_division=0))
    return np.quantile(scores, [.025, .975])


def category_section(models, rng):
    category = models.category
    labels = list(category.classes_)
    yield "## A1 · Category triage"
    pack = csv_rows("incident_reports_synthetic.csv")
    templates = Counter(normalise_description(row["description"]) for row in pack)
    train_templates = {normalise_description(row["description"]) for row in models.train}
    test_templates = {normalise_description(row["description"]) for row in models.test}
    yield (f"**Leakage audit.** The pack has {len(pack)} incidents but only {len({r['description'] for r in pack})} distinct "
           f"descriptions, and only **{len(templates)} distinct descriptions once place names are removed** (one per category). "
           f"{len(test_templates & train_templates)} of the {len(test_templates)} templates in the held-out incident split also appear in "
           "training, so a row-level split measures memorisation of a template, not generalisation. Splitting by "
           "description is impossible with one template per category, so the pack-only score is reported as a memorisation check "
           "and the **robustness set is the headline number**.")
    yield "Templates after removing place names: " + "; ".join(f"\"{text}\" x{count}" for text, count in templates.most_common())
    texts = [row["description"] for row in models.test]
    gold = [category_label(row) for row in models.test]
    choices = category.classes_[category.predict_proba(texts).argmax(axis=1)]
    yield (f"**Memorisation check (leaky by construction).** {len(models.test)} held-out pack incidents, category macro-F1 "
           f"{f1_score(gold, choices, average='macro'):.3f}. Do not read this as accuracy on real reports.")
    robust = models.robustness
    texts = [row["description"] for row in robust]
    gold = [row["category"] for row in robust]
    probabilities = category.predict_proba(texts)
    choices = category.classes_[probabilities.argmax(axis=1)]
    retained = probabilities.max(axis=1) >= models.abstain
    low, high = bootstrap_interval(rng, gold, choices, labels)
    yield ("**Robustness set (headline).** "
           f"{len(robust)} hand-written synthetic examples (typos, paraphrase, Pidgin, code-switched Pidgin/Hausa), "
           f"in `data/synthetic/incident_paraphrases_authored.csv`, never used for training or tuning. Category macro-F1 "
           f"{f1_score(gold, choices, average='macro'):.3f} (95% bootstrap interval {low:.3f}-{high:.3f}); "
           f"accuracy {np.mean(choices == np.array(gold)):.3f}. Training data: {len(labels)} de-duplicated pack templates plus "
           f"{len(authored_rows('train'))} hand-written paraphrases. Hand-written authors share the pack's vocabulary, "
           "so real citizen text will score lower still.")
    per_class = zip(labels, *(f1_score(gold, choices, labels=labels, average=None),
                              precision_score(gold, choices, labels=labels, average=None, zero_division=0),
                              recall_score(gold, choices, labels=labels, average=None, zero_division=0)))
    yield "Per category on the robustness set:\n\n" + table(
        ["category", "F1", "precision", "recall"], [(l, f"{f:.3f}", f"{p:.3f}", f"{r:.3f}") for l, f, p, r in per_class])
    kinds = sorted({row["kind"] for row in robust})
    yield "Per slice (kind of text):\n\n" + table(["kind", "n", "accuracy", "macro-F1"], [
        (kind, sum(r["kind"] == kind for r in robust),
         f"{np.mean([c == g for r, c, g in zip(robust, choices, gold) if r['kind'] == kind]):.3f}",
         f"{f1_score([g for r, g in zip(robust, gold) if r['kind'] == kind], [c for r, c in zip(robust, choices) if r['kind'] == kind], average='macro', zero_division=0):.3f}")
        for kind in kinds])
    yield "Confusion matrix in the category order " + ", ".join(labels) + ": " + str(
        confusion_matrix(gold, choices, labels=labels).tolist())
    accepted = (choices[retained] == np.array(gold)[retained]).mean() if retained.any() else None
    yield (f"**A3 abstention.** Threshold {models.abstain:.2f} chosen on {len(authored_rows('calibration'))} hand-written calibration "
           f"examples. On the robustness set the rate is {1-retained.mean():.3f}; retained accuracy "
           f"{'undefined' if accepted is None else f'{accepted:.3f}'}.")
    failures = [f"- \"{row['description']}\" ({row['kind']}): gold {g}, predicted {c}, confidence {p:.2f}"
                for row, g, c, p, keep in zip(robust, gold, choices, probabilities.max(axis=1), retained) if g != c or not keep]
    yield "Failure or abstention examples (robustness set):\n\n" + ("\n".join(failures[:12]) or "none")
    yield "Robustness set descriptions and predictions:\n\n" + "\n".join(
        f"- [{row['kind']}] {row['description']} -> {c}" for row, c in zip(robust, choices))


def urgency_section(models):
    category, severity, test = models.category, models.severity, models.test
    yield "## A2 · Urgency"
    yield (f"Urgent means severity 3 or 4 in the pack. Missing an urgent case is the costly error, so the cut-off is "
           f"the highest severity probability whose recall on the validation split ({len(models.validation)} incidents) reaches "
           f"{URGENCY_RECALL_TARGET:.0%}; it is {models.urgency_threshold:.3f} and was never tuned on the held-out incidents. "
           "Rules lift urgency regardless of the model: danger now (+5), threats or violence (+3), a high severity score (+3), "
           "firsthand, evidence attached and a local spike (+1 each); score 3 or more is urgent, 2 is high.")

    def predict(rows):
        texts = [row["description"] for row in rows]
        names = category.classes_[category.predict_proba(texts).argmax(axis=1)]
        risks = severity.predict_proba(texts)[:, 1]
        return [urgency({}, name, row["has_photo_evidence"] == "True", False, risk, models.urgency_threshold)["value"]
                for row, name, risk in zip(rows, names, risks)]

    def report(title, rows):
        actual = [severe(row) for row in rows]
        flagged = [value == "urgent" for value in predict(rows)]
        negatives = [flag for truth, flag in zip(actual, flagged) if not truth]
        yield (f"**{title}** ({len(rows)} incidents, {sum(actual)} urgent): precision/recall/F1 "
               + " / ".join(prf(actual, flagged)) + f"; false-urgent rate {mean(negatives):.3f}; "
               f"flagged {sum(flagged)} of {len(rows)}.")
        return actual, flagged

    yield from report("Validation split", models.validation)
    actual, flagged = yield from report("Held-out incidents", test)
    elevated = [value in {"high", "urgent"} for value in predict(test)]
    yield "High or urgent on held-out incidents: precision/recall/F1 " + " / ".join(prf(actual, elevated)) + "."
    categories = [category_label(row) for row in test]
    yield "Per slice (pack category) on held-out incidents:\n\n" + table(
        ["category", "n", "urgent in pack", "flagged", "recall"], [
            (name, categories.count(name), sum(a for a, c in zip(actual, categories) if c == name),
             sum(f for f, c in zip(flagged, categories) if c == name),
             (f"{np.mean([f for a, f, c in zip(actual, flagged, categories) if c == name and a]):.3f}"
              if any(a for a, c in zip(actual, categories) if c == name) else "n/a"))
            for name in sorted(set(categories))])
    yield ("Remaining misses are incidents whose text is identical to non-urgent ones (the pack gives the same text different "
           "severities, for example information gaps run from 1 to 3), so no text model can separate them; the false-urgent rate "
           "above is the price paid for recall. Danger, firsthand and cluster labels are absent from the pack, so those rules are "
           "covered by unit tests, not by metrics.")
    held = {row["incident_id"]: row for row in test}
    missed = [f"{row['incident_id']} (severity {row['severity_0_4']}, {row['category']})"
              for row, truth, flag in zip(test, actual, flagged) if truth and not flag]
    wrong = [f"{row['incident_id']} (severity {row['severity_0_4']}, {row['category']})"
             for row, truth, flag in zip(test, actual, flagged) if flag and not truth]
    yield "Missed urgent incidents: " + (", ".join(missed[:8]) or "none")
    yield "False-urgent examples: " + (", ".join(wrong[:8]) or "none") + f" (held-out descriptions: {len(held)} incidents, "\
        + str(len({normalise_description(row['description']) for row in test})) + " templates)."
    yield "Held-out test-set descriptions (one per template): " + "; ".join(sorted({
        normalise_description(row["description"]) for row in test}))


def evaluate():
    models = incident_models()
    rng = np.random.default_rng(SEED)
    yield "# Local model evaluation"
    yield (f"Seed {SEED} for every split, model and bootstrap. Splits group by incident ID: 20% held out, then 25% of the rest "
           "as validation. Regenerate with `python backend/manage.py evaluate_models`; the output is deterministic.")
    yield from category_section(models, rng)
    yield from urgency_section(models)
    test = models.test
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
