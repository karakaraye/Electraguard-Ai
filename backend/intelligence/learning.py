import csv
import json
from functools import lru_cache
from pathlib import Path

import numpy as np
from sklearn.ensemble import GradientBoostingRegressor
from sklearn.feature_extraction import DictVectorizer
from sklearn.feature_extraction.text import TfidfVectorizer
from sklearn.linear_model import LogisticRegression
from sklearn.model_selection import GroupShuffleSplit
from sklearn.pipeline import make_pipeline

ROOT = Path(__file__).resolve().parents[2]
DATA = ROOT / "data" / "synthetic"
SEED = 42
CATEGORY_MAP = {
    "logistics_delay": "late_materials",
    "equipment_failure": "equipment_failure",
    "queue_management": "queues_crowding",
    "intimidation": "intimidation_violence",
    "accessibility_barrier": "access_barrier",
    "information_gap": "lack_of_information",
    "positive_practice": "good_practice",
}


def csv_rows(name):
    with (DATA / name).open(encoding="utf-8", newline="") as source:
        return list(csv.DictReader(source))


def split(rows, key):
    indices = list(range(len(rows)))
    groups = [row[key] for row in rows]
    development, test = next(GroupShuffleSplit(test_size=.2, random_state=SEED).split(indices, groups=groups))
    train, calibration = next(GroupShuffleSplit(test_size=.25, random_state=SEED).split(
        development, groups=[groups[i] for i in development],
    ))
    return tuple([[rows[i] for i in part] for part in (development[train], development[calibration], test)])


def text_model():
    return make_pipeline(
        TfidfVectorizer(analyzer="char", ngram_range=(3, 5), sublinear_tf=True),
        LogisticRegression(random_state=SEED, max_iter=1000, class_weight="balanced"),
    )


def category_label(row):
    return CATEGORY_MAP[row["category"]]


def severe(row):
    return int(row["severity_0_4"]) >= 3


@lru_cache(maxsize=1)
def incident_models():
    train, calibration, test = split(csv_rows("incident_reports_synthetic.csv"), "incident_id")
    samples = [row["description"] for row in train]
    category = text_model().fit(samples, [category_label(row) for row in train])
    severity = text_model().fit(samples, [severe(row) for row in train])
    scores = category.predict_proba([row["description"] for row in calibration])
    correct = category.classes_[scores.argmax(axis=1)] == [category_label(row) for row in calibration]
    eligible = [threshold for threshold in np.arange(.40, .96, .05)
                if (scores.max(axis=1) >= threshold).any()
                and correct[scores.max(axis=1) >= threshold].mean() >= .90]
    return category, severity, float(min(eligible, default=1.0)), test


def rumour_label(row):
    # The pack labels veracity and reach. These targets are proxies for editorial priority.
    misleading = row["label"] in {"false", "misleading"}
    return misleading and row["spread_score"] >= 50, row["label"] != "true"


@lru_cache(maxsize=1)
def rumour_models():
    rows = [json.loads(line) for line in (DATA / "misinformation_claims_synthetic.jsonl").read_text(
        encoding="utf-8",
    ).splitlines()]
    train, calibration, test = split(rows, "claim_id")
    models = []
    for target in range(2):
        base = text_model().fit([row["text"] for row in train], [rumour_label(row)[target] for row in train])
        scores = base.decision_function([row["text"] for row in calibration]).reshape(-1, 1)
        calibrator = LogisticRegression(random_state=SEED).fit(
            scores, [rumour_label(row)[target] for row in calibration],
        )
        models.append((base, calibrator))
    return models, test


def rank_claims(texts):
    """Return calibrated scores and priority ranks in the caller's input order."""
    if not texts:
        return []
    models, _ = rumour_models()
    probabilities = [calibrator.predict_proba(base.decision_function(texts).reshape(-1, 1))[:, 1]
                     for base, calibrator in models]
    scores = [{"harm": float(harm), "check_worthiness": float(worth)}
              for harm, worth in zip(*probabilities)]
    order = sorted(scores, key=lambda score: (-score["harm"], -score["check_worthiness"]))
    for rank, score in enumerate(order, 1):
        score["rank"] = rank
    return scores


def logistics_features(row):
    return {
        "distance_from_hub": float(row["distance_km"]),
        "distance_to_lga_hq": float(row["distance_to_lga_hq_km"]),
        "settlement": row["settlement"],
        "vehicle": row["vehicle"],
        "dispatch_hour": float(row["dispatch_hour"]),
        "network_coverage": row["network_coverage"],
    }


def logistics_model():
    units = {row["pu_id"]: row for row in csv_rows("polling_units_synthetic.csv")}
    rows = [units[row["pu_id"]] | row for row in csv_rows("logistics_deliveries_synthetic.csv")]
    train, development, test = split(rows, "pu_id")
    train.extend(development)
    model = make_pipeline(DictVectorizer(sparse=False), GradientBoostingRegressor(random_state=SEED))
    model.fit([logistics_features(row) for row in train], [float(row["transit_hours"]) for row in train])
    return model, rows, test
