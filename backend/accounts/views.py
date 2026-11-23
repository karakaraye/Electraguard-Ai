from django.contrib.auth import authenticate, login, logout
from django.http import JsonResponse
from django.middleware.csrf import get_token
from django.views.decorators.cache import never_cache
from django.views.decorators.csrf import csrf_protect
from django.views.decorators.http import require_GET, require_POST
from rest_framework.decorators import api_view
from rest_framework.response import Response

from .models import User
from .observer_sessions import track_session
from .permissions import require_role


@never_cache
@require_GET
def csrf_token(request):
    return JsonResponse({"csrfToken": get_token(request)})


def legacy_role(user):
    return User.Role.ADMINISTRATOR if user.role == User.Role.COORDINATOR else user.role


@never_cache
@require_POST
@csrf_protect
def sign_in(request):
    # Django's CSRF decorator also covers unauthenticated login requests.
    user = authenticate(
        request, email=request.POST.get("email", ""), password=request.POST.get("password", "")
    )
    if user is None or user.role not in User.Role.values:
        return JsonResponse({"detail": "Invalid email or password."}, status=401)
    login(request, user)
    track_session(request, user)
    return JsonResponse({"email": user.email, "role": legacy_role(user)})


@never_cache
@api_view(["POST"])
def sign_out(request):
    logout(request)
    return Response(status=204)


@never_cache
@api_view(["GET"])
def current_user(request):
    return Response({"email": request.user.email, "role": legacy_role(request.user)})


@never_cache
@api_view(["GET"])
def workspace(request, role):
    require_role(request.user, role)
    return Response({"email": request.user.email, "role": role, "title": f"{role.label} Workspace"})
