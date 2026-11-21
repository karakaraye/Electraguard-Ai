from ipaddress import ip_address
from re import fullmatch
from urllib.parse import urlsplit

from django.core.exceptions import ImproperlyConfigured


def is_concrete_host(host):
    if host.startswith("[") and host.endswith("]"):
        try:
            return ip_address(host[1:-1]).version == 6
        except ValueError:
            return False
    return bool(fullmatch(r"[a-zA-Z0-9](?:[a-zA-Z0-9.-]*[a-zA-Z0-9])?", host))


def is_https_origin(value):
    try:
        origin = urlsplit(value)
        hostname = origin.hostname or ""
        if ":" in hostname:
            hostname = f"[{hostname}]"
        port = origin.port
    except ValueError:
        return False
    return (
        origin.scheme == "https"
        and value == f"https://{origin.netloc}"
        and is_concrete_host(hostname)
        and origin.username is None
        and origin.password is None
        and not origin.netloc.endswith(":")
        and port != 0
    )


def validate_production_settings(secret_key, allowed_hosts, frontend_origin):
    if (
        len(secret_key) < 50
        or len(set(secret_key)) < 5
        or secret_key.startswith(("django-insecure-", "replace-"))
    ):
        raise ImproperlyConfigured("Set a strong DJANGO_SECRET_KEY for production.")
    if not allowed_hosts or not all(is_concrete_host(host) for host in allowed_hosts):
        raise ImproperlyConfigured("Set DJANGO_ALLOWED_HOSTS to explicit hostnames without schemes or ports.")
    if not is_https_origin(frontend_origin):
        raise ImproperlyConfigured("Set FRONTEND_ORIGIN to a single HTTPS origin, without a path or a trailing slash.")
