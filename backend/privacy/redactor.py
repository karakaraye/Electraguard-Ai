import hashlib
import hmac
import os
import re
from dataclasses import dataclass
from typing import Any, List, NamedTuple, Optional, Set, Tuple

from django.conf import settings


# Pattern for already-redacted tokens so they are never re-redacted
EXISTING_TOKEN_PATTERN = re.compile(r"\[[A-Z0-9]+_[0-9a-f]{4,6}\]")

# Nigerian phone regex: +234 or 0, then 7/8/9, then 0/1, then 8 digits (spaces/dashes allowed)
PHONE_PATTERN = re.compile(
    r"(?<!\d)(?:\+?234|0)[ -.]?[789][01](?:[ -.]?\d){8}(?!\d)"
)

# Email regex
EMAIL_PATTERN = re.compile(
    r"\b[A-Za-z0-9._%+-]+@[A-Za-z0-9.-]+\.[A-Za-z]{2,}\b"
)

# NIN: 11 digits near NIN or NIMC
NIN_PREFIX_PATTERN = re.compile(
    r"(?i)\b(?:nin|nimc)\b[^\w\d\n]{0,25}(?:is|no|number|na)?\s*(\d{11})(?!\d)"
)
NIN_SUFFIX_PATTERN = re.compile(
    r"(?i)(?<!\d)(\d{11})\s*(?:is|as)?\s*(?:my|the|our|a)?\s*\b(?:nin|nimc)\b"
)

# BVN: 11 digits near BVN
BVN_PREFIX_PATTERN = re.compile(
    r"(?i)\b(?:bvn)\b[^\w\d\n]{0,25}(?:is|no|number|na)?\s*(\d{11})(?!\d)"
)
BVN_SUFFIX_PATTERN = re.compile(
    r"(?i)(?<!\d)(\d{11})\s*(?:is|as)?\s*(?:my|the|our|a)?\s*\b(?:bvn)\b"
)

# VIN / Voter card number: 19 alphanumeric characters near VIN or PVC, or starting with 90F5
VIN_PREFIX_PATTERN = re.compile(
    r"(?i)\b(?:vin|pvc)\b[^\w\d\n]{0,25}(?:is|no|number|na)?\s*([A-Za-z0-9]{19})(?![A-Za-z0-9])"
)
VIN_SUFFIX_PATTERN = re.compile(
    r"(?i)(?<![A-Za-z0-9])([A-Za-z0-9]{19})\s*(?:is|as)?\s*(?:my|the|our|a)?\s*\b(?:vin|pvc)\b"
)
VIN_STANDARD_PATTERN = re.compile(
    r"(?i)\b(90F5[A-Za-z0-9]{15})\b"
)

# Account number: 10 digits near account or acct or nuban
ACCOUNT_PREFIX_PATTERN = re.compile(
    r"(?i)\b(?:account|acct|nuban)\b[^\w\d\n]{0,25}(?:is|no|number|na)?\s*(\d{10})(?!\d)"
)
ACCOUNT_SUFFIX_PATTERN = re.compile(
    r"(?i)(?<!\d)(\d{10})\s*(?:is|as)?\s*(?:my|the|our|a)?\s*\b(?:account|acct|nuban)\b"
)

# House Address: Numbered address or residence cue
STREET_WORDS = (
    r"street|st\.?|road|rd\.?|avenue|ave\.?|close|cl\.?|crescent|cres\.?|"
    r"way|lane|lne|drive|dr\.?|estate|layout|boulevard|blvd|expressway|"
    r"highway|quarters|qtrs|terrace"
)
ADDRESS_NUMBERED_PATTERN = re.compile(
    rf"(?i)\b(?:(?:no\.?|house|plot|flat|block|blk|apt)\s*)?\d{{1,4}}[a-z]?(?:[/-]\d{{1,4}})?\s+(?:[A-Za-z0-9.'-]+\s+){{1,4}}(?:{STREET_WORDS})\b"
)
ADDRESS_PO_BOX_PATTERN = re.compile(
    r"(?i)\b(?:p\.?\s*o\.?\s*box)\s+\d+\b"
)
RESIDENCE_CUE_PATTERN = re.compile(
    rf"(?i)\b(?:live\s+at|lives\s+at|living\s+at|stay\s+at|reside\s+at|house\s+is\s+at|address\s+is|dey\s+stay\s+for)\s+([A-Za-z0-9\s,.'-]{{4,50}}?(?:{STREET_WORDS}))\b"
)

