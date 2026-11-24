from django.test import SimpleTestCase

from .aggregate import K, cell, complementary, matrix, series, sum_cells


class SuppressionTests(SimpleTestCase):
    def test_small_counts_are_hidden(self):
        self.assertEqual(cell(4), {"count": None, "suppressed": True})
        self.assertEqual(cell(K), {"count": K, "suppressed": False})

    def test_lone_hidden_value_cannot_be_derived_from_a_visible_total(self):
        counts = {"a": 2, "b": 9, "c": 30}
        result = series(counts)
        self.assertTrue(result["a"]["suppressed"])
        self.assertTrue(result["b"]["suppressed"])
        self.assertFalse(result["c"]["suppressed"])

    def test_hidden_cells_stay_hidden_until_they_sum_to_k(self):
        counts = {"a": 1, "b": 2, "c": 6, "d": 40}
        hidden = {"a", "b"}
        complementary(counts, hidden)
        self.assertEqual(hidden, {"a", "b", "c"})

    def test_lone_zero_needs_a_partner(self):
        counts = {"a": 0, "b": 12, "c": 15}
        hidden = {"a"}
        complementary(counts, hidden)
        self.assertEqual(hidden, {"a", "b"})

    def test_matrix_rows_and_columns_are_both_protected(self):
        from reports.incident_input import CATEGORIES as CATEGORY_SET

        CATEGORIES = sorted(CATEGORY_SET)

        states = ["KN", "LA"]
        counts = {(s, c): 20 for s in states for c in CATEGORIES}
        counts["KN", CATEGORIES[0]] = 1
        hidden = matrix(counts, states)
        self.assertIn(("KN", CATEGORIES[0]), hidden)
        row = [("KN", c) for c in CATEGORIES]
        column = [(s, CATEGORIES[0]) for s in states]
        for line in (row, column):
            hidden_sum = sum(counts[key] for key in line if key in hidden)
            self.assertTrue(hidden_sum >= K or hidden_sum == 0 or len([k for k in line if k in hidden]) == len(line))
        self.assertIn(("LA", CATEGORIES[0]), hidden)

    def test_combined_cells_hide_if_any_part_is_hidden(self):
        self.assertTrue(sum_cells([cell(10), cell(2)])["suppressed"])
        self.assertEqual(sum_cells([cell(10), cell(7)])["count"], 17)
