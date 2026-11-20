from ipaddress import ip_address
from time import time

from django.conf import settings
from django.db.models import F
from django.http import JsonResponse
from django.utils.crypto import salted_hmac
from django.utils.deprecation import MiddlewareMixin

from .models import RequestWindow


def client_address(request):
    raw_peer = request.META.get("REMOTE_ADDR", "")
    try:
        peer = ip_address(raw_peer)
    except ValueError:
        return ""
    if peer in settings.TRUSTED_PROXY_IPS:
        try:
            return str(ip_address(request.META.get("HTTP_X_REAL_IP", "")))
        except ValueError:
            pass
    return str(peer)


class RequestLimits(MiddlewareMixin):
    """Share request budgets across workers without storing origin addresses."""

    def process_view(self, request, view, args, kwargs):
        if request.method != "POST":
            return None
        limits = {
            "/api/reports/": ("intake", 60, 30),
            "/api/receipt/": ("receipt", 60, 30),
            "/review/sign-in/": ("login", 300, 20),
            "/admin/login/": ("login", 300, 20),
        }
        limit = limits.get(request.path_info)
        if limit is None:
            return None
        route, seconds, budget = limit
        now = int(time())
        expires = (now // seconds + 1) * seconds
        address = client_address(request)
        digest = salted_hmac(
            "track5-request-window", f"{route}:{expires}:{address}", algorithm="sha256",
        ).hexdigest()
        window, _ = RequestWindow.objects.get_or_create(
            route=route, client_digest=digest, expires_at=expires,
        )
        updated = RequestWindow.objects.filter(pk=window.pk, count__lt=budget).update(count=F("count") + 1)
        if updated:
            return None
        response = JsonResponse({"error": "Too many requests. Wait a moment and retry."}, status=429)
        response["Retry-After"] = str(expires - now)
        response["Cache-Control"] = "no-store"
        return response


class PageSecurity(MiddlewareMixin):
    def process_response(self, request, response):
        if request.path_info == "/" or request.path_info.startswith("/review/"):
            response["Content-Security-Policy"] = (
                "default-src 'none'; script-src 'self'; style-src 'self'; img-src 'self' data:; "
                "connect-src 'self'; worker-src 'self'; form-action 'self'; base-uri 'none'; "
                "frame-ancestors 'none'"
            )
        return response
