from rest_framework.exceptions import PermissionDenied


def require_role(user, role):
    if not user.is_active or getattr(user, "role", None) != role:
        raise PermissionDenied("This endpoint requires a different application role.")
