from uuid import UUID
import os
from pathlib import Path

from django.core.exceptions import ImproperlyConfigured
from dotenv import load_dotenv

from .deployment import validate_production_settings

load_dotenv(Path(__file__).resolve().parents[2] / ".env")

SECRET_KEY = os.getenv("DJANGO_SECRET_KEY", "")
if not SECRET_KEY:
    raise ImproperlyConfigured("Set DJANGO_SECRET_KEY.")
SECRET_KEY_FALLBACKS = [
    key for key in os.getenv("DJANGO_SECRET_KEY_FALLBACKS", "").split(",") if key
]
DEBUG = os.getenv("DJANGO_DEBUG", "").lower() == "true"
OBSERVATION_INTAKE_ENABLED = os.getenv(
    "OBSERVATION_INTAKE_ENABLED", "true" if DEBUG else "false"
).lower() == "true"
SIMULATOR_ENABLED = os.getenv("SIMULATOR_ENABLED", "false").lower() == "true"
CHANNEL_WEBHOOK_SECRET = os.getenv("CHANNEL_WEBHOOK_SECRET", "")
CHANNEL_SMS_API_KEY = os.getenv("CHANNEL_SMS_API_KEY", "")
CHANNEL_SMS_SHORT_CODE = os.getenv("CHANNEL_SMS_SHORT_CODE", "")
CHANNEL_GATEWAY_NETWORKS = tuple(
    network.strip() for network in os.getenv("CHANNEL_GATEWAY_NETWORKS", "").split(",") if network.strip()
)
CHANNEL_REQUIRE_GATEWAY_ALLOWLIST = not DEBUG
host_setting = os.getenv("DJANGO_ALLOWED_HOSTS", "localhost,127.0.0.1" if DEBUG else "")
ALLOWED_HOSTS = [host.strip() for host in host_setting.split(",") if host.strip()]
frontend_origin = os.getenv("FRONTEND_ORIGIN", "http://localhost:3000" if DEBUG else "")
if not DEBUG:
    validate_production_settings(SECRET_KEY, ALLOWED_HOSTS, frontend_origin)
CSRF_TRUSTED_ORIGINS = [frontend_origin]

SECURE_SSL_REDIRECT = not DEBUG
if not DEBUG and os.getenv("DJANGO_TRUST_PROXY_HTTPS", "").lower() == "true":
    SECURE_PROXY_SSL_HEADER = ("HTTP_X_FORWARDED_PROTO", "https")
SECURE_HSTS_SECONDS = 0 if DEBUG else 31536000
SECURE_REFERRER_POLICY = "same-origin"
X_FRAME_OPTIONS = "DENY"
SESSION_COOKIE_SECURE = not DEBUG
CSRF_COOKIE_SECURE = not DEBUG
SESSION_COOKIE_AGE = 8 * 60 * 60
SESSION_EXPIRE_AT_BROWSER_CLOSE = True
CSRF_COOKIE_HTTPONLY = True
CSRF_FAILURE_VIEW = "accounts.observer_auth.csrf_failure"
AUTH_TRUSTED_PROXY_IPS = frozenset(
    peer.strip() for peer in os.getenv("DJANGO_AUTH_TRUSTED_PROXY_IPS", "").split(",") if peer.strip()
)

INSTALLED_APPS = [
    "staff.apps.StaffConfig",
    "rumours",
    "publicdata",
    "security",
    "ops",
    "intelligence",
    "phone_channels",
    "django.contrib.auth",
    "django.contrib.contenttypes",
    "django.contrib.sessions",
    "rest_framework",
    "accounts",
    "reports",
    "reference",
    "approved_answers",
    "discussions",
]
MIDDLEWARE = [
    "django.middleware.security.SecurityMiddleware",
    "django.contrib.sessions.middleware.SessionMiddleware",
    "django.middleware.common.CommonMiddleware",
    "django.middleware.csrf.CsrfViewMiddleware",
    "django.contrib.auth.middleware.AuthenticationMiddleware",
    "accounts.observer_sessions.ObserverSessionMiddleware",
    "accounts.staff_sessions.StaffSessionMiddleware",
    "django.middleware.clickjacking.XFrameOptionsMiddleware",
]
ROOT_URLCONF = "config.urls"
WSGI_APPLICATION = "config.wsgi.application"
DATABASES = {
    "default": {
        "ENGINE": "django.db.backends.postgresql",
        "NAME": os.environ["POSTGRES_DB"],
        "USER": os.environ["POSTGRES_USER"],
        "PASSWORD": os.environ["POSTGRES_PASSWORD"],
        "HOST": os.getenv("POSTGRES_HOST", "127.0.0.1"),
        "PORT": os.getenv("POSTGRES_PORT", "5432"),
    },
}
AUTH_USER_MODEL = "accounts.User"
AUTH_PASSWORD_VALIDATORS = [
    {"NAME": "django.contrib.auth.password_validation.UserAttributeSimilarityValidator"},
    {
        "NAME": "django.contrib.auth.password_validation.MinimumLengthValidator",
        "OPTIONS": {"min_length": 12},
    },
    {"NAME": "django.contrib.auth.password_validation.CommonPasswordValidator"},
    {"NAME": "django.contrib.auth.password_validation.NumericPasswordValidator"},
]
DEFAULT_AUTO_FIELD = "django.db.models.BigAutoField"
USE_TZ = True
REST_FRAMEWORK = {
    "DEFAULT_AUTHENTICATION_CLASSES": ["rest_framework.authentication.SessionAuthentication"],
    "DEFAULT_PERMISSION_CLASSES": ["rest_framework.permissions.IsAuthenticated"],
    "DEFAULT_RENDERER_CLASSES": ["rest_framework.renderers.JSONRenderer"],
}

if not DEBUG:
    LOGGING = {
        "version": 1,
        "disable_existing_loggers": False,
        "filters": {"private_requests": {"()": "config.logging_filters.PrivateRequestFilter"}},
        "handlers": {
            "private_http": {"class": "logging.StreamHandler", "filters": ["private_requests"]},
        },
        "loggers": {
            name: {"handlers": ["private_http"], "propagate": False, "level": "WARNING"}
            for name in ("django.request", "django.security", "django.server")
        },
    }

# The fallback is evaluated only when the variable is unset. Path.parent stays valid
# in the shallow container layout (/app/config), where parents[3] does not exist.
PRIVATE_MEDIA_ROOT = Path(
    os.getenv("PRIVATE_MEDIA_ROOT")
    or Path(__file__).resolve().parent.parent.parent.parent / ".electraguard-private-media"
)

# Video and voice-note processing (C12). The face detector ships with the code. The
# transcription model is a local faster-whisper (CTranslate2) model directory; when it is
# unset, voice notes are still saved and their transcript is reported as unavailable.
FACE_DETECTOR_MODEL = os.getenv("FACE_DETECTOR_MODEL", "")
TRANSCRIPTION_MODEL = os.getenv("TRANSCRIPTION_MODEL", "")
TRANSCRIBER = ""

if os.getenv("PUBLIC_INTAKE_ORGANISATION_ID"):
    PUBLIC_INTAKE_ORGANISATION_ID = UUID(os.environ["PUBLIC_INTAKE_ORGANISATION_ID"])
