from unicodedata import category, normalize

from .incident_input import aware_datetime, field

STAGES = {
    "arrival": "arrival_time",
    "opening": "opened_on_time materials_all_present officials_present party_agents_present materials_missing",
    "accreditation": "device_working priority_given queue_size",
    "voting": "secrecy_kept assistance_available disruption inducement_seen",
    "closing_counting": "closed_on_time counting_public agents_signed",
    "results_posted": "sheet_posted",
}
MATERIALS = set("ballot_papers result_sheets ballot_boxes voting_cubicles indelible_ink voter_register accreditation_device stamps_seals other".split())


def clean_text(value, minimum, maximum):
    if isinstance(value, str):
        value = normalize("NFC", value.strip())
        if minimum <= len(value) <= maximum and not any(category(c) in {"Cc", "Cs"} and c != "\n" for c in value):
            return value
    return None


def checklist_input(data, errors):
    stage = data.get("stage")
    allowed = STAGES.get(stage, "").split() if isinstance(stage, str) else []
    if not allowed:
        errors["stage"] = field("invalid_choice", "Choose a checklist stage.")
    answers = data.get("answers")
    clean = {}
    if not isinstance(answers, list):
        errors["answers"] = field("required", "Enter the checklist answers.")
    else:
        for index, item in enumerate(answers):
            question = item.get("question") if isinstance(item, dict) else None
            key = f"answers.{index}"
            if question not in allowed:
                errors[key] = field("invalid_choice", "Choose a question from this stage.")
                continue
            if question in clean:
                errors[key] = field("duplicate", "Answer each question once.")
                continue
            value = item.get("answer")
            if question == "arrival_time":
                parsed = aware_datetime(value)
                valid = parsed is not None
                value = parsed.isoformat() if parsed else None
            elif question == "materials_missing":
                valid = isinstance(value, list) and all(isinstance(v, str) and v in MATERIALS for v in value)
                valid = valid and len(set(value)) == len(value)
            elif question == "queue_size":
                valid = value in ("none", "under_50", "50_200", "over_200")
            else:
                valid = value in ("yes", "no", "not_seen")
            if not valid:
                errors[key] = field("invalid", "Enter a valid answer.")
            clean[question] = value
    if "materials_missing" in clean and clean.get("materials_all_present") != "no":
        errors["answers.materials_missing"] = field("not_allowed_for_kind", "Select missing materials only when materials were missing.")
    note = data.get("note")
    if note is not None and (note := clean_text(note, 0, 1000)) is None:
        errors["note"] = field("invalid", "Use up to 1000 characters without control characters.")
    return {"stage": stage, "answers": [dict(question=q, answer=a) for q, a in clean.items()], "note": note}


def result_input(data, labels, errors):
    sheet = data.get("result_sheet")
    if not isinstance(sheet, dict):
        errors["result_sheet"] = field("required", "Enter the result sheet.")
        return {}
    unreadable = sheet.get("unreadable", False)
    if type(unreadable) is not bool:
        errors["result_sheet.unreadable"] = field("invalid", "Choose true or false.")
    votes = sheet.get("votes")
    if not isinstance(votes, dict) or set(votes) != set(labels):
        errors["result_sheet.votes"] = field("invalid", "Enter the organisation's party labels.")
        votes = {}
    numbers = {k: sheet.get(k) for k in ("registered", "accredited", "rejected")}
    numbers.update({f"votes.{k}": v for k, v in votes.items()})
    for key, value in numbers.items():
        if value is None and unreadable is True and (key in sheet or key.startswith("votes.")):
            continue
        if type(value) is not int or not 0 <= value <= 99999:
            errors[f"result_sheet.{key}"] = field("invalid", "Use a whole number from 0 to 99999.")
    confirmed = sheet.get("confirmed_fields")
    if not isinstance(confirmed, list) or any(not isinstance(k, str) or numbers.get(k) is None for k in confirmed) or len(set(confirmed)) != len(confirmed):
        errors["result_sheet.confirmed_fields"] = field("invalid", "Choose the entries you confirmed.")
    method = sheet.get("entry_method")
    if method not in ("ocr_confirmed", "manual", "offline_ocr"):
        errors["result_sheet.entry_method"] = field("invalid_choice", "Choose an entry method.")
    return {**{k: sheet.get(k) for k in ("registered", "accredited", "rejected")},
            "votes": votes, "confirmed_fields": confirmed, "entry_method": method, "unreadable": unreadable}
