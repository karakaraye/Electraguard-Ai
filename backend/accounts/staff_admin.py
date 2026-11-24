import secrets
from datetime import timedelta

from django.db import IntegrityError, transaction
from django.http import JsonResponse
from django.utils import timezone

from reports.idempotency import idempotent
from reports.models import Report, ReviewEvent
from reports.workflow import record_change

from .models import AccountOffboarding, StaffCredential, StaffMutation, StaffSecurityAlert, User
from .observer_auth import endpoint, error, validation, wat
from .observer_credentials import digest
from .observer_sessions import end_sessions
from .organisations import org_scope
from .staff_auth import STAFF_ROLES, alert, email_address, get_credential
from .staff_sessions import VERIFIED

MANAGED_ROLES = (*STAFF_ROLES, User.Role.ADMINISTRATOR)


def stored_credential(user):
    return getattr(user, "staff_credential", None)


def summary(user, credential):
    return {
        "id": str(user.pk),
        "email": user.email,
        "display_name": user.get_full_name() or None,
        "roles": user.application_roles,
        "status": ("offboarded" if not user.is_active else
                   "invited" if credential and credential.invite_digest else "active"),
        "totp_enrolled": bool(credential and credential.secret),
        "last_sign_in_on": wat(credential.last_sign_in_on) if credential and credential.last_sign_in_on else None,
        "version": credential.version if credential else 0,
    }


def staff_accounts(request):
    return org_scope(request, User).filter(role__in=MANAGED_ROLES, is_superuser=False, is_staff=False)


def permission(request):
    if not request.user.is_authenticated:
        return error(401, "not_authenticated", "Sign in to continue.")
    if not request.session.get(VERIFIED) or not request.user.has_role(User.Role.ORG_ADMIN):
        return error(403, "forbidden", "An organisation administrator is required.")
    return None


def lock_admin(request):
    org_scope(request).select_for_update().get()
    return staff_accounts(request).select_for_update().filter(
        pk=request.user.pk, role=User.Role.ORG_ADMIN, is_active=True,
    ).exists()


def name_and_roles(data, *, required=False):
    fields = {}
    name = data.get("display_name")
    roles = data.get("roles")
    if required or "display_name" in data:
        if not isinstance(name, str) or not 2 <= len(name.strip()) <= 60:
            fields["display_name"] = {"code": "invalid", "message": "Use 2 to 60 characters."}
    if required or "roles" in data:
        if not isinstance(roles, list) or not roles or any(role not in STAFF_ROLES for role in roles):
            fields["roles"] = {"code": "invalid", "message": "Choose at least one staff role."}
        elif len(set(roles)) != len(roles):
            fields["roles"] = {"code": "invalid", "message": "Choose each role only once."}
        elif User.Role.ORG_ADMIN in roles and len(roles) != 1:
            fields["roles"] = {
                "code": "invalid", "message": "Organisation admin cannot be combined with other roles.",
            }
    return fields


def last_admin(request, target):
    alternatives = staff_accounts(request).filter(role=User.Role.ORG_ADMIN, is_active=True).exclude(pk=target.pk)
    return target.is_active and target.role == User.Role.ORG_ADMIN and not any(
        user.has_usable_password() for user in alternatives
    )


@endpoint("GET")
def list_staff(request):
    denied = permission(request)
    if denied is not None:
        return denied
    role = request.GET.get("role")
    status = request.GET.get("status")
    fields = {}
    if role is not None and role not in STAFF_ROLES:
        fields["role"] = {"code": "invalid_choice", "message": "Choose a staff role."}
    if status is not None and status not in ("active", "offboarded"):
        fields["status"] = {"code": "invalid_choice", "message": "Choose active or offboarded."}
    if fields:
        return validation(fields)
    users = staff_accounts(request).select_related("staff_credential").order_by("email")
    if role is not None:
        users = users.filter(User.with_role(role))
    if status is not None:
        users = users.filter(is_active=status == "active")
    items = [summary(user, stored_credential(user)) for user in users]
    return JsonResponse({"items": [item for item in items if status is None or item["status"] == status]})


def duplicate_email():
    return validation({"email": {"code": "duplicate", "message": "This email is already in use."}})


@endpoint("POST", max_body_bytes=8192)
def create_staff(request, data):
    denied = permission(request)
    if denied is not None:
        return denied
    fields = name_and_roles(data, required=True)
    email = email_address(data.get("email"))
    if email is None:
        fields["email"] = {"code": "invalid", "message": "Enter a valid email address."}
    if fields:
        return validation(fields)

    original = {}

    def perform():
        if not lock_admin(request):
            return error(403, "forbidden", "An organisation administrator is required.")
        try:
            with transaction.atomic():
                user = User.objects.create_user(
                    email, first_name=data["display_name"].strip(),
                    organisation_id=request.user.organisation_id, role=data["roles"][0],
                    additional_roles=data["roles"][1:],
                )
        except IntegrityError:
            if User.objects.filter(email=email).exists():
                return duplicate_email()
            raise
        token = "inv_" + secrets.token_urlsafe(32)
        credential = StaffCredential.objects.create(
            user=user, organisation_id=user.organisation_id, enforce_totp=True,
            invite_digest=digest("staff-invite", token), invite_expires_at=timezone.now() + timedelta(hours=72),
        )
        staff = summary(user, credential)
        original.update(staff=staff, invite={
            "url": f"/s/sign-in?invite={token}", "expires_at": wat(credential.invite_expires_at),
        })
        return 201, {"staff": staff}, None

    response = idempotent(request, "staff-create", data, perform, record_model=StaffMutation)
    if original and response.status_code == 201:
        # The one-time link is only in the original response, never in the replay record.
        return JsonResponse(original, status=201)
    return response


