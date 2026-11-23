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
"""

import json
import os
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
    global Session, photo_key, storage, MediaItem, Report, ReportIdempotency, UploadSession
    from django.contrib.sessions.models import Session
    from django.core.management import call_command
    from django.db import transaction

    from accounts.models import INITIAL_ORGANISATION, AccountSession, ObserverCode, Organisation
    from reports.media_storage import photo_key, storage
    from reports.models import MediaItem, Report, ReportIdempotency, UploadSession


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


if __name__ == "__main__":
    command, *args = sys.argv[1:]
    if command != "photo":
        setup_django()
    {"issue": issue, "revoke": revoke, "pause": pause, "expire": expire, "reports": reports, "photo": photo}[command](*args)
