from rest_framework.exceptions import PermissionDenied

from .models import User


def require_role(user, role):
    if not user.is_active or not (
        user.has_role(role) or (role == User.Role.ADMINISTRATOR and user.has_role(User.Role.COORDINATOR))
    ):
        raise PermissionDenied("This endpoint requires a different application role.")
