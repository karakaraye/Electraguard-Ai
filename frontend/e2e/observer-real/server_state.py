"""
Server-side helper for the real-backend observer e2e suite.

Runs inside the Django project (same settings and database as the running
server) so the tests can set up state and check what the server stored,
without any mock. Every command prints one JSON line.

  python server_state.py issue                     -> {"code", "pin"}
  python server_state.py revoke OBS-XXXXXX         -> {"ok": true}
  python server_state.py pause on|off              -> {"intake_paused": bool}
  python server_state.py expire OBS-XXXXXX         -> {"sessions_ended": n}
  python server_state.py reports OBS-XXXXXX        -> {"reports": [...]}

Community features (check-ins, area today, rumour desk):
  python server_state.py cleanup                    -> removes everything the community specs seeded
  python server_state.py staff ROLE [NAME]          -> {"email", "password"}: staff with two-step already set up
  python server_state.py totp EMAIL                 -> {"code"}: the current two-step code
  python server_state.py area N                     -> the N-th LGA (three wards, five units each)
  python server_state.py place OBS-XXXXXX WARD UNIT -> the observer's latest report names this place
  python server_state.py closed LGA CATEGORY=N ...  -> N reviewed reports, 90 minutes old, in this LGA
  python server_state.py notice-answers ID          -> what the server stored for a check-in
  python server_state.py notice KIND CODE QUESTION  -> a sent check-in written by a seeded coordinator
  python server_state.py answers ID yes=N no=N      -> answers from N other observers
  python server_state.py withdraw ID                -> the check-in is withdrawn
  python server_state.py claim TEXT ASKS LGA CAT    -> a public ask with its last-hour demand
"""

import base64
import json
import os
import secrets
import sys
from io import BytesIO
from pathlib import Path

BACKEND = Path(__file__).resolve().parents[3] / "backend"
sys.path.insert(0, str(BACKEND))
os.environ.setdefault("DJANGO_SETTINGS_MODULE", "config.settings")

from PIL import Image  # noqa: E402


def setup_django():
    """Only the commands that touch the server pay for Django start-up."""
    import django

    django.setup()
    global call_command, transaction, INITIAL_ORGANISATION, AccountSession, ObserverCode, Organisation
    global Session, photo_key, storage, MediaItem, Report, ReportIdempotency, UploadSession, User, timezone, timedelta, uuid4
    from datetime import timedelta
    from uuid import uuid4

    from django.contrib.sessions.models import Session
    from django.core.management import call_command
    from django.db import transaction
    from django.utils import timezone

    from accounts.models import INITIAL_ORGANISATION, AccountSession, ObserverCode, Organisation, User
    from reports.media_storage import photo_key, storage
    from reports.models import MediaItem, Report, ReportIdempotency, UploadSession


MARK = "e2e-community"
DOMAIN = "@e2e-community.test"
SECRETS = Path(__import__("tempfile").gettempdir()) / "eg-e2e-totp"


def out(value):
    sys.stdout.write(json.dumps(value, default=str) + "\n")


def issue():
    buffer = __import__("io").StringIO()
    call_command("issue_observer_codes", count=1, label="e2e observer-real", stdout=buffer)
    code, pin = buffer.getvalue().split()[:2]
    out({"code": code, "pin": pin})


def revoke(code):
    call_command("revoke_observer_code", code, stdout=__import__("io").StringIO())
    out({"ok": True})


def pause(flag):
    with transaction.atomic():
        organisation = Organisation.objects.select_for_update().get(pk=INITIAL_ORGANISATION)
        organisation.intake_paused = flag == "on"
        organisation.save(update_fields=["intake_paused"])
    out({"intake_paused": organisation.intake_paused})


def simulator(flag="on"):
    with transaction.atomic():
        organisation = Organisation.objects.select_for_update().get(pk=INITIAL_ORGANISATION)
        organisation.simulator_enabled = flag == "on"
        organisation.save(update_fields=["simulator_enabled"])
    out({"simulator_enabled": organisation.simulator_enabled})


def expire(code):
    """End the code's sessions without revoking it (what idle or absolute expiry does)."""
    user = ObserverCode.objects.get(code=code).user
    tracked = AccountSession.objects.filter(user=user)
    keys = list(tracked.values_list("key", flat=True))
    Session.objects.filter(session_key__in=keys).delete()
    tracked.delete()
    out({"sessions_ended": len(keys)})


