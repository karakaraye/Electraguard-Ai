import re
from datetime import timedelta

from django.db import transaction
from django.utils import timezone
from django.utils.crypto import salted_hmac

from accounts.observer_credentials import rate_limit
from reference.models import AreaDataset, resolve_place
from reports.idempotency import lock_key
from reports.models import Report, ReviewEvent
from reports.citizen_views import normalize_receipt, persist_reply
from reports.v1_views import question_id

from .intake import create_report, paused
from .models import Callback, OutboundSMS, PhoneLanguage, PhoneReporter
from .text import CATEGORIES, KEYWORDS, LABELS, LANGUAGES, LANGUAGE_REPLY, MENUS, ascii_text, help_text

PAUSED = "Reporting is paused. Please try later."
LIMIT = "Too many messages. Please try later."
UNAVAILABLE = "Please try again later."
PHONE = re.compile(r"\+[1-9][0-9]{7,14}\Z")
AREA_CODE = re.compile(r"[A-Z0-9]+(?:-[A-Z0-9]+){1,5}\Z")


class ChannelLimited(Exception):
    def __init__(self, retry):
        self.retry = retry


def digest(purpose, value):
    return salted_hmac("phone-channel:" + purpose, value, algorithm="sha256").hexdigest()


def place(code):
    return resolve_place(code) or resolve_place(None, code)


def status_text(organisation, code, simulated):
    report = Report.objects.filter(organisation=organisation, receipt_code=code).first()
    if report is None or bool(report.incident_details.get("simulated")) != simulated:
        return "We could not find that code."
    states = {
        Report.Status.SUBMITTED: "received", Report.Status.IN_REVIEW: "being reviewed",
        Report.Status.NEEDS_CLARIFICATION: "a reviewer has a question",
        Report.Status.CLOSED: "closed", Report.Status.WITHDRAWN: "withdrawn",
    }
    return f"{code}: {states[report.status]}."


def reply_to_question(organisation, phone_hash, code, text):
    reporter = PhoneReporter.objects.filter(
        organisation=organisation, phone_hash=phone_hash, report__receipt_code=code,
    ).first()
    if reporter is not None:
        report = Report.objects.select_for_update().filter(organisation=organisation, pk=reporter.report_id).first()
        if report and report.status == Report.Status.NEEDS_CLARIFICATION:
            event = ReviewEvent.objects.filter(
                organisation=organisation, report=report, action=ReviewEvent.Action.REQUEST_CLARIFICATION,
            ).order_by("-version").first()
            if event:
                result = persist_reply(report, {"body": text, "question_id": question_id(report.pk, event.version)})
                if isinstance(result, tuple) and result[0] == 201:
                    return "Thank you. Your answer was sent."
    return "We could not find an open question for that code."


def report_limit(organisation, actor):
    return rate_limit("channel-report", f"{organisation.pk}:{actor}", 10, 3600)


def limit_reply(organisation, phone_hash):
    return LIMIT if rate_limit("channel-limit-reply", f"{organisation.pk}:{phone_hash}", 1, 3600) is None else ""


