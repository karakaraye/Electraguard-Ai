"""Exercise synthetic observer reports and private photo uploads on loopback."""

import hashlib
import os
from collections import deque
from datetime import datetime, timezone
from io import BytesIO
from pathlib import Path
from uuid import uuid4

from locust import HttpUser, between, task
from locust.exception import StopUser
from PIL import Image

HOST = "http://127.0.0.1:8131"
API = "/api/v1"
CARDS = deque(
    line.split()
    for line in Path(os.environ.get("LOAD_CARDS", ".c13-local/cards.txt")).read_text().splitlines()
    if line.strip()
)

# Synthetic noise gives a realistic payload without using a real photo.
image = Image.effect_noise((960, 720), 32).convert("RGB")
buffer = BytesIO()
image.save(buffer, format="JPEG", quality=83)
PHOTO = buffer.getvalue()
PHOTO_DIGEST = hashlib.sha256(PHOTO).hexdigest()


class Observer(HttpUser):
    host = HOST
    wait_time = between(1, 3)

    def request(self, method, path, status, name, *, headers=None, **kwargs):
        with self.client.request(
            method, API + path, name=name, headers=headers, timeout=15,
            allow_redirects=False, catch_response=True, **kwargs,
        ) as response:
            if response.status_code != status:
                response.failure(f"Expected {status}, got {response.status_code}")
                return None
            try:
                return response.json()
            except ValueError:
                response.failure("Expected JSON")
                return None

    def write(self, method, path, status, name, **kwargs):
        headers = dict(kwargs.pop("headers", {}), **{"X-CSRFToken": self.csrf})
        if method == "POST":
            headers["Idempotency-Key"] = str(uuid4())
        return self.request(method, path, status, name, headers=headers, **kwargs)

    def on_start(self):
        if self.host != HOST:
            raise ValueError(f"Use the isolated local server at {HOST}")
        if not CARDS:
            raise ValueError("Issue at least one unused observer card per user")
        code, setup_pin = CARDS.popleft()
        token = self.request("GET", "/auth/csrf", 200, "CSRF (before sign-in)")
        if token is None:
            raise StopUser()
        self.csrf = token["csrf_token"]
        setup = self.write("POST", "/auth/observer/sign-in", 200, "Sign in", json={
            "code": code, "pin": setup_pin,
        })
        if setup is None or "setup_token" not in setup:
            raise StopUser()
        pin = "482605" if setup_pin[:6] != "482605" else "593716"
        signed_in = self.write("POST", "/auth/observer/pin", 200, "Set PIN", json={
            "setup_token": setup["setup_token"], "new_pin": pin,
        })
        if signed_in is None:
            raise StopUser()
        token = self.request("GET", "/auth/csrf", 200, "CSRF (after sign-in)")
        if token is None:
            raise StopUser()
        self.csrf = token["csrf_token"]

    @task
    def report_with_photo(self):
        now = datetime.now(timezone.utc).isoformat()
        report = self.write("POST", "/reports", 201, "Create report", json={
            "kind": "incident", "language": "en", "occurred_at": now,
            "place": {"polling_unit_code": "SYN-KN-01-01-001", "ward_code": "SYN-KN-01-01"},
            "category_observer": "access_barrier", "access_barrier_details": ["steps_no_ramp"],
            "danger_now": False, "firsthand": True, "description": "Synthetic load observation.",
            "input_method": "typed", "device_saved_at": now,
        })
        if report is None:
            return
        created = self.write("POST", f"/reports/{report['id']}/uploads", 201, "Start photo", json={
            "kind": "photo", "purpose": "evidence", "content_type": "image/jpeg",
            "size_bytes": len(PHOTO), "sha256": PHOTO_DIGEST,
            "client_attachment_id": str(uuid4()), "blur_faces": False,
        })
        if created is None:
            return
        upload = created["upload"]
        path = f"/uploads/{upload['id']}"
        for offset in range(0, len(PHOTO), upload["chunk_bytes"]):
            chunk = PHOTO[offset:offset + upload["chunk_bytes"]]
            received = self.write("PATCH", path, 200, "Send photo chunk", data=chunk, headers={
                "Content-Type": "application/offset+octet-stream", "Upload-Offset": str(offset),
            })
            if received is None:
                return
        self.write("POST", path + "/complete", 201, "Complete photo", json={})
