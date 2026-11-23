from datetime import timedelta
from ipaddress import ip_address, ip_network

from django.conf import settings
from django.db import transaction
from django.utils import timezone

from accounts.observer_credentials import digest
from reports.idempotency import lock_key
from reports.models import Report
from staff.audit import record
from staff.models import AuditEvent

from .models import Alert, SeenNetwork


@transaction.atomic
def notice(organisation_id, rule, subject_type, subject_key, subject_label, details, *, severity="medium"):
    if not lock_key(f"security:{organisation_id}:{rule}:{subject_key}"):
        return
    alert, created = Alert.objects.select_for_update().get_or_create(
        organisation_id=organisation_id, rule=rule, subject_key=str(subject_key), status="open",
        defaults={
            "subject_type": subject_type, "subject_label": subject_label[:254],
            "severity": severity, "details": details,
        },
    )
    if not created:
        alert.details = details
        alert.save(update_fields=["details", "last_seen_at"])
    else:
        record(organisation_id, "raise_security_alert", "security_alert", alert.pk, content={"rule": rule})


def staff_network(request, user):
    peer = request.META.get("REMOTE_ADDR")
    try:
        address = ip_address(peer)
        if peer in settings.AUTH_TRUSTED_PROXY_IPS:
            address = ip_address(request.META.get("HTTP_X_FORWARDED_FOR"))
    except ValueError:
        return
    network = ip_network(f"{address}/{24 if address.version == 4 else 64}", strict=False)
    fingerprint = digest("staff-network", str(network))
    label = user.get_full_name() or user.email
    seen = SeenNetwork.objects.filter(organisation_id=user.organisation_id, actor=str(user.public_id))
    known = seen.exists()
    _, created = seen.get_or_create(
        organisation_id=user.organisation_id, actor=str(user.public_id), network=fingerprint,
    )
    if known and created:
        notice(
            user.organisation_id, "new_network_sign_in", "staff_account", user.public_id, label,
            {"network": fingerprint[:12]},
        )


def intake(organisation_id):
    count = Report.objects.filter(
        organisation_id=organisation_id, created_at__gte=timezone.now() - timedelta(minutes=10),
    ).count()
    if count >= 100:
        notice(
            organisation_id, "intake_burst", "organisation", organisation_id, "Report intake",
            {"reports": count, "window_minutes": 10},
        )


@transaction.atomic
def media_access(user, attachment_id, *, download=False):
    if not lock_key(f"media-access:{user.organisation_id}:{user.public_id}"):
        return
    recent = AuditEvent.objects.filter(
        organisation_id=user.organisation_id, object_type="media",
        actor_ref=str(user.public_id), action__in=["view_media", "download_media"],
        created_at__gte=timezone.now() - timedelta(minutes=10),
    )
    if recent.filter(object_id=str(attachment_id)).exists():
        return
    count = recent.order_by().values("object_id").distinct().count() + 1
    if count > 100:
        notice(
            user.organisation_id, "unusual_download_volume", "staff_account", user.public_id,
            user.get_full_name() or user.email, {"distinct_items": count, "window_minutes": 10},
        )
    record(
        user.organisation_id, "download_media" if download else "view_media",
        "media", attachment_id, actor=user,
    )
