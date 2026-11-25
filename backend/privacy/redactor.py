import hashlib
import hmac
import os
import re
from dataclasses import dataclass
from typing import Any, List, NamedTuple, Optional, Set, Tuple

from django.conf import settings


# Pattern for already-redacted tokens so they are never re-redacted
EXISTING_TOKEN_PATTERN = re.compile(r"\[[A-Z0-9]+_[0-9a-f]{4,6}\]")

# Nigerian phone regex: +234 or 0, then 7/8/9, then 0/1, then 8 digits (spaces/dashes/parens allowed)
PHONE_PATTERN = re.compile(
    r"(?<!\d)(?:\(\s*(?:\+?234|0)[789][01]\d\s*\)(?:[ -.]*\d){7}|\(\s*\+?234\s*\)[ -.]*[789][01](?:[ -.]*\d){8}|(?:\+?234|0)[ -.]*[789][01](?:[ -.]*\d){8})(?!\d)"
)

# Email regex
EMAIL_PATTERN = re.compile(
    r"\b[A-Za-z0-9._%+-]+@[A-Za-z0-9.-]+\.[A-Za-z]{2,}\b"
)

# NIN: 11 digits (single spaces/dashes allowed) in same sentence after NIN or NIMC, within 30 chars
NIN_PREFIX_PATTERN = re.compile(
    r"(?i)\b(?:nin|nimc)\b[^.\n!?]{0,30}?(?<!\d)(\d(?:[ -]?\d){10})(?!\d)"
)

# BVN: 11 digits (single spaces/dashes allowed) in same sentence after BVN, within 30 chars
BVN_PREFIX_PATTERN = re.compile(
    r"(?i)\bbvn\b[^.\n!?]{0,30}?(?<!\d)(\d(?:[ -]?\d){10})(?!\d)"
)

# VIN / Voter card number: 19 alphanumeric characters (single spaces/dashes allowed) within 30 chars of VIN or PVC, or starting with 90F5
VIN_PREFIX_PATTERN = re.compile(
    r"(?i)\b(?:vin|pvc)\b[^.\n!?]{0,30}?(?<![A-Za-z0-9])([A-Za-z0-9](?:[ -]?[A-Za-z0-9]){18})(?![A-Za-z0-9])"
)
VIN_SUFFIX_PATTERN = re.compile(
    r"(?i)(?<![A-Za-z0-9])([A-Za-z0-9](?:[ -]?[A-Za-z0-9]){18})(?![A-Za-z0-9])[^.\n!?]{0,30}?\b(?:vin|pvc)\b"
)
VIN_STANDARD_PATTERN = re.compile(
    r"(?i)\b(90F5(?:[ -]?[A-Za-z0-9]){15})\b"
)

# Account number: 10 digits (single spaces/dashes allowed) immediately following account phrase within 15 chars
ACCOUNT_PREFIX_PATTERN = re.compile(
    r"(?i)(?:\baccount\s+(?:no\.?|number)\b|\ba/c\b|\b(?:account|acct|nuban)\b)(?:[:=\-\s]{0,5}(?:is|no\.?|number|na)?[:=\-\s]{0,5})(?<!\d)(\d(?:[ -]?\d){9})(?!\d)"
)

OFFICIAL_PLACE_WORDS: Set[str] = {"ward", "unit", "polling", "lga", "collation"}

# House Address: Numbered address with capitalised street name + street word, or PO Box
STREET_WORDS = (
    r"street|st\.?|road|rd\.?|avenue|ave\.?|close|cl\.?|crescent|cres\.?|"
    r"way|lane|lne|drive|dr\.?|estate|layout|boulevard|blvd|expressway|"
    r"highway|quarters|qtrs|terrace"
)
ADDRESS_NUMBERED_PATTERN = re.compile(
    rf"\b(?:(?:[Nn]o\.?|[Hh]ouse|[Pp]lot|[Ff]lat|[Bb]lock|[Bb]lk|[Aa]pt)\s*)?\d{{1,4}}[a-zA-Z]?(?:[/-]\d{{1,4}})?\s+(?:[A-Z][a-zA-Z0-9.'-]*\s+){{1,4}}(?:(?i:{STREET_WORDS}))\b"
)
ADDRESS_PO_BOX_PATTERN = re.compile(
    r"(?i)\b(?:p\.?\s*o\.?\s*box)\s+\d+\b"
)
RESIDENCE_CUE_PATTERN = re.compile(
    rf"\b(?:[Ll]ives?\s+at|[Ll]iving\s+at|[Ss]tay\s+at|[Rr]eside\s+at|[Hh]ouse\s+is\s+at|[Aa]ddress\s+is|[Dd]ey\s+stay\s+for)\s+(\d{{1,4}}[a-zA-Z]?(?:[/-]\d{{1,4}})?\s+(?:[A-Z][a-zA-Z0-9.'-]*\s+){{1,4}}(?:(?i:{STREET_WORDS})))\b"
)

