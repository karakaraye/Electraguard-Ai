"""Deterministic ordering for already-authorised comparison candidates."""

import re

VERSION = "time-category-text-v1"
WINDOW_MINUTES = 90
REVIEW_CANDIDATE_LIMIT = 12
RANKING_POOL_LIMIT = 120
STOP_WORDS = frozenset(
    "a an and are at be been by for from had has have in into is it of on or that the "
    "their them there they this to was were with would".split()
)


def _tokens(text):
    return frozenset(
        token for token in re.findall(r"[^\W\d_]+", text.casefold())
        if len(token) > 2 and token not in STOP_WORDS
    )


def _score(report, candidate, words):
    candidate_words = _tokens(candidate.description)
    union = words | candidate_words
    overlap = len(words & candidate_words) / len(union) if union else 0
    minutes = abs((report.occurred_at - candidate.occurred_at).total_seconds()) / 60
    proximity = max(0, 1 - minutes / WINDOW_MINUTES)
    same_category = report.category == candidate.category and report.category != "other"
    return 0.55 * overlap + 0.30 * proximity + 0.15 * same_category


def rank_candidates(report, candidates):
    """Rank a bounded candidate pool without changing its visibility or review state."""
    words = _tokens(report.description)
    return sorted(candidates, key=lambda candidate: _score(report, candidate, words), reverse=True)
