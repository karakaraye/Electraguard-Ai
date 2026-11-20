import os
from ipaddress import ip_address
from pathlib import Path

from django.core.exceptions import ImproperlyConfigured

BASE_DIR = Path(__file__).resolve().parent.parent
DEBUG = os.environ.get("TRACK5_DEBUG") == "1"
INTAKE_TOKEN = os.environ.get("TRACK5_INTAKE_TOKEN", "")
INTAKE_PAUSED = os.environ.get("TRACK5_INTAKE_PAUSED") == "1"
SECRET_KEY = os.environ.get("TRACK5_SECRET_KEY", "")
if not SECRET_KEY and DEBUG:
    SECRET_KEY = "local-only-insecure-development-key"

ALLOWED_HOSTS = [
    host.strip() for host in
    os.environ.get("TRACK5_ALLOWED_HOSTS", "localhost,127.0.0.1" if DEBUG else "").split(",")
    if host.strip()
]
if not DEBUG:
    if len(SECRET_KEY) < 50 or SECRET_KEY.startswith("django-insecure-"):
        raise ImproperlyConfigured("Set TRACK5_SECRET_KEY to a strong production secret.")
    if len(INTAKE_TOKEN) < 32:
        raise ImproperlyConfigured("Set TRACK5_INTAKE_TOKEN to a strong organisation credential.")
    if not ALLOWED_HOSTS or "*" in ALLOWED_HOSTS:
        raise ImproperlyConfigured("Set TRACK5_ALLOWED_HOSTS to the deployment host names.")
    if not os.environ.get("POSTGRES_DB"):
        raise ImproperlyConfigured("Production requires a configured PostgreSQL database.")

try:
    RECEIPT_LIFETIME_DAYS = int(os.environ.get("TRACK5_RECEIPT_LIFETIME_DAYS", "30"))
    if not 1 <= RECEIPT_LIFETIME_DAYS <= 365:
        raise ValueError
except ValueError as failure:
    raise ImproperlyConfigured("TRACK5_RECEIPT_LIFETIME_DAYS must be between 1 and 365.") from failure

ROOT_URLCONF = "config.urls"
WSGI_APPLICATION = "config.wsgi.application"
USE_TZ = True
TIME_ZONE = "Africa/Lagos"
STATIC_URL = "/static/"
STATIC_ROOT = BASE_DIR / "staticfiles"
DEFAULT_AUTO_FIELD = "django.db.models.BigAutoField"
DATA_UPLOAD_MAX_MEMORY_SIZE = 16 * 1024
SESSION_COOKIE_SECURE = not DEBUG
CSRF_COOKIE_SECURE = not DEBUG
SECURE_SSL_REDIRECT = not DEBUG
SECURE_HSTS_SECONDS = 0 if DEBUG else 86400
SECURE_REFERRER_POLICY = "same-origin"
X_FRAME_OPTIONS = "DENY"
SESSION_COOKIE_AGE = 8 * 60 * 60
SESSION_EXPIRE_AT_BROWSER_CLOSE = True
AUTH_PASSWORD_VALIDATORS = [
    {"NAME": "django.contrib.auth.password_validation.UserAttributeSimilarityValidator"},
    {"NAME": "django.contrib.auth.password_validation.MinimumLengthValidator", "OPTIONS": {"min_length": 12}},
    {"NAME": "django.contrib.auth.password_validation.CommonPasswordValidator"},
    {"NAME": "django.contrib.auth.password_validation.NumericPasswordValidator"},
]
if os.environ.get("TRACK5_TRUST_HTTPS_PROXY") == "1":
    SECURE_PROXY_SSL_HEADER = ("HTTP_X_FORWARDED_PROTO", "https")
try:
    TRUSTED_PROXY_IPS = frozenset(
        ip_address(value.strip())
        for value in os.environ.get("TRACK5_TRUSTED_PROXY_IPS", "").split(",")
        if value.strip()
    )
except ValueError as failure:
    raise ImproperlyConfigured("TRACK5_TRUSTED_PROXY_IPS requires exact proxy IP addresses.") from failure

INSTALLED_APPS = [
    "django.contrib.admin",
    "django.contrib.auth",
    "django.contrib.contenttypes",
    "django.contrib.sessions",
    "django.contrib.messages",
    "django.contrib.staticfiles",
    "reports",
]

MIDDLEWARE = [
    "django.middleware.security.SecurityMiddleware",
    "django.contrib.sessions.middleware.SessionMiddleware",
    "django.middleware.common.CommonMiddleware",
    "django.middleware.csrf.CsrfViewMiddleware",
    "django.middleware.clickjacking.XFrameOptionsMiddleware",
    "django.contrib.auth.middleware.AuthenticationMiddleware",
    "reports.middleware.RequestLimits",
    "reports.middleware.PageSecurity",
    "django.contrib.messages.middleware.MessageMiddleware",
]

TEMPLATES = [{
    "BACKEND": "django.template.backends.django.DjangoTemplates",
    "APP_DIRS": True,
    "OPTIONS": {"context_processors": [
        "django.template.context_processors.request",
        "django.contrib.auth.context_processors.auth",
        "django.contrib.messages.context_processors.messages",
    ]},
}]

if os.environ.get("POSTGRES_DB"):
    DATABASES = {"default": {
        "ENGINE": "django.db.backends.postgresql",
        "NAME": os.environ["POSTGRES_DB"],
        "USER": os.environ["POSTGRES_USER"],
        "PASSWORD": os.environ["POSTGRES_PASSWORD"],
        "HOST": os.environ.get("POSTGRES_HOST", "127.0.0.1"),
        "PORT": os.environ.get("POSTGRES_PORT", "5432"),
    }}
else:
    DATABASES = {"default": {
        "ENGINE": "django.db.backends.sqlite3",
        "NAME": Path(os.environ.get("TRACK5_SQLITE_PATH", BASE_DIR / "local.sqlite3")),
    }}