def sms_command(organisation, phone_hash, text, simulated, actor):
    if not simulated and rate_limit("channel-command", f"{organisation.pk}:{phone_hash}", 30, 3600) is not None:
        return limit_reply(organisation, phone_hash)
    preference = PhoneLanguage.objects.filter(
        organisation=organisation, phone_hash=phone_hash, expires_at__gt=timezone.now(),
    ).first()
    language = preference.language if preference else "en"
    parts = text.strip().split(maxsplit=1)
    keyword, arguments = (parts + ["", ""])[:2]
    index = next((words.index(ascii_text(keyword).upper()) for words in KEYWORDS.values()
                  if ascii_text(keyword).upper() in words), None)
    args = arguments.split(maxsplit=1)
    if index == 0 and len(args) == 2 and args[0] in "0123456789" and len(args[0]) == 1:
        category, description = args
        first, _, remainder = description.partition(" ")
        area = {}
        if AREA_CODE.fullmatch(first.upper()) and any(char.isdigit() for char in first):
            # A token with digits is a ward or unit code. An unknown code is refused, not filed as text.
            area = place(first.upper())
            if area is None or not remainder.strip():
                return help_text(language)
            description = remainder.strip()
        if paused(organisation):
            return PAUSED
        retry = report_limit(organisation, actor)
        if retry is not None:
            if simulated:
                raise ChannelLimited(retry)
            return limit_reply(organisation, phone_hash)
        report = create_report(organisation, phone_hash, "sms", simulated, CATEGORIES[int(category)],
                               language, description, area, None)
        return f"ElectraGuard: received. Your code: {report.receipt_code}. Text STATUS {report.receipt_code} to check."
    if index == 1:
        code = normalize_receipt(arguments)
        return status_text(organisation, code, simulated) if code else "Check the receipt code."
    if index == 2 and len(args) == 2 and (code := normalize_receipt(args[0])):
        return reply_to_question(organisation, phone_hash, code, args[1])
    if index == 3 and len(args) == 1 and args[0].lower() in LANGUAGES:
        language = args[0].lower()
        PhoneLanguage.objects.update_or_create(
            organisation=organisation, phone_hash=phone_hash,
            defaults={"language": language, "expires_at": timezone.now() + timedelta(days=30)},
        )
        return LANGUAGE_REPLY[language]
    return help_text(language)


@transaction.atomic
def handle_sms(organisation, phone, message_id, short_code, text, *, simulated=False, actor=None):
    if not PHONE.fullmatch(phone) or not message_id or len(message_id) > 128:
        return ""
    if not simulated and phone.startswith("+2340000"):
        return ""
    phone_hash = digest("number", phone)
    key = digest("sms", message_id)
    if not lock_key(f"channel:{organisation.pk}:{key}", timeout="500ms"):
        return ""
    if Callback.objects.filter(organisation=organisation, key=key).exists():
        return ""
    reply = sms_command(organisation, phone_hash, text.replace("\x00", "")[:160], simulated, actor or phone_hash)
    Callback.objects.create(organisation=organisation, key=key)
    if reply and not simulated:
        OutboundSMS.objects.create(organisation=organisation, destination=phone, short_code=short_code[:32], text=reply)
    return reply


