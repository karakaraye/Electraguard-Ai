import secrets
from datetime import timedelta
from functools import wraps
from ipaddress import ip_address, ip_network
from uuid import UUID, uuid4

from django.conf import settings
from django.core.exceptions import RequestDataTooBig, TooManyFieldsSent
from django.db import IntegrityError, transaction
from django.http import HttpResponse, JsonResponse
from django.utils import timezone
from django.utils.crypto import constant_time_compare
from django.views.decorators.csrf import csrf_exempt

from accounts.observer_auth import endpoint, error, validation, wat
from accounts.observer_credentials import rate_limit
from reports.idempotency import lock_key, request_digest
from reports.incident_input import field

from .handlers import ChannelLimited, digest, handle_sms, handle_ussd
from .intake import public_organisation
from .models import Simulator, SimulatorSend


def gateway_allowed(request, secret):
    expected = settings.CHANNEL_WEBHOOK_SECRET
    if not expected or not constant_time_compare(expected, secret):
        return False
    if settings.CHANNEL_GATEWAY_NETWORKS:
        try:
            address = ip_address(request.META.get("REMOTE_ADDR", ""))
            return any(address in ip_network(network) for network in settings.CHANNEL_GATEWAY_NETWORKS)
        except ValueError:
            return False
    return not settings.CHANNEL_REQUIRE_GATEWAY_ALLOWLIST


def form_data(request):
    if request.method == "POST" and request.content_type == "application/x-www-form-urlencoded":
        try:
            if len(request.body) <= 8192:
                return request.POST
        except (RequestDataTooBig, TooManyFieldsSent):
            pass
    return {}


@csrf_exempt
def inbound_sms(request, secret):
    if gateway_allowed(request, secret):
        data = form_data(request)
        organisation = public_organisation() if data else None
        if organisation:
            handle_sms(organisation, data.get("from", ""), data.get("id", ""), data.get("to", ""),
                       data.get("text", ""))
    return HttpResponse(content_type="text/plain")


@csrf_exempt
def inbound_ussd(request, secret):
    if not gateway_allowed(request, secret):
        return HttpResponse("END Service unavailable.", content_type="text/plain")
    data = form_data(request)
    organisation = public_organisation() if data else None
    response = "END Service unavailable."
    if organisation:
        response, _ = handle_ussd(
            organisation, data.get("phoneNumber", ""), data.get("sessionId", ""),
            settings.CHANNEL_SMS_SHORT_CODE, data.get("text", ""),
        )
    return HttpResponse(response, content_type="text/plain")


def limited(retry):
    return error(429, "rate_limited", "Too many requests. Try again later.", retry=retry)


def unavailable():
    return error(404, "not_found", "We could not find that.")


def new_number(simulator):
    while True:
        try:
            with transaction.atomic():
                simulator.number = f"+2340000{secrets.randbelow(10000000):07d}"
                simulator.save()
                return
        except IntegrityError as exc:
            if getattr(getattr(exc.__cause__, "diag", None), "constraint_name", None) != "phone_channels_simulator_number_key":
                raise


def phone_label(simulator):
    return f"+234 000 0{simulator.number[8:11]} {simulator.number[11:]}"