# Personal names: Titles followed by name
TITLE_WORDS = (
    r"Mr|Mrs|Ms|Miss|Mister|Dr|Chief|Alhaji|Alh|Alhaja|Hajia|Hajiya|Mallam|Malam|"
    r"Pastor|Pst|Rev|Revd|Reverend|Engr|Barr|Barrister|Prof|Professor|Prince|Princess|"
    r"Otunba|Oba|Deacon|Deaconess|Evangelist|Evang|Apostle|Bishop|Imam|Ustaz|Sheikh|"
    r"Hon|Honourable|Honorable|Comrade|Comr|Senator|Sen|Gen|Col|Capt|Major|Sgt|Cpl|"
    r"Insp|Inspector|Oga|Mama|Papa|Baba|Madam|Sister|Brother|Uncle|Aunty|"
    r"Mazi|Nwanyi|Ichie|Igwe|Eze|Dọkịta|Dokita|Arakunrin|Iyaafin|Omidan|Oloye|Sarki|Waziri|Magaji"
)
TITLE_NAME_PATTERN = re.compile(
    rf"\b({TITLE_WORDS})\.?\s+([A-ZÀ-ÿ][a-zA-ZÀ-ÿ]*(?:\s+[A-ZÀ-ÿ][a-zA-ZÀ-ÿ]*){{0,2}})\b"
)
TITLES_SET: Set[str] = set(TITLE_WORDS.lower().split("|"))

NAME_CUE_PATTERN = re.compile(
    r"(?i)\b(?:my name is|my names are|my name na|my name be|name na|named|called|by name)\s+([A-Z][a-zA-Z]*(?:\s+[A-Z][a-zA-Z]*){0,2})\b"
)

EXCLUDED_WORDS: Set[str] = {
    # States and Federal Capital Territory
    "abia", "adamawa", "akwa ibom", "anambra", "bauchi", "bayelsa", "benue", "borno",
    "cross river", "delta", "ebonyi", "edo", "ekiti", "enugu", "fct", "gombe", "imo",
    "jigawa", "kaduna", "kano", "katsina", "kebbi", "kogi", "kwara", "lagos", "nasarawa",
    "niger", "ogun", "ondo", "osun", "oyo", "plateau", "rivers", "sokoto", "taraba",
    "yobe", "zamfara", "abuja",
    # Common LGAs and major cities
    "ikeja", "surulere", "alimosho", "eti-osa", "badagry", "ikorodu", "oshodi", "mushin",
    "epe", "ibadan", "abeokuta", "warri", "asaba", "calabar", "uyo", "portharcourt",
    "port harcourt", "maiduguri", "zaria", "aba", "onitsha", "owerri", "abakaliki",
    "awka", "umuahia", "suleja", "minna", "birnin kebbi", "gusau", "dutse", "damaturu",
    "gashua", "dala", "fagge", "gwale", "tarauni", "nassarawa", "ungogo", "kumbotso",
    # Political and election terms
    "inec", "pvc", "bvas", "apc", "pdp", "lp", "nnpp", "adc", "sdp", "apga", "ward",
    "pu", "polling", "unit", "collation", "center", "centre", "election", "elections",
    "ballot", "ballots", "box", "boxes", "voter", "voters", "observer", "observers",
    "agent", "agents", "officer", "officers", "presiding", "returning", "supervisory",
    "security", "police", "army", "civil", "defence", "governor", "president", "senate",
    "reps", "assembly", "lga", "state", "nigeria", "nigerian", "party", "result", "sheet",
    "incident", "intimidation", "violence", "materials", "delay", "queue", "queueing",
    "process", "accreditation", "voting", "vote", "votes",
    # English/Pidgin days, ordinary pronouns and common words
    "monday", "tuesday", "wednesday", "thursday", "friday", "saturday", "sunday",
    "today", "yesterday", "tomorrow", "morning", "afternoon", "evening", "night",
    "god", "amen", "please", "abeg", "wahala", "people", "youths", "thugs", "boys",
    # Common English/Pidgin verbs and connective stop words
    "arrived", "arriving", "arrive", "departed", "leaving", "left", "went", "came", "come", "comes",
    "said", "say", "says", "told", "tell", "tells", "called", "calling", "call", "calls",
    "reported", "reporting", "report", "reports", "seen", "saw", "seeing", "see",
    "complained", "complaining", "complain", "stated", "stating", "state", "claimed", "claiming", "claim",
    "with", "from", "for", "and", "but", "when", "while", "where", "how", "why", "who", "which",
    "that", "this", "these", "those", "have", "has", "had", "been", "were", "was", "are", "is",
    "will", "would", "shall", "should", "can", "could", "may", "might", "must", "dey", "don", "make",
    "kuma", "wani", "wata", "yana", "tana", "suna", "wanda", "wacce", "cewa", "bayan", "kafin",
    "pelu", "nitoripe", "awon", "sugbon", "lati", "ninu", "wipe", "kini",
    "maka", "ndị", "onye", "mana", "tupu", "ebe", "ihe", "kwuru",
}


