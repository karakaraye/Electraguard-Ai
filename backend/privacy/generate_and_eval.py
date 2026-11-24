import json
import os
import random
from collections import defaultdict
from pathlib import Path

os.environ.setdefault("DJANGO_SETTINGS_MODULE", "config.settings")
import django
django.setup()

from privacy.redactor import redact

BASE_DIR = Path(__file__).resolve().parent.parent.parent
DATA_OUT = BASE_DIR / "docs" / "eval" / "data" / "redaction-set.jsonl"
REPORT_OUT = BASE_DIR / "docs" / "eval" / "redaction.md"


def make_item(item_id: str, lang: str, text: str, entities: list):
    """Creates an item with exact character-offset gold spans."""
    spans = []
    for val, kind in entities:
        idx = text.find(val)
        assert idx != -1, f"Entity {val!r} not found in {text!r}"
        spans.append({"start": idx, "end": idx + len(val), "kind": kind, "value": val})
    return {"id": item_id, "lang": lang, "text": text, "spans": spans}


def build_independent_dataset():
    random.seed(2026)
    items = []

    # Pools of varied realistic entities (including non-90F5 VINs, spaced/paren phones, untitled names, etc.)
    phones = [
        "08031234567", "+234 803 987 6543", "(0803) 123 4567", "0803  123  4567",
        "0701-555-0192", "0909 444 3322", "+2348123456789", "0818.222.1100",
        "0805 678 9012", "07089991122", "(0813) 456 7890", "0902  333  4455",
    ]
    emails = [
        "observer.kano@watch.ng", "chidi.okafor@gmail.com", "aisha.bello22@yahoo.com",
        "ward4.lead@civics.org.ng", "tunde.ade@outlook.com", "ngozi.eze@mail.ng",
    ]
    nins = ["12345678901", "98765432109", "45678901234", "11223344556", "77889900112"]
    bvns = ["22334455667", "33445566778", "55667788990", "66778899001", "88990011223"]
    vins = [
        "AB12345678901234567", "XY98765432109876543", "KN04A11223344556677",
        "90F5B12345678901234", "LG19C99887766554433", "RV02D44556677889900",
    ]
    accounts = ["0123456789", "2098765432", "3011223344", "0055667788", "1099887766"]
    addresses = [
        "14 Broad Street", "No. 22 Ahmadu Bello Way", "Plot 8 Allen Avenue",
        "7B Herbert Macaulay Road", "19 Zik Avenue", "32 Yakubu Gowon Crescent",
        "5 Zoo Road", "11 Independence Layout", "44 Awolowo Way", "88 Aba Road",
    ]
    # Mix of titled names, common Nigerian names, and harder untitled/uncommon names
    names_pool = [
        ("Mr. ", "Babatunde Fashola"),
        ("Alhaji ", "Musa Bello"),
        ("Dr. ", "Chinedu Okafor"),
        ("Mrs. ", "Funke Adebayo"),
        ("Hajiya ", "Fatima Usman"),
        ("Chief ", "Emeka Nwosu"),
        ("Barr. ", "Sadiq Abubakar"),
        ("Pastor ", "Samuel Ogunleye"),
        ("", "Amina Danjuma"),
        ("", "Oluwaseun Adeyemi"),
        ("", "Ngozi Eze"),
        ("", "Ibrahim Garba"),
        ("", "Kelechi Iheanacho"),
        ("", "Yusuf Abdullahi"),
        ("", "Zikora Nnamdi"),      # uncommon first name (honest miss test)
        ("", "Dantata Kure"),       # uncommon surname/first name (honest miss test)
        ("", "Bamidele Ogundipe"),
        ("", "Chukwuma Soludo"),
    ]

    # Negative election sentences (0 PII entities) per language
    negatives = {
        "en": [
            "Election forms delivered to ward collation centre at 08:30.",
            "Returning officer was chosen by the accreditation committee.",
            "Chief Imam prayed for peaceful voting before polls opened.",
            "14 observers were on the way to the polling unit.",
            "100 voters waited on the expressway near the main gate.",
            "Record serial 0012345678 account of votes cast at the unit.",
            "Sensitive items musa not be left unattended during counting.",
            "BVAS machine 456789012 failed to scan thumbprints twice.",
            "Queues were long at Ward 3 but accreditation proceeded calmly.",
            "Ballot boxes arrived 45 minutes late due to transport delay.",
        ],
        "pcm": [
            "Election forms don reach collation centre since morning.",
            "Dem don choose returning officer for the ward already.",
            "Chief Imam pray make voting go well without wahala.",
            "14 observers dey on the way go the polling unit.",
            "100 voters stand for expressway dey wait for INEC.",
            "Write serial 0012345678 account of votes wey dem count.",
            "All sensitive materials musa stay inside the box.",
            "BVAS machine freeze two times before afternoon.",
            "Queue long well well for PU 004 but people calm.",
            "Result sheet don paste for wall make everybody see.",
        ],
        "ha": [
            "An kawo takardun zabe zuwa cibiyar tattara sakamako.",
            "Kwamitin ya zabi jami'in zabe domin kula da akwati.",
            "Babban Liman ya yi addu'a domin zaman lafiya kafin zabe.",
            "Masu sa ido 14 suna kan hanya zuwa rumfar zabe.",
            "Masu jefa kuri'a 100 sun jira a kan babbar hanya.",
            "Rubuta lambar 0012345678 na yawan kuri'un da aka kada.",
            "Na'urar BVAS ta tsaya sau biyu da rana.",
            "Layin masu zabe yana da tsawo amma komai na tafiya lafiya.",
            "An fara tantance masu zabe da karfe takwas na safe.",
            "Jami'an tsaro suna nan suna kula da rumfar zabe.",
        ],
        "yo": [
            "Awon iwe idibo ti de ibudo ikojopo ni aaro.",
            "Igbimo yan oludari idibo fun gbogbo awon ibudo.",
            "Imam agba gbadura fun alafia ki idibo to bere.",
            "Awon oluwoye 14 wa lori ona si ibudo idibo.",
            "Awon oludibo 100 duro ni opopona nla ti o wa nitosi.",
            "Ko nomba 0012345678 ti ibo ti a ka ni ibudo naa.",
            "Ero BVAS dawo duro leemeji ni osan.",
            "Ila awon oludibo gun sugbon eto naa n lo ni irorun.",
            "Awon olopa wa nibe lati daabo bo awon oludibo.",
            "A ti le esi idibo si ogiri fun gbogbo eniyan lati ri.",
        ],
        "ig": [
            "Ewetala akwukwo ntuli aka n'ebe nchikota nke ubochi taa.",
            "Kọmitii ahoputala onye isi ntuli aka maka mpaghara a.",
            "Onye isi Imam kpere ekpere maka udo tupu e bido.",
            "Ndi nleba anya 14 no n'uzo na-aga ebe ntuli aka.",
            "Ndi ntuli aka 100 kwuru n'okporo uzo ukwu na-eche.",
            "Dee nomba 0012345678 nke votu a guru n'ebe a.",
            "Igwe BVAS kwusiri ugboro abuo n'ehihie.",
            "Ahiri ndi mmadu di ogologo mana ihe niile na-aga nke oma.",
            "Ndi uwe ojii no ebe ahu iji hụ na udo dị.",
            "E biputala nsonaazụ ntuli aka n'ahụ aja.",
        ],
    }

    # Diverse positive templates per language (each produces varied phrasing)
    pos_templates = {
        "en": [
            lambda p, e, n, b, v, a, addr, t, nm: (f"Observer {t}{nm} reported voter intimidation; call {p} for details.", [(nm, "name"), (p, "phone")]),
            lambda p, e, n, b, v, a, addr, t, nm: (f"NIN of the voter is {n} and PVC {v} was seized at {addr}.", [(n, "nin"), (v, "vin"), (addr, "address")]),
            lambda p, e, n, b, v, a, addr, t, nm: (f"Agent {t}{nm} distributed cash via a/c {a}; email {e}.", [(nm, "name"), (a, "account"), (e, "email")]),
            lambda p, e, n, b, v, a, addr, t, nm: (f"BVN {b} and phone {p} were collected near {addr}.", [(b, "bvn"), (p, "phone"), (addr, "address")]),
            lambda p, e, n, b, v, a, addr, t, nm: (f"Witness {nm} stayed at {addr}; reached on {p}.", [(nm, "name"), (addr, "address"), (p, "phone")]),
            lambda p, e, n, b, v, a, addr, t, nm: (f"Send evidence to {e} or call {p} before collation.", [(e, "email"), (p, "phone")]),
            lambda p, e, n, b, v, a, addr, t, nm: (f"Thugs led by {t}{nm} blocked {addr} with VIN {v}.", [(nm, "name"), (addr, "address"), (v, "vin")]),
            lambda p, e, n, b, v, a, addr, t, nm: (f"Bribery sent to account {a}; BVN of the agent is {b}.", [(a, "account"), (b, "bvn")]),
            lambda p, e, n, b, v, a, addr, t, nm: (f"Voter {nm} could not vote; NIN {n} failed verification.", [(nm, "name"), (n, "nin")]),
            lambda p, e, n, b, v, a, addr, t, nm: (f"Emergency at {addr}: contact {t}{nm} on {p} or {e}.", [(addr, "address"), (nm, "name"), (p, "phone"), (e, "email")]),
        ],
        "pcm": [
            lambda p, e, n, b, v, a, addr, t, nm: (f"Abeg call {t}{nm} for {p}, wahala dey happen for unit.", [(nm, "name"), (p, "phone")]),
            lambda p, e, n, b, v, a, addr, t, nm: (f"Dem collect voter NIN {n} and PVC {v} near {addr}.", [(n, "nin"), (v, "vin"), (addr, "address")]),
            lambda p, e, n, b, v, a, addr, t, nm: (f"One boy send money enter a/c {a} wey {t}{nm} get.", [(a, "account"), (nm, "name")]),
            lambda p, e, n, b, v, a, addr, t, nm: (f"Send mail go {e} or dial {p} sharp sharp.", [(e, "email"), (p, "phone")]),
            lambda p, e, n, b, v, a, addr, t, nm: (f"Agent {nm} dey stay for {addr}; BVN na {b}.", [(nm, "name"), (addr, "address"), (b, "bvn")]),
            lambda p, e, n, b, v, a, addr, t, nm: (f"VIN {v} no gree scan, call {p} make dem help.", [(v, "vin"), (p, "phone")]),
            lambda p, e, n, b, v, a, addr, t, nm: (f"{t}{nm} scatter queue for {addr}, reach {e}.", [(nm, "name"), (addr, "address"), (e, "email")]),
            lambda p, e, n, b, v, a, addr, t, nm: (f"Dem pay voters using account {a} and NIN {n}.", [(a, "account"), (n, "nin")]),
            lambda p, e, n, b, v, a, addr, t, nm: (f"My guy {nm} phone na {p}, e dey {addr}.", [(nm, "name"), (p, "phone"), (addr, "address")]),
            lambda p, e, n, b, v, a, addr, t, nm: (f"BVN {b} and phone {p} dey inside the complaint.", [(b, "bvn"), (p, "phone")]),
        ],
        "ha": [
            lambda p, e, n, b, v, a, addr, t, nm: (f"Wakili {t}{nm} ya kawo rahoto; lambar waya {p}.", [(nm, "name"), (p, "phone")]),
            lambda p, e, n, b, v, a, addr, t, nm: (f"An karbi NIN {n} da katin PVC {v} a {addr}.", [(n, "nin"), (v, "vin"), (addr, "address")]),
            lambda p, e, n, b, v, a, addr, t, nm: (f"An tura kudi zuwa a/c {a}; imel {e}.", [(a, "account"), (e, "email")]),
            lambda p, e, n, b, v, a, addr, t, nm: (f"{t}{nm} yana zaune a {addr}, lambar BVN {b}.", [(nm, "name"), (addr, "address"), (b, "bvn")]),
            lambda p, e, n, b, v, a, addr, t, nm: (f"A kira {p} ko a aika sako zuwa {e} nan take.", [(p, "phone"), (e, "email")]),
            lambda p, e, n, b, v, a, addr, t, nm: (f"Mai jefa kuri'a {nm} ya nuna VIN {v} a rumfar zabe.", [(nm, "name"), (v, "vin")]),
            lambda p, e, n, b, v, a, addr, t, nm: (f"An samu matsala a {addr}; kira {t}{nm} ta {p}.", [(addr, "address"), (nm, "name"), (p, "phone")]),
            lambda p, e, n, b, v, a, addr, t, nm: (f"Asusun banki account {a} da NIN {n} suna cikin takardar.", [(a, "account"), (n, "nin")]),
            lambda p, e, n, b, v, a, addr, t, nm: (f"Shaida {nm} ya ba da BVN {b} da waya {p}.", [(nm, "name"), (b, "bvn"), (p, "phone")]),
            lambda p, e, n, b, v, a, addr, t, nm: (f"Imel din {t}{nm} shine {e} a {addr}.", [(nm, "name"), (e, "email"), (addr, "address")]),
        ],
        "yo": [
            lambda p, e, n, b, v, a, addr, t, nm: (f"Oluwoye {t}{nm} pe nomba {p} lati jabo wahala.", [(nm, "name"), (p, "phone")]),
            lambda p, e, n, b, v, a, addr, t, nm: (f"Won gba NIN {n} ati kaadi PVC {v} ni {addr}.", [(n, "nin"), (v, "vin"), (addr, "address")]),
            lambda p, e, n, b, v, a, addr, t, nm: (f"Won fi owo ranse si a/c {a}; imeeli {e}.", [(a, "account"), (e, "email")]),
            lambda p, e, n, b, v, a, addr, t, nm: (f"{t}{nm} n gbe ni {addr}, nomba BVN re ni {b}.", [(nm, "name"), (addr, "address"), (b, "bvn")]),
            lambda p, e, n, b, v, a, addr, t, nm: (f"Pe {p} tabi fi imeeli ranse si {e} ni kiakia.", [(p, "phone"), (e, "email")]),
            lambda p, e, n, b, v, a, addr, t, nm: (f"Oludibo {nm} fi VIN {v} han ni ibudo idibo.", [(nm, "name"), (v, "vin")]),
            lambda p, e, n, b, v, a, addr, t, nm: (f"Wahala sele ni {addr}; kan si {t}{nm} lori {p}.", [(addr, "address"), (nm, "name"), (p, "phone")]),
            lambda p, e, n, b, v, a, addr, t, nm: (f"Account {a} ati NIN {n} wa ninu iwe iroyin.", [(a, "account"), (n, "nin")]),
            lambda p, e, n, b, v, a, addr, t, nm: (f"Eleri {nm} ni BVN {b} ati foonu {p}.", [(nm, "name"), (b, "bvn"), (p, "phone")]),
            lambda p, e, n, b, v, a, addr, t, nm: (f"Imeeli {t}{nm} ni {e} ni agbegbe {addr}.", [(nm, "name"), (e, "email"), (addr, "address")]),
        ],
        "ig": [
            lambda p, e, n, b, v, a, addr, t, nm: (f"Onye nleba anya {t}{nm} kporo {p} maka nsogbu.", [(nm, "name"), (p, "phone")]),
            lambda p, e, n, b, v, a, addr, t, nm: (f"Ha napuru NIN {n} na kaadi PVC {v} n'ebe {addr}.", [(n, "nin"), (v, "vin"), (addr, "address")]),
            lambda p, e, n, b, v, a, addr, t, nm: (f"E zigara ego na a/c {a}; ozi {e}.", [(a, "account"), (e, "email")]),
            lambda p, e, n, b, v, a, addr, t, nm: (f"{t}{nm} bi na {addr}, nomba BVN ya bu {b}.", [(nm, "name"), (addr, "address"), (b, "bvn")]),
            lambda p, e, n, b, v, a, addr, t, nm: (f"Kpoo {p} ma o bu zigara ozi na {e} ugbu a.", [(p, "phone"), (e, "email")]),
            lambda p, e, n, b, v, a, addr, t, nm: (f"Onye ntuli aka {nm} gosiri VIN {v} n'ebe a.", [(nm, "name"), (v, "vin")]),
            lambda p, e, n, b, v, a, addr, t, nm: (f"Nsogbu mere na {addr}; kpoo {t}{nm} na {p}.", [(addr, "address"), (nm, "name"), (p, "phone")]),
            lambda p, e, n, b, v, a, addr, t, nm: (f"Account {a} na NIN {n} di n'akwukwo mkpesa.", [(a, "account"), (n, "nin")]),
            lambda p, e, n, b, v, a, addr, t, nm: (f"Onye aka ebe {nm} nwere BVN {b} na ekwenti {p}.", [(nm, "name"), (b, "bvn"), (p, "phone")]),
            lambda p, e, n, b, v, a, addr, t, nm: (f"Imel nke {t}{nm} bu {e} n'akuku {addr}.", [(nm, "name"), (e, "email"), (addr, "address")]),
        ],
    }

    idx = 1
    for lang in ["en", "pcm", "ha", "yo", "ig"]:
        # 10 negative items per language (50 total)
        for neg_text in negatives[lang]:
            items.append(make_item(f"RED-{idx:03d}", lang, neg_text, []))
            idx += 1
        # 52 positive items per language (260 total -> 310 total)
        for k in range(52):
            tmpl = pos_templates[lang][k % len(pos_templates[lang])]
            p = phones[(idx + k) % len(phones)]
            e = emails[(idx + k) % len(emails)]
            n = nins[(idx + k) % len(nins)]
            b = bvns[(idx + k) % len(bvns)]
            v = vins[(idx + k) % len(vins)]
            a = accounts[(idx + k) % len(accounts)]
            addr = addresses[(idx + k) % len(addresses)]
            t, nm = names_pool[(idx + k) % len(names_pool)]
            text, ents = tmpl(p, e, n, b, v, a, addr, t, nm)
            items.append(make_item(f"RED-{idx:03d}", lang, text, ents))
            idx += 1

    DATA_OUT.parent.mkdir(parents=True, exist_ok=True)
    with open(DATA_OUT, "w", encoding="utf-8") as f:
        for item in items:
            f.write(json.dumps(item, ensure_ascii=False) + "\n")
    return items