def menu(title, entries, page=0):
    start = 8 * page
    label_width = max(1, (182 - len("CON ") - len(title) - len("\n98 More 0 Back")) // 8 - 4)
    lines = [title] + [
        f"{i}. {ascii_text(item['name'])[:label_width]}"
        for i, item in enumerate(entries[start:start+8], 1)
    ]
    lines.append(("98 More " if start + 8 < len(entries) else "") + "0 Back")
    return "\n".join(lines)


def walk_ussd(inputs, *, confirmed=False):
    language = None
    state = lga = None
    category = danger = None
    stage = 0
    page = 0
    dataset = AreaDataset.objects.first()
    states = sorted(dataset.states.values(), key=lambda item: item["name"]) if dataset else []
    for index, value in enumerate(inputs):
        value = value.strip()
        if stage == 0 and value in {"1", "2", "3", "4", "5"}:
            language = LANGUAGES[int(value)-1]
            stage = 1
        elif stage == 1 and value in set("0123456789"):
            category = int(value)
            stage = 2
        elif stage == 2 and value in {"1", "2"}:
            danger = value == "1"
            stage = 3
        elif stage in (3, 4):
            entries = states if stage == 3 else state["lgas"]
            if value == "98" and (page + 1) * 8 < len(entries):
                page += 1
            elif value == "0":
                if page:
                    page -= 1
                else:
                    stage -= 1
            elif value in set("12345678") and (offset := page*8 + int(value) - 1) < len(entries):
                if stage == 3:
                    state = entries[offset]
                else:
                    lga = entries[offset]
                stage += 1
                page = 0
        elif stage == 5:
            remaining = inputs[index:]
            words = remaining[:-1] if confirmed else remaining
            description = "*".join(words).strip()
            prompt = MENUS[language]
            if not description or len(description) > 140:
                return "CON " + prompt[6] + ":", None
            if confirmed:
                if remaining[-1] == "2":
                    return "END " + prompt[10], None
                area = {
                    "state_code": state["state_code"], "state_name": state["name"],
                    "lga_code": lga["lga_code"], "lga_name": lga["name"],
                    "ward_code": None, "ward_name": None, "polling_unit_code": None, "polling_unit_name": None,
                }
                return None, (CATEGORIES[category], language, description, area, danger)
            return f"CON {prompt[7]} {LABELS[language][category]} {'in' if language == 'en' else '/'} {ascii_text(lga['name'])[:60]}\n1 {prompt[8]} 2 {prompt[9]}", None

    if stage == 0:
        return "CON ElectraGuard\n1 English 2 Naija 3 Hausa 4 Yoruba 5 Igbo", None
    prompt = MENUS[language]
    if stage == 1:
        labels = LABELS[language]
        return "CON " + prompt[0] + "\n" + "\n".join(f"{i} {labels[i]}" for i in (*range(1, 10), 0)), None
    if stage == 2:
        return f"CON {prompt[1]}\n1 {prompt[2]} 2 {prompt[3]}", None
    if stage == 3:
        title = ("Call 112 if you can.\n" if danger else "") + prompt[4] + ":"
        return "CON " + menu(title, states, page), None
    if stage == 4:
        return "CON " + menu(prompt[5] + ":", state["lgas"], page), None
    return "CON " + prompt[6] + ":", None


@transaction.atomic
def handle_ussd(organisation, phone, session_id, short_code, text, *, simulated=False, actor=None):
    if (not PHONE.fullmatch(phone) or not session_id or len(session_id) > 128 or len(text) > 1024 or "\x00" in text
            or (not simulated and phone.startswith("+2340000"))):
        return "END " + UNAVAILABLE, ""
    phone_hash = digest("number", phone)
    key = digest("ussd", f"{phone_hash}:{session_id}")
    previous = Callback.objects.filter(organisation=organisation, key=key).first()
    if previous:
        return previous.response, ""
    if paused(organisation):
        return "END " + PAUSED, ""
    if not text and not simulated and rate_limit(
        "channel-command", f"{organisation.pk}:{phone_hash}", 30, 3600,
    ) is not None:
        return "END " + (limit_reply(organisation, phone_hash) or UNAVAILABLE), ""
    inputs = text.split("*") if text else []
    prompt_prefix, _, choice = text.rpartition("*")
    prefix_key = digest("ussd-prompt", f"{key}:{prompt_prefix}")
    confirmed = choice in {"1", "2"} and Callback.objects.filter(
        organisation=organisation, key=prefix_key, created_at__gte=timezone.now() - timedelta(minutes=5),
    ).exists()
    response, submission = walk_ussd(inputs, confirmed=confirmed)
    if submission is None:
        if response.startswith(tuple(f"CON {values[7]} " for values in MENUS.values())):
            # The gateway uses the same separator for user input and menu turns.
            # Remember only the digest of a displayed confirmation prompt.
            Callback.objects.get_or_create(
                organisation=organisation, key=digest("ussd-prompt", f"{key}:{text}"),
                defaults={"response": "prompt"},
            )
        return response, ""
    if not lock_key(f"channel:{organisation.pk}:{key}", timeout="500ms"):
        return "END " + UNAVAILABLE, ""
    previous = Callback.objects.filter(organisation=organisation, key=key).first()
    if previous:
        return previous.response, ""
    retry = report_limit(organisation, actor or phone_hash)
    if retry is not None:
        if simulated:
            raise ChannelLimited(retry)
        return "END " + (limit_reply(organisation, phone_hash) or UNAVAILABLE), ""
    report = create_report(organisation, phone_hash, "ussd", simulated, *submission)
    sms = f"ElectraGuard: received. Your code: {report.receipt_code}."
    response = f"END Received. Code: {report.receipt_code}. We will also send it by SMS."
    Callback.objects.create(organisation=organisation, key=key, response=response)
    if not simulated:
        OutboundSMS.objects.create(organisation=organisation, destination=phone, short_code=short_code[:32], text=sms)
    return response, sms