def staff_collection(request):
    return create_staff(request) if request.method == "POST" else list_staff(request)


def locked_target(request, account_id, data):
    if not lock_admin(request):
        return None, None, error(403, "forbidden", "An organisation administrator is required.")
    user = staff_accounts(request).select_for_update().filter(pk=account_id).first()
    if user is None:
        return None, None, error(404, "not_found", "This staff account was not found.")
    credential = stored_credential(user)
    version = data.get("version")
    if type(version) is not int or version < 0:
        return None, None, validation({"version": {"code": "invalid", "message": "Send the staff account version."}})
    if version != (credential.version if credential else 0):
        return None, None, error(409, "stale_version", "This staff account has changed. Refresh and try again.")
    return user, credential, None


def last_admin_error():
    return error(409, "last_admin", "Keep at least one active organisation administrator.")


@endpoint("PATCH", max_body_bytes=8192)
@transaction.atomic
def update_staff(request, data, account_id):
    denied = permission(request)
    if denied is not None:
        return denied
    fields = name_and_roles(data)
    if fields:
        return validation(fields)
    user, credential, rejected = locked_target(request, account_id, data)
    if rejected is not None:
        return rejected
    roles = data.get("roles", user.application_roles)
    if User.Role.ORG_ADMIN not in roles and last_admin(request, user):
        return last_admin_error()
    if "display_name" in data:
        user.first_name, user.last_name = data["display_name"].strip(), ""
    user.role, user.additional_roles = roles[0], roles[1:]
    user.save(update_fields=["first_name", "last_name", "role", "additional_roles"])
    credential = credential or get_credential(user)
    credential.version += 1
    credential.save(update_fields=["version"])
    return JsonResponse({"staff": summary(user, credential)})


def reset(user, credential):
    credential.secret = ""
    credential.last_totp_step = -1
    credential.enforce_totp = True
    end_sessions(user, include_legacy=True)


def offboard(request, user, credential, reason):
    user.is_active = False
    user.set_unusable_password()
    user.save(update_fields=["is_active", "password"])
    end_sessions(user, include_legacy=True)
    credential.invite_digest = credential.invite_expires_at = None
    AccountOffboarding.objects.create(
        organisation_id=user.organisation_id, account=user, authorized_by=request.user, role=user.role, reason=reason,
    )
    cases = org_scope(request, Report).select_for_update().filter(assigned_reviewer=user).exclude(
        status__in=(Report.Status.CLOSED, Report.Status.WITHDRAWN),
    ).order_by("pk")
    count = 0
    for report in cases:
        report.assigned_reviewer = None
        record_change(report, request.user, ReviewEvent.Action.ASSIGN, {
            "previous_reviewer": user.email, "reviewer": None, "reason": "staff_offboarded",
        }, "assigned_reviewer")
        count += 1
    if count:
        alert(user, StaffSecurityAlert.Rule.OFFBOARD, case_count=count)


def change_staff(request, data, account_id, *, offboarding):
    denied = permission(request)
    if denied is not None:
        return denied
    reason = data.get("reason")
    if offboarding and reason not in AccountOffboarding.Reason.values:
        return validation({"reason": {"code": "invalid_choice", "message": "Choose an offboarding reason."}})

    def perform():
        user, credential, rejected = locked_target(request, account_id, data)
        if rejected is not None:
            return rejected
        if not user.is_active:
            return error(409, "invalid_transition", "This staff account is offboarded.")
        if offboarding and user.pk == request.user.pk:
            return error(403, "forbidden", "You cannot offboard your own account.")
        if offboarding and last_admin(request, user):
            return last_admin_error()
        credential = credential or get_credential(user)
        if offboarding:
            offboard(request, user, credential, reason)
        else:
            reset(user, credential)
        credential.version += 1
        credential.save()
        return 200, {"staff": summary(user, credential)}, None

    return idempotent(
        request, "staff-offboard" if offboarding else "staff-reset-2fa", data, perform, record_model=StaffMutation,
    )


@endpoint("POST", max_body_bytes=8192)
def reset_2fa(request, data, account_id):
    return change_staff(request, data, account_id, offboarding=False)


@endpoint("POST", max_body_bytes=8192)
def offboard_staff(request, data, account_id):
    return change_staff(request, data, account_id, offboarding=True)
