from rest_framework.exceptions import PermissionDenied

from .models import User


def require_role(user, role):
    actual = getattr(user, "role", None)
    allowed = actual == role or (role == User.Role.ADMINISTRATOR and actual == User.Role.COORDINATOR)
    if not user.is_active or not allowed:
        raise PermissionDenied("This endpoint requires a different application role.")