_NAMES_CACHE: Optional[Set[str]] = None


def get_known_names() -> Set[str]:
    global _NAMES_CACHE
    if _NAMES_CACHE is not None:
        return _NAMES_CACHE

    names_file = os.path.join(os.path.dirname(__file__), "data", "names.txt")
    names: Set[str] = set()
    if os.path.exists(names_file):
        with open(names_file, "r", encoding="utf-8") as f:
            for line in f:
                line = line.strip()
                if line and not line.startswith("#"):
                    clean = line.lower()
                    if clean not in EXCLUDED_WORDS and len(clean) >= 3:
                        names.add(clean)
    _NAMES_CACHE = names
    return _NAMES_CACHE


@dataclass
class RedactionSpan:
    start: int
    end: int
    kind: str
    token: str
    original_start: int = 0
    original_end: int = 0


class RedactionResult(NamedTuple):
    text: str
    spans: List[dict]


def org_secret_key(organisation: Any) -> bytes:
    if organisation is None:
        org_id = "default"
    elif hasattr(organisation, "id"):
        org_id = str(organisation.id)
    elif hasattr(organisation, "pk"):
        org_id = str(organisation.pk)
    else:
        org_id = str(organisation)

    master = getattr(settings, "REDACTION_MASTER_KEY", None) or getattr(settings, "SECRET_KEY", "electraguard-secret-key-32chars")
    if isinstance(master, str):
        master = master.encode("utf-8")
    return hmac.new(master, f"electraguard:org:{org_id}".encode("utf-8"), hashlib.sha256).digest()


def normalize_value(kind: str, value: str) -> str:
    kind_lower = kind.lower()
    if kind_lower == "phone":
        digits = re.sub(r"[^\d]", "", value)
        if digits.startswith("234"):
            return digits
        if digits.startswith("0") and len(digits) == 11:
            return "234" + digits[1:]
        return digits
    elif kind_lower in ("name", "address"):
        return re.sub(r"[^\w\d]+", " ", value).strip().lower()
    else:
        return re.sub(r"[\s-]", "", value).strip().lower()


def token_for(kind: str, value: str, secret: bytes) -> str:
    norm = normalize_value(kind, value)
    msg = f"{kind.upper()}:{norm}".encode("utf-8")
    suffix = hmac.new(secret, msg, hashlib.sha256).hexdigest()[:4].lower()
    return f"[{kind.upper()}_{suffix}]"