# Personal names: Titles followed by capitalised name
TITLE_WORDS = (
    r"Mr|Mrs|Ms|Miss|Mister|Dr|Chief|Alhaji|Alh|Alhaja|Hajia|Hajiya|Mallam|Malam|"
    r"Pastor|Pst|Rev|Revd|Reverend|Engr|Barr|Barrister|Prof|Professor|Prince|Princess|"
    r"Otunba|Oba|Deacon|Deaconess|Evangelist|Evang|Apostle|Bishop|Imam|Ustaz|Sheikh|"
    r"Hon|Honourable|Honorable|Comrade|Comr|Senator|Sen|Gen|Col|Capt|Major|Sgt|Cpl|"
    r"Insp|Inspector|Oga|Mama|Papa|Baba|Madam|Sister|Brother|Uncle|Aunty|"
    r"Mazi|Nwanyi|Ichie|Igwe|Eze|Dọkịta|Dokita|Arakunrin|Iyaafin|Omidan|Oloye|Sarki|Waziri|Magaji"
)
TITLE_NAME_PATTERN = re.compile(
    rf"\b(?:(?:{TITLE_WORDS})\.?\s+){{1,2}}([A-ZÀ-ÿ][a-zA-ZÀ-ÿ]*(?:\s+[A-ZÀ-ÿ][a-zA-ZÀ-ÿ]*){{0,2}})\b"
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
        raise ValueError("An organisation is required for redaction.")

    if isinstance(organisation, bytes):
        if len(organisation) < 16:
            raise ValueError("Organisation secret bytes must be at least 16 bytes.")
        return organisation

    if hasattr(organisation, "discussion") and getattr(organisation, "discussion_id", None):
        org_id = organisation.discussion.organisation_id
    elif hasattr(organisation, "report") and getattr(organisation, "report_id", None):
        org_id = organisation.report.organisation_id
    elif hasattr(organisation, "organisation_id") and organisation.organisation_id is not None:
        org_id = organisation.organisation_id
    elif hasattr(organisation, "pk") and organisation.__class__.__name__ == "Organisation":
        org_id = organisation.pk
    elif isinstance(organisation, str) and organisation:
        org_id = organisation
    elif hasattr(organisation, "hex"):  # UUID
        org_id = organisation
    else:
        raise ValueError("Cannot resolve organisation for redaction.")

    from privacy.models import OrganisationSecret
    obj, _ = OrganisationSecret.objects.get_or_create(
        organisation_id=org_id,
        defaults={"secret": os.urandom(32)},
    )
    return bytes(obj.secret)


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

    # 4. IDs and Accounts: run all PREFIX patterns before SUFFIX patterns so closer/preceding keywords win ties
    for m in NIN_PREFIX_PATTERN.finditer(text):
        val = m.group(1)
        candidates.append((m.start(1), m.end(1), "nin", val, token_for("nin", val, secret)))
    for m in BVN_PREFIX_PATTERN.finditer(text):
        val = m.group(1)
        candidates.append((m.start(1), m.end(1), "bvn", val, token_for("bvn", val, secret)))
    for m in VIN_PREFIX_PATTERN.finditer(text):
        val = m.group(1)
        if any(c.isdigit() for c in val):
            candidates.append((m.start(1), m.end(1), "vin", val, token_for("vin", val, secret)))
    for m in VIN_STANDARD_PATTERN.finditer(text):
        val = m.group(1)
        candidates.append((m.start(1), m.end(1), "vin", val, token_for("vin", val, secret)))
    for m in ACCOUNT_PREFIX_PATTERN.finditer(text):
        val = m.group(1)
        candidates.append((m.start(1), m.end(1), "account", val, token_for("account", val, secret)))

    for m in VIN_SUFFIX_PATTERN.finditer(text):
        val = m.group(1)
        if any(c.isdigit() for c in val):
            candidates.append((m.start(1), m.end(1), "vin", val, token_for("vin", val, secret)))

    # 8. Address (exclude official/place words like Ward, Unit, Polling, LGA, Collation)
    for m in ADDRESS_NUMBERED_PATTERN.finditer(text):
        val = m.group()
        tokens_lower = {w.lower().strip(".,") for w in val.split()}
        if not (tokens_lower & OFFICIAL_PLACE_WORDS):
            candidates.append((m.start(), m.end(), "address", val, token_for("address", val, secret)))
    for m in ADDRESS_PO_BOX_PATTERN.finditer(text):
        val = m.group()
        candidates.append((m.start(), m.end(), "address", val, token_for("address", val, secret)))
    for m in RESIDENCE_CUE_PATTERN.finditer(text):
        val = m.group(1)
        tokens_lower = {w.lower().strip(".,") for w in val.split()}
        if not (tokens_lower & OFFICIAL_PLACE_WORDS):
            candidates.append((m.start(1), m.end(1), "address", val, token_for("address", val, secret)))

    # 9. Personal Names
    # 9a. Cued names
    for m in NAME_CUE_PATTERN.finditer(text):
        val = m.group(1).strip()
        words = val.split()
        if not any(w.lower() in EXCLUDED_WORDS or w.lower() in TITLES_SET for w in words):
            candidates.append((m.start(1), m.end(1), "name", val, token_for("name", val, secret)))

    # 9b. Titled names (e.g. Mr. Babatunde, Alhaji Musa Bello)
    for m in TITLE_NAME_PATTERN.finditer(text):
        val = m.group(1).strip()
        words = val.split()
        if not any(w.lower() in EXCLUDED_WORDS or w.lower() in TITLES_SET for w in words):
            candidates.append((m.start(1), m.end(1), "name", val, token_for("name", val, secret)))

    # 9c. Listed dictionary names (must be capitalised) & whole-word preceding title
    word_tokens = [(m.start(), m.end(), m.group()) for m in re.finditer(r"\b[A-Za-zÀ-ÿ'-]+\b", text)]
    n_tokens = len(word_tokens)
    i = 0
    while i < n_tokens:
        start_i, end_i, w_i = word_tokens[i]
        w_i_lower = w_i.lower()
        if w_i_lower in TITLES_SET or w_i_lower in EXCLUDED_WORDS or len(w_i) < 2 or not w_i[0].isupper():
            i += 1
            continue

        is_titled = False
        if i > 0:
            _, prev_end, prev_w = word_tokens[i - 1]
            gap_prev = text[prev_end:start_i]
            if prev_w.lower() in TITLES_SET and "\n" not in gap_prev and re.fullmatch(r"\.?\s+", gap_prev):
                is_titled = True

        if w_i_lower in known_names or is_titled:
            cur_end = end_i
            j = i + 1
            while j < min(i + 3, n_tokens):
                start_j, end_j, w_j = word_tokens[j]
                gap = text[cur_end:start_j]
                if not gap.isspace() or "\n" in gap:
                    break
                w_j_lower = w_j.lower()
                if w_j_lower in EXCLUDED_WORDS or w_j_lower in TITLES_SET or not w_j[0].isupper():
                    break
                if w_j_lower in known_names or len(w_j) >= 3:
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


def safe_text(obj: Any, organisation: Any = None) -> str:
    """
    Safe accessor returning redacted text for triage, duplicates, clusters,
    snapshots, audit export, and staff serializers.
    Handles Report, CitizenReply, Post, MediaItem (transcript), ReviewEvent, dict, and str.
    """
    if obj is None:
        return ""
    if isinstance(obj, str):
        return redact(obj, organisation).text

    org = (
        getattr(obj, "organisation_id", None)
        or getattr(obj, "organisation", None)
        or (obj.discussion.organisation_id if hasattr(obj, "discussion") and getattr(obj, "discussion_id", None) else None)
        or (obj.report.organisation_id if hasattr(obj, "report") and getattr(obj, "report_id", None) else None)
        or organisation
    )

    # Report or report-like object
    if hasattr(obj, "description"):
        if getattr(obj, "redacted_description", None):
            return obj.redacted_description
        if getattr(obj, "auto_redacted_description", None):
            return obj.auto_redacted_description
        return redact(obj.description, org).text if obj.description else ""

    # CitizenReply, Post, or message-like object
    if hasattr(obj, "body"):
        if getattr(obj, "auto_redacted_body", None):
            return obj.auto_redacted_body
        return redact(obj.body, org).text if obj.body else ""

    # MediaItem transcript
    if hasattr(obj, "transcript"):
        return redact(obj.transcript, org).text if obj.transcript else ""

    # ReviewEvent (note in change)
    if hasattr(obj, "change") and isinstance(obj.change, dict):
        if obj.change.get("auto_redacted_body"):
            return obj.change["auto_redacted_body"]
        note = obj.change.get("note")
        return redact(str(note), org).text if note else ""

    if isinstance(obj, dict):
        if obj.get("redacted_description"):
            return obj["redacted_description"]
        if obj.get("auto_redacted_description"):
            return obj["auto_redacted_description"]
        if obj.get("auto_redacted_body"):
            return obj["auto_redacted_body"]
        raw = obj.get("description") or obj.get("body") or obj.get("transcript") or obj.get("note") or ""
        return redact(str(raw), org).text if raw else ""

    raise TypeError(f"Unsupported object type for safe_text: {type(obj).__name__}")
