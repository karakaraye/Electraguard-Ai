"""Local result-sheet checks. Warnings suggest what to verify on the original."""
from numbers import Integral

VOTE_FIELDS = tuple(f"votes_{party}" for party in "ABCDE") + ("rejected_votes",)
CHECKS = {
    "accredited_exceeds_registered": ("accredited_exceeds_registered", "rs.flag.accredited_exceeds_registered"),
    "sum_mismatch": ("votes_plus_rejected_differs", "rs.flag.sum_differs"),
    "suspicious_round_numbers": ("round_numbers", "rs.flag.round_numbers"),
    "duplicated_from_previous_unit": ("identical_to_other_unit", "rs.flag.identical_to_other_unit"),
    "digit_transposition": ("possible_digit_swap", "rs.flag.possible_digit_swap"),
}


def count(sheet, field):
    value = sheet.get(field)
    return int(value) if isinstance(value, Integral) and not isinstance(value, bool) and value >= 0 else None


def digit_swap(value, expected):
    if expected < 0:
        return False
    digits = str(value)
    target = str(expected)
    if len(digits) != len(target):
        return False
    changes = [(left, right) for left, right in zip(digits, target) if left != right]
    return len(changes) == 2 and changes[0] == changes[1][::-1]


def evaluate_sheet(sheet, previous=None):
    registered, accredited = (count(sheet, name) for name in ("registered_voters", "accredited_voters"))
    votes = tuple(count(sheet, name) for name in VOTE_FIELDS)
    flags = {}
    if None not in (accredited, registered) and accredited > registered:
        flags["accredited_exceeds_registered"] = {"accredited": accredited, "registered": registered}
    total = sum(votes) if None not in votes else None
    if accredited is not None and total is not None and total != accredited:
        flags["sum_mismatch"] = {"accredited": accredited, "sum": total}
        difference = accredited - total
        if digit_swap(accredited, total) or any(digit_swap(vote, vote + difference) for vote in votes):
            flags["digit_transposition"] = {"accredited": accredited, "sum": total}
    round_votes = sum(vote is not None and vote > 0 and vote % 10 == 0 for vote in votes[:5])
    if round_votes >= 4:
        flags["suspicious_round_numbers"] = {"rounded_party_counts": round_votes}
    if (previous and sheet.get("pu_id") != previous.get("pu_id")
            and None not in votes[:5] and any(votes[:5])
            and votes[:5] == tuple(count(previous, name) for name in VOTE_FIELDS[:5])):
        flags["duplicated_from_previous_unit"] = {"other_polling_unit_code": previous.get("pu_id")}
    return flags


def result_sheet_flags(sheet, previous=None):
    return [
        {"type": CHECKS[label][0], "explanation_key": CHECKS[label][1], "values": values,
         "benign_causes_keys": ["rs.benign.copy_error", "rs.benign.unread_digit"]}
        for label, values in evaluate_sheet(sheet, previous).items()
    ]
