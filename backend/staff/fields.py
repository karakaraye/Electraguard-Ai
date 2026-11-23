import unicodedata

from accounts.observer_auth import validation


def invalid(name, code="invalid", message="Enter a valid value."):
    return validation({name: {"code": code, "message": message}})


def text_field(value):
    if not isinstance(value, str):
        return None
    value = unicodedata.normalize("NFC", value.strip())
    if not 1 <= len(value) <= 2000:
        return None
    if any(unicodedata.category(char) in {"Cc", "Cs"} and char != "\n" for char in value):
        return None
    return value


def category(report):
    decision = report.review_suggestions.get("category", {})
    if decision.get("corrected_value"):
        return {"value": decision["corrected_value"], "source": "corrected"}
    return {"value": observed_category(report.incident_details), "source": "observer"}


def observed_category(details):
    return details.get("category_observer") or details.get("category")