def photo_facts(item):
    try:
        with storage().read(photo_key(item.organisation_id, item.pk)) as handle:
            raw = handle.read()
    except FileNotFoundError:
        return {"stored": False}
    with Image.open(BytesIO(raw)) as image:
        exif = image.getexif()
        return {
            "stored": True,
            "format": image.format,
            "size": list(image.size),
            "exif_tags": len(exif),
            "gps": bool(exif.get_ifd(0x8825)) or 0x8825 in exif,
            "info_keys": sorted(k for k in image.info if k not in ("jfif", "jfif_version", "jfif_unit", "jfif_density", "dpi")),
            "has_exif_marker": b"Exif\x00\x00" in raw,
        }


def reports(code):
    user = ObserverCode.objects.get(code=code).user
    rows = []
    for report in Report.objects.filter(observer=user).order_by("created_at"):
        media = []
        for item in MediaItem.objects.filter(report=report).order_by("created_at"):
            media.append({"id": str(item.pk), "size_bytes": item.size_bytes, "original_sha256": item.original_sha256, **photo_facts(item)})
        uploads = list(UploadSession.objects.filter(report=report).values("id", "status", "received_bytes", "size_bytes", "client_attachment_id"))
        rows.append({
            "id": str(report.pk),
            "receipt_code": report.receipt_code,
            "status": report.status,
            "media": media,
            "uploads": uploads,
            "idempotency": [
                {"operation": op, "key": str(key)}
                for op, key in ReportIdempotency.objects.filter(report=report).values_list("operation", "key")
            ],
        })
    out({"reports": rows})