def find_candidate_spans(text: str, secret: bytes) -> List[Tuple[int, int, str, str, str]]:
    """
    Finds all candidate redaction spans: (start, end, kind, original_value, token).
    """
    candidates: List[Tuple[int, int, str, str, str]] = []
    known_names = get_known_names()

    # 1. Existing tokens (marked with kind 'PROTECTED')
    for m in EXISTING_TOKEN_PATTERN.finditer(text):
        candidates.append((m.start(), m.end(), "PROTECTED", m.group(), m.group()))

    # 2. Email
    for m in EMAIL_PATTERN.finditer(text):
        val = m.group()
        candidates.append((m.start(), m.end(), "email", val, token_for("email", val, secret)))

    # 3. Phone
    for m in PHONE_PATTERN.finditer(text):
        val = m.group()
        candidates.append((m.start(), m.end(), "phone", val, token_for("phone", val, secret)))

    # 4. NIN
    for m in NIN_PREFIX_PATTERN.finditer(text):
        val = m.group(1)
        candidates.append((m.start(1), m.end(1), "nin", val, token_for("nin", val, secret)))
    for m in NIN_SUFFIX_PATTERN.finditer(text):
        val = m.group(1)
        candidates.append((m.start(1), m.end(1), "nin", val, token_for("nin", val, secret)))

    # 5. BVN
    for m in BVN_PREFIX_PATTERN.finditer(text):
        val = m.group(1)
        candidates.append((m.start(1), m.end(1), "bvn", val, token_for("bvn", val, secret)))
    for m in BVN_SUFFIX_PATTERN.finditer(text):
        val = m.group(1)
        candidates.append((m.start(1), m.end(1), "bvn", val, token_for("bvn", val, secret)))

    # 6. VIN
    for m in VIN_PREFIX_PATTERN.finditer(text):
        val = m.group(1)
        candidates.append((m.start(1), m.end(1), "vin", val, token_for("vin", val, secret)))
    for m in VIN_SUFFIX_PATTERN.finditer(text):
        val = m.group(1)
        candidates.append((m.start(1), m.end(1), "vin", val, token_for("vin", val, secret)))
    for m in VIN_STANDARD_PATTERN.finditer(text):
        val = m.group(1)
        candidates.append((m.start(1), m.end(1), "vin", val, token_for("vin", val, secret)))

    # 7. Account number
    for m in ACCOUNT_PREFIX_PATTERN.finditer(text):
        val = m.group(1)
        candidates.append((m.start(1), m.end(1), "account", val, token_for("account", val, secret)))
    for m in ACCOUNT_SUFFIX_PATTERN.finditer(text):
        val = m.group(1)
        candidates.append((m.start(1), m.end(1), "account", val, token_for("account", val, secret)))

    # 8. Address
    for m in ADDRESS_NUMBERED_PATTERN.finditer(text):
        val = m.group()
        candidates.append((m.start(), m.end(), "address", val, token_for("address", val, secret)))
    for m in ADDRESS_PO_BOX_PATTERN.finditer(text):
        val = m.group()
        candidates.append((m.start(), m.end(), "address", val, token_for("address", val, secret)))
    for m in RESIDENCE_CUE_PATTERN.finditer(text):
        val = m.group(1)
        candidates.append((m.start(1), m.end(1), "address", val, token_for("address", val, secret)))

    # 9. Personal Names
    # 9a. Cued names
    for m in NAME_CUE_PATTERN.finditer(text):
        val = m.group(1).strip()
        words = val.split()
        if not any(w.lower() in EXCLUDED_WORDS for w in words):
            candidates.append((m.start(1), m.end(1), "name", val, token_for("name", val, secret)))

    # 9b. Titled names (e.g. Mr. Babatunde, Alhaji Musa Bello)
    for m in TITLE_NAME_PATTERN.finditer(text):
        val = m.group(2).strip()
        words = val.split()
        if not any(w.lower() in EXCLUDED_WORDS for w in words):
            candidates.append((m.start(2), m.end(2), "name", val, token_for("name", val, secret)))

    # 9c. Listed dictionary names
    word_tokens = [(m.start(), m.end(), m.group()) for m in re.finditer(r"\b[A-Za-zÀ-ÿ'-]+\b", text)]
    n_tokens = len(word_tokens)
    i = 0
    while i < n_tokens:
        start_i, end_i, w_i = word_tokens[i]
        w_i_lower = w_i.lower()
        if w_i_lower in TITLES_SET or w_i_lower in EXCLUDED_WORDS or len(w_i) < 2:
            i += 1
            continue

        prefix = text[:start_i].strip()
        is_titled = any(prefix.lower().endswith(t.lower()) for t in TITLES_SET)
        if w_i_lower in known_names or is_titled:
            cur_end = end_i
            j = i + 1
            while j < min(i + 3, n_tokens):
                start_j, end_j, w_j = word_tokens[j]
                gap = text[cur_end:start_j]
                if not gap.isspace() or "\n" in gap:
                    break
                w_j_lower = w_j.lower()
                if w_j_lower in EXCLUDED_WORDS or w_j_lower in TITLES_SET:
                    break
                if w_j_lower in known_names or (w_j[0].isupper() and len(w_j) >= 3):
                    cur_end = end_j
                    j += 1
                else:
                    break

            phrase = text[start_i:cur_end]
            candidates.append((start_i, cur_end, "name", phrase, token_for("name", phrase, secret)))
            i = j
            continue
        i += 1

    return candidates


