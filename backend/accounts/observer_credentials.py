import re
import secrets
from hashlib import sha256
from math import ceil
from datetime import timedelta

from django.contrib.auth.hashers import PBKDF2PasswordHasher
from django.db import transaction
from django.utils import timezone
from django.utils.crypto import salted_hmac

from .models import AuthThrottle, ObserverCode

ALPHABET = "0123456789ABCDEFGHJKMNPQRSTVWXYZ"
ALIASES = str.maketrans("OIL", "011")
HASHER = PBKDF2PasswordHasher()
PIN_ITERATIONS = 1_000_000
# Same KDF and work factor for absent and present credentials.
DUMMY_HASH = f"pbkdf2_sha256${PIN_ITERATIONS}$public-dummy-salt$invalid"
SETUP_PIN_LIFE = timedelta(days=14)
TOKEN_LIFE = timedelta(minutes=10)
CODE_WINDOW = timedelta(minutes=15)
DAY = timedelta(hours=24)


def check_symbol(payload):
    return ALPHABET[sum(i * ALPHABET.index(char) for i, char in enumerate(payload, 1)) % 31]


def normalize_code(raw):
    if not isinstance(raw, str) or not raw.isascii() or len(raw) > 64:
        return None
    compact = re.sub(r"[\s-]+", "", raw.upper())
    if not compact.startswith("OBS"):
        return None
    code = compact[3:].translate(ALIASES)
    if len(code) == 6 and all(char in ALPHABET for char in code) and check_symbol(code[:5]) == code[-1]:
        return "OBS-" + code
    return None


def generate_code():
    payload = "".join(secrets.choice(ALPHABET) for _ in range(5))
    return f"OBS-{payload}{check_symbol(payload)}"


def pin_hash(pin):
    return HASHER.encode(pin, HASHER.salt(), iterations=PIN_ITERATIONS)


def verify_pin(pin, encoded):
    return HASHER.verify(pin, encoded or DUMMY_HASH)


def new_setup_pin(credential):
    pin = f"{secrets.randbelow(100_000_000):08d}"
    while credential.setup_hash and verify_pin(pin, credential.setup_hash):
        pin = f"{secrets.randbelow(100_000_000):08d}"
    credential.setup_hash = pin_hash(pin)
    credential.setup_prefix_hash = pin_hash(pin[:6])
    credential.setup_expires_at = timezone.now() + SETUP_PIN_LIFE
    credential.pin_hash = ""
    credential.token_digest = None
    credential.token_expires_at = None
    credential.token_attempts = 0
    credential.status = ObserverCode.Status.UNCLAIMED
    credential.save()
    return pin


def digest(namespace, value):
    return salted_hmac(f"electraguard.{namespace}", value, algorithm="sha256").hexdigest()


def locked_throttle(namespace, value):
    # Code lockouts survive application secret rotation. IP keys remain keyed.
    key = sha256(f"code:{value}".encode()).hexdigest() if namespace == "code" else digest(namespace, value)
    row, _ = AuthThrottle.objects.select_for_update().get_or_create(key=key)
    return row


@transaction.atomic
def rate_limit(namespace, address, limit, seconds):
    row = locked_throttle(namespace, address)
    now = timezone.now().timestamp()
    row.attempts = [timestamp for timestamp in row.attempts if timestamp > now - seconds]
    if len(row.attempts) >= limit:
        return max(1, ceil(seconds - now + row.attempts[0]))
    row.attempts.append(now)
    row.save(update_fields=["attempts", "updated_at"])
    return None


def too_simple(pin):
    return len(set(pin)) == 1 or any(
        all((int(right) - int(left)) % 10 == step for left, right in zip(pin, pin[1:]))
        for step in (1, 9)
    )