def evaluate_exact_spans(items):
    """Evaluates redactor using strict exact span matching (original_start, original_end, kind)."""
    tp_by_kind = defaultdict(int)
    fp_by_kind = defaultdict(int)
    fn_by_kind = defaultdict(int)
    by_lang = defaultdict(lambda: {"tp": 0, "fp": 0, "fn": 0})
    misses = []
    false_positives = []

    for item in items:
        lang = item["lang"]
        text = item["text"]
        gold_set = {(s["start"], s["end"], s["kind"]) for s in item["spans"]}
        gold_vals = {(s["start"], s["end"], s["kind"]): s["value"] for s in item["spans"]}

        res = redact(text, "eval-org")
        pred_set = {(s["original_start"], s["original_end"], s["kind"]) for s in res.spans}

        for g in gold_set:
            if g in pred_set:
                tp_by_kind[g[2]] += 1
                by_lang[lang]["tp"] += 1
            else:
                fn_by_kind[g[2]] += 1
                by_lang[lang]["fn"] += 1
                misses.append({"id": item["id"], "lang": lang, "kind": g[2], "value": gold_vals[g], "text": text})

        for p in pred_set:
            if p not in gold_set:
                fp_by_kind[p[2]] += 1
                by_lang[lang]["fp"] += 1
                false_positives.append({"id": item["id"], "lang": lang, "kind": p[2], "value": text[p[0]:p[1]], "text": text})

    all_kinds = sorted(set(tp_by_kind) | set(fp_by_kind) | set(fn_by_kind))
    total_tp = sum(tp_by_kind.values())
    total_fp = sum(fp_by_kind.values())
    total_fn = sum(fn_by_kind.values())
    overall_rec = total_tp / max(1, total_tp + total_fn) * 100
    overall_prec = total_tp / max(1, total_tp + total_fp) * 100

    lines = [
        "# Redaction Evaluation (C16)",
        "",
        f"Evaluated on {len(items)} unique synthetic items across 5 languages (`en`, `pcm`, `ha`, `yo`, `ig`), including 50 negative (clean election text) items and edge-case formats, using **strict exact span matching**.",
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
    targets = {"phone": "≥ 95%", "email": "≥ 95%", "nin": "≥ 95%", "bvn": "≥ 95%", "vin": "≥ 95%", "account": "≥ 95%", "address": "—", "name": "≥ 85%"}
    for kind in all_kinds:
        tp, fp, fn = tp_by_kind[kind], fp_by_kind[kind], fn_by_kind[kind]
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

    lines.extend(["", f"## Misses (False Negatives: {len(misses)})", ""])
    for m in misses[:30]:
        lines.append(f"- `{m['id']}` ({m['lang']}, {m['kind']}): `{m['value']}` in \"{m['text']}\"")
    if len(misses) > 30:
        lines.append(f"- ... and {len(misses) - 30} more.")

    lines.extend(["", f"## False Positives ({len(false_positives)})", ""])
    if not false_positives:
        lines.append("- None.")
    else:
        for fp in false_positives[:30]:
            lines.append(f"- `{fp['id']}` ({fp['lang']}, {fp['kind']}): `{fp['value']}` in \"{fp['text']}\"")

    REPORT_OUT.write_text("\n".join(lines) + "\n", encoding="utf-8")
    print(f"Redaction eval complete: Recall={overall_rec:.1f}%, Precision={overall_prec:.1f}%, Misses={len(misses)}, FPs={len(false_positives)}")


if __name__ == "__main__":
    dataset = build_independent_dataset()
    evaluate_exact_spans(dataset)