def resolve_overlaps(candidates: List[Tuple[int, int, str, str, str]]) -> List[Tuple[int, int, str, str, str]]:
    """
    Sorts and filters candidate spans to resolve overlapping regions.
    Priority:
    1. PROTECTED (existing tokens)
    2. Specific kinds (phone, email, nin, bvn, vin, account)
    3. address
    4. name
    Longer span breaks ties.
    """
    priority = {
        "PROTECTED": 100,
        "phone": 90,
        "email": 90,
        "nin": 85,
        "bvn": 85,
        "vin": 85,
        "account": 85,
        "address": 70,
        "name": 50,
    }

    # Sort candidates by:
    # 1. start asc
    # 2. priority desc
    # 3. length desc
    sorted_candidates = sorted(
        candidates,
        key=lambda c: (c[0], -priority.get(c[2], 0), -(c[1] - c[0]))
    )

    selected: List[Tuple[int, int, str, str, str]] = []
    for cand in sorted_candidates:
        c_start, c_end, c_kind, c_val, c_tok = cand
        # Check overlap with already selected
        overlap = False
        for s_start, s_end, s_kind, s_val, s_tok in selected:
            # Overlap occurs if not (c_end <= s_start or c_start >= s_end)
            if c_start < s_end and c_end > s_start:
                overlap = True
                break
        if not overlap:
            selected.append(cand)

    # Sort selected spans by start position ascending
    selected.sort(key=lambda c: c[0])
    return selected


def redact(text: Optional[str], organisation: Any = None) -> RedactionResult:
    """
    Redacts personal identifiers from text before display, models, publication, or export.
    Returns RedactionResult(text=redacted_text, spans=auto_redactions).
    """
    if not text:
        return RedactionResult(text="", spans=[])

    secret = org_secret_key(organisation)
    candidates = find_candidate_spans(text, secret)
    spans = resolve_overlaps(candidates)

    chunks: List[str] = []
    output_spans: List[dict] = []
    last_idx = 0

    for start, end, kind, orig_val, tok in spans:
        if kind == "PROTECTED":
            # Keep existing token as-is
            chunks.append(text[last_idx:end])
            last_idx = end
            continue

        chunks.append(text[last_idx:start])
        new_start = len("".join(chunks))
        chunks.append(tok)
        new_end = new_start + len(tok)

        output_spans.append({
            "start": new_start,
            "end": new_end,
            "kind": kind,
            "token": tok,
            "original_start": start,
            "original_end": end,
        })
        last_idx = end

    chunks.append(text[last_idx:])
    redacted_text = "".join(chunks)

    return RedactionResult(text=redacted_text, spans=output_spans)


def safe_text(obj: Any) -> str:
    """
    Safe accessor returning redacted text for triage, duplicates, clusters,
    snapshots, audit export, and staff serializers.
    Checks:
    1. obj.redacted_description (manual redaction)
    2. obj.auto_redacted_description (automatic redaction)
    3. obj.description (fallback)
    """
    if obj is None:
        return ""
    if isinstance(obj, str):
        return obj

    if hasattr(obj, "redacted_description") and obj.redacted_description:
        return obj.redacted_description
    if hasattr(obj, "auto_redacted_description") and obj.auto_redacted_description:
        return obj.auto_redacted_description
    if hasattr(obj, "description") and obj.description:
        return obj.description

    if isinstance(obj, dict):
        return (
            obj.get("redacted_description")
            or obj.get("auto_redacted_description")
            or obj.get("description")
            or ""
        )

    return str(obj)
