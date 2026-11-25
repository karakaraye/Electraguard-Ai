"""Content filter for ward check-in notices (Plan 5D).

Rejects:
- Polling unit codes (KnownPollingUnit or PU code patterns)
- Phone numbers
- Emails
- Links / URLs
- Personal names (via C16 redactor)
- Party and candidate names (via political_terms.txt)

Returns all reasons found, not just the first.
"""

import os
import re
from functools import lru_cache
from pathlib import Path

from privacy.redactor import redact
from reference.models import KnownPollingUnit

PU_CODE_PATTERN = re.compile(r"\b(?:SYN-)?[A-Z]{2,3}-[0-9]{2}-[0-9]{2}-[0-9]{3}\b", re.IGNORECASE)
PHONE_PATTERN = re.compile(
    r"(?:\+234\s?[789][01]\d{1}[-\s]?\d{3}[-\s]?\d{4}|\b0[789][01]\d{1}[-\s]?\d{3}[-\s]?\d{4}\b|\b080\d{8}\b|\b081\d{8}\b|\b090\d{8}\b|\b091\d{8}\b|\b070\d{8}\b)"
)
EMAIL_PATTERN = re.compile(r"\b[A-Za-z0-9._%+-]+@[A-Za-z0-9.-]+\.[A-Z|a-z]{2,}\b")
LINK_PATTERN = re.compile(
    r"(?:https?://[^\s]+|www\.[^\s]+|\b[a-zA-Z0-9-]+\.(?:com|org|gov|ng|net|io|edu|co)(?:/[^\s]*)?\b)",
    re.IGNORECASE,
)

TERMS_FILE = Path(__file__).resolve().parent / "data" / "political_terms.txt"


@lru_cache(maxsize=1)
def _political_patterns():
    patterns = []
    if TERMS_FILE.exists():
        for line in TERMS_FILE.read_text(encoding="utf-8").splitlines():
            line = line.strip()
            if line and not line.startswith("#"):
                patterns.append(re.compile(r"\b" + re.escape(line) + r"\b", re.IGNORECASE))
    return patterns


def check_polling_units(text: str) -> bool:
    if PU_CODE_PATTERN.search(text):
        return True
    candidates = set(re.findall(r"[\w-]+", text)) | set(re.findall(r"[\w-]+", text.upper()))
    try:
        return KnownPollingUnit.objects.filter(pk__in=candidates).exists()
    except Exception:
        return False


def check_personal_names(text: str) -> bool:
    try:
        dummy_secret = b"notices-filter-name-check-secret!"
        res = redact(text, dummy_secret)
        return any(s.kind == "name" for s in res.spans)
    except Exception:
        return False


def check_political_terms(text: str) -> bool:
    for pat in _political_patterns():
        if pat.search(text):
            return True
    return False


def validate_notice_content(text: str) -> tuple[bool, list[str]]:
    """Return (is_blocked, list_of_reasons). Every found reason is included."""
    if not text:
        return False, []

    reasons = []

    if check_polling_units(text):
        reasons.append("contains_polling_unit_code")

    if PHONE_PATTERN.search(text):
        reasons.append("contains_phone_number")

    if EMAIL_PATTERN.search(text):
        reasons.append("contains_email")

    if LINK_PATTERN.search(text):
        reasons.append("contains_link")

    if check_personal_names(text):
        reasons.append("contains_personal_name")

    if check_political_terms(text):
        reasons.append("contains_political_term")

    is_blocked = len(reasons) > 0
    return is_blocked, reasons
