import unicodedata
from datetime import timedelta
from uuid import UUID

from django.core.exceptions import ValidationError
from django.core.validators import validate_email
from django.db import IntegrityError, transaction
from django.http import JsonResponse
from django.utils import timezone

from accounts.models import AccountOffboarding, Organisation, User
from accounts.observer_auth import endpoint, error, wat
from accounts.observer_credentials import digest
from accounts.observer_sessions import end_sessions
from reports.idempotency import lock_key, request_digest
from reports.models import Report, ReviewEvent

from .audit import authorize, record
from .cases import audited_change, invalid, text_field
from .models import StaffInviteRequest


ROLES = ("reviewer", "coordinator", "moderator", "org_admin")


def staff_status(user):
    if not user.is_active:
        return "offboarded"
    if user.staff_invite_digest:
        return "invited"
    return "active"


def staff_json(user):
    return {
        "id": str(user.public_id), "email": user.email, "display_name": user.get_full_name() or user.email,
        "roles": user.effective_roles, "status": staff_status(user),
        "totp_enrolled": bool(user.totp_secret),
        "last_sign_in_on": wat(user.last_login)[:10] if user.last_login else None,
        "version": user.staff_version,
    }


def staff_members(org_id):
    return User.objects.filter(organisation_id=org_id, role__in=(*ROLES, User.Role.ADMINISTRATOR))


def validate_roles(value):
    return (
        isinstance(value, list) and bool(value) and len(value) <= len(ROLES)
        and all(isinstance(role, str) and role in ROLES for role in value)
        and len(set(value)) == len(value) and ("org_admin" not in value or len(value) == 1)
    )


def set_roles(user, roles):
    user.staff_roles = roles
    user.role = next(role for role in ROLES if role in roles)


def name_value(data):
    value = text_field(data.get("display_name"))
    return unicodedata.normalize("NFC", value) if value and 2 <= len(value) <= 60 else None


@endpoint("GET")
def list_staff(request):
    denied = authorize(request, export=True)
    if denied is not None:
        return denied
    role, status = request.GET.get("role"), request.GET.get("status")
    if role is not None and role not in ROLES:
        return invalid("role")
    if status not in {None, "active", "invited", "offboarded"}:
        return invalid("status")
    rows = []
    for user in staff_members(request.user.organisation_id).order_by("email").iterator():
        if role and role not in user.effective_roles:
            continue
        if status and status != staff_status(user):
            continue
        rows.append(staff_json(user))
    return JsonResponse({"items": rows})


def invite_token(actor, key):
    material = f"{actor.organisation_id}/{actor.public_id}/{key}"
    return "inv_" + digest("staff-invite-token", material)


def invitation_response(user, token, *, replayed=False):
    invite = None
    if (user.is_active and user.staff_invite_expires_at and user.staff_invite_expires_at > timezone.now()
            and user.staff_invite_digest == digest("staff-invite", token)):
        invite = {"url": f"/s/sign-in?invite={token}", "expires_at": wat(user.staff_invite_expires_at)}
    response = JsonResponse({"staff": staff_json(user), "invite": invite}, status=200 if replayed else 201)
    if replayed:
        response["Idempotent-Replayed"] = "true"
    return response


@endpoint("POST", max_body_bytes=4096)
@transaction.atomic
def invite(request, data):
    denied = authorize(request, export=True)
    if denied is not None:
        return denied
    actor = request.user
    try:
        key = UUID(request.headers.get("Idempotency-Key", ""))
        if key.version != 4:
            raise ValueError
    except ValueError:
        return error(400, "idempotency_key_required", "Send a UUID v4 Idempotency-Key.")
    if not lock_key(f"staff-invite:{actor.organisation_id}:{actor.pk}:{key}"):
        return error(409, "request_in_progress", "This request is still being processed.", retry=2)
    checksum = request_digest(request, data)
    token = invite_token(actor, key)
    previous = StaffInviteRequest.objects.filter(
        actor=actor, organisation_id=actor.organisation_id, key=key,
    ).select_related("invited_user").first()
    if previous:
        if previous.digest != checksum:
            return error(409, "idempotency_key_reused", "This send key belongs to a different request.")
        return invitation_response(previous.invited_user, token, replayed=True)
    email, roles = data.get("email"), data.get("roles")
    try:
        if not isinstance(email, str) or len(email) > 254:
            raise ValidationError("Email is required.")
        validate_email(email)
    except ValidationError:
        return invalid("email")
    name = name_value(data)
    if not name:
        return invalid("display_name")
    if not validate_roles(roles):
        return invalid("roles", message="Select valid roles. Organisation admin must be assigned alone.")
    organisation = Organisation.objects.select_for_update(no_key=True).get(pk=actor.organisation_id)
    user = User(
        email=User.objects.normalize_email(email), first_name=name, organisation=organisation,
        staff_invite_expires_at=timezone.now() + timedelta(hours=72),
        staff_invite_digest=digest("staff-invite", token),
    )
    set_roles(user, roles)
    user.set_unusable_password()
    try:
        with transaction.atomic():
            user.save(force_insert=True)
    except IntegrityError:
        return invalid("email", "duplicate", "An account already uses this email address.")
    StaffInviteRequest.objects.create(
        actor=actor, organisation=organisation, key=key, digest=checksum, invited_user=user,
    )
    record(organisation.pk, "invite_staff", "staff_account", user.public_id, actor=actor, version=0)
    return invitation_response(user, token)