def simulator_endpoint(method, *, send=False):
    def decorate(view):
        @endpoint(method, max_body_bytes=4096)
        @transaction.atomic
        @wraps(view)
        def wrapped(request, data=None):
            organisation = public_organisation()
            if (organisation is None or not getattr(organisation, "simulator_enabled", settings.SIMULATOR_ENABLED)
                    or (request.user.is_authenticated and request.user.organisation_id != organisation.pk)):
                return unavailable()
            if "phone_simulator" not in request.session:
                request.session["phone_simulator"] = str(uuid4())
            browser = digest("browser", request.session["phone_simulator"])
            if not lock_key(f"simulator:{organisation.pk}:{browser}"):
                return error(409, "request_in_progress", "This request is still being processed.", retry=2)
            simulator = Simulator.objects.filter(organisation=organisation, browser=browser).first()
            if simulator is None:
                simulator = Simulator(organisation=organisation, browser=browser)
                new_number(simulator)
            if send:
                try:
                    key = UUID(request.headers.get("Idempotency-Key", ""))
                    if key.version != 4:
                        raise ValueError
                except ValueError:
                    return error(400, "idempotency_key_required", "Send a UUID v4 Idempotency-Key.")
                body_digest = request_digest(request, data)
                replay = SimulatorSend.objects.filter(
                    simulator=simulator, organisation=organisation, key=key,
                    created_at__gt=timezone.now() - timedelta(days=30),
                ).first()
                if replay:
                    if replay.digest != body_digest:
                        return error(409, "idempotency_key_reused", "This send key belongs to a different request.")
                    response = JsonResponse(replay.body)
                    response["Idempotent-Replayed"] = "true"
                    return response
            retry = rate_limit("simulator-request", browser, 60, 600)
            if retry is not None:
                return limited(retry)
            try:
                result = view(request, simulator, data)
            except ChannelLimited as exc:
                return limited(exc.retry)
            if isinstance(result, HttpResponse):
                return result
            if send:
                SimulatorSend.objects.update_or_create(
                    simulator=simulator, organisation=organisation, key=key,
                    defaults={"digest": body_digest, "body": result, "created_at": timezone.now()},
                )
            return JsonResponse(result)
        return wrapped
    return decorate


def message(simulator, text):
    if not text:
        return []
    item = {"id": str(uuid4()), "from": "ElectraGuard", "text": text, "received_at": wat(timezone.now())}
    simulator.messages = (simulator.messages + [item])[-300:]
    simulator.save(update_fields=["messages"])
    return [{key: value for key, value in item.items() if key != "from"}]


@simulator_endpoint("POST", send=True)
def simulator_sms(request, simulator, data):
    value = data.get("text")
    if not isinstance(value, str) or not value.strip() or len(value) > 160 or "\x00" in value:
        return validation({"text": field("invalid", "Enter 1 to 160 characters.")})
    reply = handle_sms(simulator.organisation, simulator.number, f"sim:{uuid4()}", "", value,
                       simulated=True, actor=simulator.browser)
    return {"replies": message(simulator, reply)}


@simulator_endpoint("POST", send=True)
def simulator_ussd(request, simulator, data):
    try:
        session_id = str(UUID(data.get("session_id", "")))
    except (ValueError, TypeError, AttributeError):
        return validation({"session_id": field("invalid", "Enter a dial session UUID.")})
    value, code = data.get("input"), data.get("service_code")
    if code != "*347*88#":
        return validation({"service_code": field("invalid", "Dial *347*88#.")})
    if not isinstance(value, str) or len(value) > 140 or "\x00" in value:
        return validation({"input": field("invalid", "Enter up to 140 characters.")})
    now = timezone.now()
    calls = {key: call for key, call in simulator.calls.items()
             if call["expires"] > now.timestamp()}
    call = calls.get(session_id)
    if value == "":
        call = {"text": "", "expires": (now + timedelta(minutes=5)).timestamp()}
    elif call is None:
        return validation({"session_id": field("expired", "Dial again to start a new session.")})
    if call.get("end"):
        return {"type": "END", "text": call["end"], "session_id": session_id}
    if value:
        call["text"] = "*".join(filter(None, (call["text"], value)))
    response, sms = handle_ussd(
        simulator.organisation, simulator.number, f"sim:{session_id}", "", call["text"],
        simulated=True, actor=simulator.browser,
    )
    kind, _, text = response.partition(" ")
    if kind == "END":
        call = {"end": text, "expires": call["expires"]}
    calls[session_id] = call
    simulator.calls = calls
    simulator.save(update_fields=["calls"])
    message(simulator, sms)
    return {"type": kind, "text": text, "session_id": session_id}


@simulator_endpoint("GET")
def simulator_inbox(request, simulator, data):
    after = request.GET.get("after")
    rows = simulator.messages
    if after:
        for index, row in enumerate(rows):
            if row["id"] == after:
                rows = rows[index+1:]
                break
    return {"phone_label": phone_label(simulator), "messages": rows}


@simulator_endpoint("POST")
def simulator_reset(request, simulator, data):
    simulator.calls = {}
    simulator.messages = []
    new_number(simulator)
    return {"phone_label": phone_label(simulator)}
