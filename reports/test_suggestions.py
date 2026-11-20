from datetime import datetime, timedelta, timezone
from types import SimpleNamespace
from unittest import TestCase

from .suggestions import rank_candidates


def observation(description, minutes=0, category="access"):
    observed = datetime(2026, 1, 1, 8, tzinfo=timezone.utc)
    return SimpleNamespace(
        occurred_at=observed + timedelta(minutes=minutes),
        description=description,
        category=category,
    )


class RankingTests(TestCase):
    def test_close_unrelated_report_can_rank_below_matching_observation(self):
        original = observation("The main entrance ramp was blocked by chairs.")
        unrelated = observation("The accessible toilet had a stiff lock.", minutes=1)
        paraphrase = observation("Chairs blocked the ramp at the main entrance.", minutes=8)

        self.assertEqual(rank_candidates(original, [unrelated, paraphrase]), [paraphrase, unrelated])

    def test_ties_preserve_caller_order_and_do_not_modify_the_candidate_pool(self):
        original = observation("The ballot scanner failed.", category="materials")
        first = observation("Short interruption.", minutes=7, category="other")
        second = observation("Brief pause.", minutes=7, category="other")
        ordered = [first, second]

        self.assertEqual(rank_candidates(original, ordered), ordered)
        self.assertEqual(ordered, [first, second])
        self.assertEqual(rank_candidates(original, []), [])