def staff(request):
    return invite(request) if request.method == "POST" else list_staff(request)


def last_admin(user):
    return "org_admin" in user.effective_roles and not staff_members(user.organisation_id).filter(
        role=User.Role.ORG_ADMIN, is_active=True, staff_invite_digest__isnull=True,
    ).exclude(pk=user.pk).exists()


def unassign(user, actor, *, offboarding=False):
    reports = list(Report.objects.select_for_update().filter(
        organisation_id=user.organisation_id, assigned_reviewer=user,
    ).exclude(status__in=[Report.Status.CLOSED, Report.Status.WITHDRAWN]).order_by("pk"))
    if reports and offboarding:
        from security.detectors import notice

        notice(
            user.organisation_id, "staff_offboarded_with_cases", "staff_account", user.public_id,
            user.get_full_name() or user.email, {"open_cases": len(reports)},
        )
    for report in reports:
        report.assigned_reviewer = None
        audited_change(report, actor, ReviewEvent.Action.ASSIGN, {"reviewer": None}, "assigned_reviewer")
    return len(reports)


@transaction.atomic
def write_staff(request, data, staff_id, operation):
    denied = authorize(request, export=True)
    if denied is not None:
        return denied
    actor = request.user
    Organisation.objects.select_for_update(no_key=True).get(pk=actor.organisation_id)
    user = staff_members(actor.organisation_id).select_for_update().filter(public_id=staff_id).first()
    if user is None:
        return error(404, "not_found", "We could not find that.")
    version = data.get("version")
    if type(version) is not int or version < 0:
        return invalid("version")
    if version != user.staff_version:
        return error(409, "stale_version", "This account has changed. Refresh before trying again.")
    if not user.is_active:
        return error(409, "invalid_transition", "This account has been offboarded.")
    content = {}
    revoke = False
    if operation == "update_staff":
        if "display_name" in data:
            name = name_value(data)
            if not name:
                return invalid("display_name")
            user.first_name, user.last_name = name, ""
        if "roles" in data:
            roles = data["roles"]
            if not validate_roles(roles):
                return invalid("roles", message="Select valid roles. Organisation admin must be assigned alone.")
            if "org_admin" not in roles and last_admin(user):
                return error(409, "last_admin", "Keep at least one active organisation admin.")
            if "reviewer" in user.effective_roles and "reviewer" not in roles:
                unassign(user, actor)
            revoke = set(roles) != set(user.effective_roles)
            set_roles(user, roles)
            content["roles"] = roles
    elif operation == "reset_2fa":
        user.totp_secret, user.totp_last_step = "", -1
        revoke = True
    else:
        if user.pk == actor.pk:
            return error(403, "forbidden", "You cannot offboard your own account.")
        if last_admin(user):
            return error(409, "last_admin", "Keep at least one active organisation admin.")
        reason = data.get("reason")
        if reason not in AccountOffboarding.Reason.values:
            return invalid("reason", "invalid_choice")
        content = {"reason": reason, "unassigned_cases": unassign(user, actor, offboarding=True)}
        AccountOffboarding.objects.create(
            organisation_id=user.organisation_id, account=user, authorized_by=actor, role=user.role, reason=reason,
        )
        user.is_active = False
        user.staff_invite_digest = user.staff_invite_expires_at = None
        revoke = True
    if revoke:
        user.staff_auth_generation += 1
        end_sessions(user, include_legacy=True)
    user.staff_version += 1
    user.save()
    record(
        user.organisation_id, operation, "staff_account", user.public_id,
        actor=actor, version=user.staff_version, content=content,
    )
    return JsonResponse({"staff": staff_json(user)})


@endpoint("PATCH", max_body_bytes=4096)
def update(request, data, staff_id):
    return write_staff(request, data, staff_id, "update_staff")


@endpoint("POST", max_body_bytes=4096)
def operation(request, data, staff_id, action):
    return write_staff(request, data, staff_id, action)