def photo(path, width, height, grain):
    """A camera-like JPEG with EXIF GPS and camera tags, to prove the phone and server strip them."""
    import random

    width, height, grain = int(width), int(height), int(grain)
    rng = random.Random(width * 7919 + height)
    image = Image.new("RGB", (width, height))
    pixels = image.load()
    for y in range(height):
        for x in range(width):
            noise = rng.randint(-grain, grain) if grain else 0
            pixels[x, y] = ((x * 255 // width + noise) % 256, (y * 255 // height + noise) % 256, (128 + noise) % 256)
    exif = Image.Exif()
    exif[0x010F] = "PhoneMaker"  # Make
    exif[0x0110] = "Model X"  # Model
    exif[0x0132] = "2026:12:05 09:14:31"  # DateTime
    exif[0x8825] = {1: "N", 2: (12.0, 0.0, 1.5), 3: "E", 4: (8.0, 31.0, 2.25)}  # GPS: Kano
    image.save(path, format="JPEG", quality=95, exif=exif)
    with Image.open(path) as check:
        gps = bool(check.getexif().get_ifd(0x8825))
    out({"path": path, "bytes": Path(path).stat().st_size, "gps": gps})


def cleanup():
    from django.db.models import Q

    from notices.models import Notice, NoticeAnswer, NoticeRequest
    from publicdata.models import Snapshot
    from rumours.models import Claim

    users = User.objects.filter(email__endswith=DOMAIN)
    notices = Notice.objects.filter(Q(created_by__in=users) | Q(text__startswith=MARK))
    NoticeAnswer.objects.filter(notice__in=notices).delete()
    NoticeRequest.objects.filter(actor__in=users).delete()
    notices.delete()
    Claim.objects.filter(text__startswith=MARK).delete()
    Report.objects.filter(location=MARK).delete()
    Snapshot.objects.filter(organisation_id=INITIAL_ORGANISATION).delete()
    out({"ok": True})


def staff(role, name=""):
    from accounts.models import StaffCredential
    from accounts.staff_auth import encrypt

    shared = base64.b32encode(secrets.token_bytes(20)).decode()
    email = f"{role}-{secrets.token_hex(4)}{DOMAIN}"
    password = "Ballot-box-" + secrets.token_hex(6)
    first, _, last = name.partition(" ")
    user = User.objects.create_user(email, password, organisation_id=INITIAL_ORGANISATION, role=role, first_name=first, last_name=last)
    StaffCredential.objects.create(user=user, organisation_id=INITIAL_ORGANISATION, secret=encrypt(shared), enforce_totp=True)
    SECRETS.mkdir(exist_ok=True)
    (SECRETS / email).write_text(shared)
    out({"email": email, "password": password, "name": name})


def totp(email):
    from datetime import datetime, timezone as utc

    from accounts.staff_auth import totp as make_code

    shared = (SECRETS / email).read_text()
    out({"code": make_code(shared, int(datetime.now(utc.utc).timestamp()) // 30)})


def newest_states():
    from reference.models import AreaDataset

    return AreaDataset.objects.order_by("-released_on", "-revision").first().states


def area(index):
    """The N-th LGA among the first twelve states (the check-in screen lists those)."""
    states = newest_states()
    lgas = [(states[code], lga) for code in sorted(states)[:12] for lga in states[code]["lgas"]]
    state, lga = lgas[int(index) % len(lgas)]
    out({
        "state_code": state["state_code"], "state_name": state["name"], "lga_code": lga["lga_code"], "lga_name": lga["name"],
        "wards": [{"ward_code": w["ward_code"], "name": w["name"], "units": w["units"]} for w in lga["wards"]],
    })


def place(code, ward, unit):
    from reference.models import resolve_place

    user = ObserverCode.objects.get(code=code).user
    where = resolve_place(unit, ward)
    rc = f"EG-{secrets.token_hex(4).upper()}"
    Report.objects.create(
        organisation_id=user.organisation_id, observer=user, submission_key=uuid4(), status=Report.Status.SUBMITTED,
        occurred_at=timezone.now(), location=MARK, polling_unit_code=unit, description="Where this observer is.",
        receipt_code=rc,
        incident_details={"category_observer": "late_materials", "area": where},
    )
    out({"area": where, "receipt_code": rc})


def closed(lga, *counts):
    where = None
    for state in newest_states().values():
        for item in state["lgas"]:
            if item["lga_code"] == lga:
                where = {"state_code": state["state_code"], "state_name": state["name"], "lga_code": lga, "ward_code": item["wards"][0]["ward_code"]}
    Report.objects.filter(location=MARK, incident_details__area__lga_code=lga, status=Report.Status.CLOSED).delete()
    observer = User.objects.filter(role=User.Role.OBSERVER).first()
    if not observer:
        observer = User.objects.create_user(f"obs-{secrets.token_hex(4)}{DOMAIN}", "Observer123!", role=User.Role.OBSERVER)
    from reports.models import ReviewEvent
    made = 0
    for pair in counts:
        category, number = pair.split("=")
        age = 15 if category.startswith("recent:") else 90
        category = category.removeprefix("recent:")
        for _ in range(int(number)):
            rep = Report.objects.create(
                organisation_id=INITIAL_ORGANISATION, observer=observer, submission_key=uuid4(), status=Report.Status.CLOSED,
                occurred_at=timezone.now() - timedelta(minutes=age), location=MARK, description="Secret observation narrative that should never leak.",
                incident_details={"category_observer": category, "category": category, "area": where},
            )
            ReviewEvent.objects.create(
                organisation_id=INITIAL_ORGANISATION, report=rep, action=ReviewEvent.Action.CLOSE,
                actor=observer, version=1, change={"outcome": "corroborated"},
            )
            made += 1
    out({"made": made})


def notice_answers(notice_id):
    from notices.models import NoticeAnswer

    rows = list(NoticeAnswer.objects.filter(notice_id=notice_id).values("observer_code", "answer", "version", "answered_at_device"))
    out({"answers": rows})


def notice(kind, scope_code, question):
    from notices.models import Notice, Question

    author = User.objects.create_user(f"author-{secrets.token_hex(4)}{DOMAIN}", "unused-Password-1", organisation_id=INITIAL_ORGANISATION, role=User.Role.COORDINATOR)
    row = Notice.objects.create(
        organisation_id=INITIAL_ORGANISATION, scope_kind=kind, scope_code=scope_code, type=Notice.NoticeType.LOGISTICS,
        text=MARK + " question", question=Question.objects.get(pk=question), created_by=author, approved_by=author,
        status=Notice.Status.SENT, expires_at=timezone.now() + timedelta(hours=3),
    )
    out({"id": str(row.pk)})


def withdraw(notice_id):
    from notices.models import Notice

    Notice.objects.filter(pk=notice_id).update(status=Notice.Status.WITHDRAWN)
    out({"ok": True})


def answers(notice_id, *counts):
    from notices.models import Notice, NoticeAnswer

    row = Notice.objects.get(pk=notice_id)
    n = 0
    for pair in counts:
        choice, number = pair.split("=")
        for _ in range(int(number)):
            n += 1
            NoticeAnswer.objects.create(
                organisation_id=INITIAL_ORGANISATION, notice=row, observer_code=f"E2E-{notice_id[:8]}-{n}", answer=choice,
                answered_at_device=timezone.now(),
            )
    out({"made": n})


def claim(text, asks, lga, category, source="public"):
    from rumours.models import Claim, ClaimAskHour

    states = newest_states()
    state_code = next(code for code, state in states.items() if any(item["lga_code"] == lga for item in state["lgas"]))
    now = timezone.now()
    row = Claim.objects.create(
        organisation_id=INITIAL_ORGANISATION, text=f"{MARK} {text}", seen_on="public" if source == "public" else "radio", language="en", source=source,
        ask_count=int(asks), area={"state_code": state_code, "lga_code": lga}, status="response_draft" if category != "-" else "new",
        harm={"level": "medium", "score": 0.5, "reasons": ["location_specific"]}, check_worthiness={"level": "medium", "score": 0.5, "reasons": []},
        response={"text": "Please wait for the result sheet.", "language": "en", "drafted_by": "Desk", "drafted_at": now.isoformat(), "category": category} if category != "-" else None,
    )
    ClaimAskHour.objects.create(organisation_id=INITIAL_ORGANISATION, claim=row, hour=now.replace(minute=0, second=0, microsecond=0), count=max(1, int(asks) // 2))
    out({"id": str(row.pk)})


def approved_claim(text, answer, lga="AD-01"):
    from rumours.models import Claim, ClaimAskHour

    states = newest_states()
    state_code = next(code for code, state in states.items() if any(item["lga_code"] == lga for item in state["lgas"]))
    now = timezone.now()
    row = Claim.objects.create(
        organisation_id=INITIAL_ORGANISATION, text=text, seen_on="whatsapp", language="en", source="public",
        ask_count=5, area={"state_code": state_code, "lga_code": lga}, status="response_approved",
        harm={"level": "medium", "score": 0.5, "reasons": ["location_specific"]}, check_worthiness={"level": "medium", "score": 0.5, "reasons": []},
        response={
            "text": answer,
            "language": "en",
            "drafted_by": "Coordinator",
            "drafted_at": now.isoformat(),
            "approved_by": "Coordinator",
            "approved_at": now.isoformat(),
            "rejection_note": None,
        },
    )
    ClaimAskHour.objects.create(organisation_id=INITIAL_ORGANISATION, claim=row, hour=now.replace(minute=0, second=0, microsecond=0), count=5)
    out({"id": str(row.pk), "text": text, "answer": answer})


GUIDE_SLUG = "e2e-formatting"
GUIDE_BODY = """# E2E Formatting Guide

A short introduction to the zebra checklist.

## Zebra Checklist
Bring the following items to the zebra desk:

- your `ZEBRA-CARD` slip
- a pen

Then wait for the zebra call."""


def guide(flag="on"):
    from approved_answers.models import ApprovedDocument

    ApprovedDocument.objects.filter(source__document_id="guide-" + GUIDE_SLUG).delete()
    if flag == "on":
        ApprovedDocument.objects.create(
            language="en", title="E2E Formatting Guide", body=GUIDE_BODY,
            source=dict(document_id="guide-" + GUIDE_SLUG, section="1", version="2026-11", url="/guide/" + GUIDE_SLUG))
    out({"slug": GUIDE_SLUG})


def assign(report_ref, email):
    user = User.objects.get(email=email)
    try:
        from uuid import UUID
        UUID(str(report_ref))
        Report.objects.filter(pk=report_ref).update(assigned_reviewer=user)
    except ValueError:
        Report.objects.filter(receipt_code=report_ref).update(assigned_reviewer=user)
    out({"ok": True, "reviewer": email})


COMMANDS = {
    "issue": issue, "revoke": revoke, "pause": pause, "simulator": simulator, "expire": expire, "reports": reports, "photo": photo,
    "cleanup": cleanup, "staff": staff, "totp": totp, "area": area, "place": place, "closed": closed,
    "notice-answers": notice_answers, "notice": notice, "answers": answers, "claim": claim, "withdraw": withdraw,
    "assign": assign, "approved-claim": approved_claim, "guide": guide,
}

if __name__ == "__main__":
    command, *args = sys.argv[1:]
    if command != "photo":
        setup_django()
    COMMANDS[command](*args)
