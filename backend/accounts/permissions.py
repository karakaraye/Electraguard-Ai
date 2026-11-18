from rest_framework.exceptions import PermissionDenied


def require_role(user, role):
    if user.role != role:
        raise PermissionDenied("This endpoint requires a different application role.")
