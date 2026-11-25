import json
import os
import sys
from collections import defaultdict
from pathlib import Path

REPO_ROOT = Path(__file__).resolve().parent.parent.parent
sys.path.insert(0, str(REPO_ROOT / "backend"))

os.environ.setdefault("DJANGO_SETTINGS_MODULE", "config.settings")
import django
django.setup()

from privacy.redactor import redact

DATA_PATH = REPO_ROOT / "docs" / "eval" / "data" / "redaction-set.jsonl"
REPORT_PATH = REPO_ROOT / "docs" / "eval" / "redaction.md"


def score():
    items = [json.loads(line) for line in DATA_PATH.read_text(encoding="utf-8").splitlines() if line.strip()]
    tp_kind = defaultdict(int)
    fp_kind = defaultdict(int)
    fn_kind = defaultdict(int)
    by_lang = defaultdict(lambda: {"tp": 0, "fp": 0, "fn": 0})
    misses = []
    false_positives = []

    for item in items:
        lang = item["lang"]
        text = item["text"]
        gold = {(s["start"], s["end"], s["kind"]) for s in item["spans"]}

        res = redact(text, "eval-org")
        pred = {(s["original_start"], s["original_end"], s["kind"]) for s in res.spans}

        for g in sorted(gold):
            if g in pred:
                tp_kind[g[2]] += 1
                by_lang[lang]["tp"] += 1
            else:
                fn_kind[g[2]] += 1
                by_lang[lang]["fn"] += 1
                misses.append({"id": item["id"], "lang": lang, "kind": g[2], "value": text[g[0]:g[1]], "text": text})

        for p in sorted(pred):
            if p not in gold:
                fp_kind[p[2]] += 1
                by_lang[lang]["fp"] += 1
                false_positives.append({"id": item["id"], "lang": lang, "kind": p[2], "value": text[p[0]:p[1]], "text": text})

    total_tp = sum(tp_kind.values())
    total_fp = sum(fp_kind.values())
    total_fn = sum(fn_kind.values())
    overall_rec = total_tp / max(1, total_tp + total_fn) * 100
    overall_prec = total_tp / max(1, total_tp + total_fp) * 100

    all_kinds = sorted(set(tp_kind) | set(fp_kind) | set(fn_kind))
    targets = {"phone": "≥ 95%", "email": "≥ 95%", "nin": "≥ 95%", "bvn": "≥ 95%", "vin": "≥ 95%", "account": "≥ 95%", "address": "—", "name": "≥ 85%"}

    lines = [
        "# Redaction Evaluation (C16)",
        "",
        f"Evaluated on {len(items)} hand-written synthetic items across 5 languages (`en`, `pcm`, `ha`, `yo`, `ig`), including 75+ negative ordinary-election items (15+ per language) and all C16-4/C16-5 edge cases, scored with **strict exact span matching** (`start`, `end`, and `kind`).",
        "",
        "## Overall Results",
        "",
        f"- **Overall Recall:** {overall_rec:.1f}% ({total_tp}/{total_tp + total_fn})",
        f"- **Overall Precision:** {overall_prec:.1f}% ({total_tp}/{total_tp + total_fp})",
        "",
        "## Per-Kind Breakdown",
        "",
        "| Kind | TP | FP | FN | Recall | Precision | Target Recall |",
        "|---|---|---|---|---|---|---|",
    ]
    for kind in all_kinds:
        tp, fp, fn = tp_kind[kind], fp_kind[kind], fn_kind[kind]
        rec = tp / max(1, tp + fn) * 100
        prec = tp / max(1, tp + fp) * 100
        lines.append(f"| {kind} | {tp} | {fp} | {fn} | {rec:.1f}% | {prec:.1f}% | {targets.get(kind, '—')} |")

    lines.extend([
        "",
        "## Per-Language Breakdown",
        "",
        "| Language | TP | FP | FN | Recall | Precision |",
        "|---|---|---|---|---|---|",
    ])
    for lang in ["en", "pcm", "ha", "yo", "ig"]:
        d = by_lang[lang]
        rec = d["tp"] / max(1, d["tp"] + d["fn"]) * 100
        prec = d["tp"] / max(1, d["tp"] + d["fp"]) * 100
        lines.append(f"| {lang} | {d['tp']} | {d['fp']} | {d['fn']} | {rec:.1f}% | {prec:.1f}% |")

    lines.extend(["", f"## Full Miss List (False Negatives: {len(misses)})", ""])
    if not misses:
        lines.append("- None.")
    else:
        for m in misses:
            lines.append(f"- `{m['id']}` ({m['lang']}, {m['kind']}): `{m['value']}` in \"{m['text']}\"")

    lines.extend(["", f"## Full False Positive List ({len(false_positives)})", ""])
    if not false_positives:
        lines.append("- None.")
    else:
        for fp in false_positives:
            lines.append(f"- `{fp['id']}` ({fp['lang']}, {fp['kind']}): `{fp['value']}` in \"{fp['text']}\"")

    REPORT_PATH.write_text("\n".join(lines) + "\n", encoding="utf-8")
    print(f"Recall={overall_rec:.1f}% ({total_tp}/{total_tp+total_fn}), Precision={overall_prec:.1f}% ({total_tp}/{total_tp+total_fp}), Misses={len(misses)}, FPs={len(false_positives)}")


if __name__ == "__main__":
    score()
