from django.db.models.signals import post_save
from django.dispatch import receiver

from accounts.models import ObserverSecurityAlert, StaffSecurityAlert
from reports.models import MediaAccess, ReviewEvent
from security.detectors import intake, media_access, notice

from .audit import record


@receiver(post_save, sender=ReviewEvent)
def chain_review(sender, instance, created, raw, **kwargs):
    if not created or raw:
        return
    if instance.action == ReviewEvent.Action.CREATE:
        intake(instance.organisation_id)
    record(
        instance.organisation_id, instance.action, "report", instance.report_id,
        actor=instance.actor, version=instance.version, content=instance.change,
    )


@receiver(post_save, sender=MediaAccess)
def chain_media(sender, instance, created, raw, **kwargs):
    if created and not raw:
        media_access(instance.actor, instance.media_id, download=instance.action != "view_media")
        if instance.reason:
            record(
                instance.organisation_id, instance.action, "media", instance.media_id,
                actor=instance.actor, content={"reason": instance.reason},
            )


@receiver(post_save, sender=StaffSecurityAlert)
def relay_staff_alert(sender, instance, created, raw, **kwargs):
    if created and not raw:
        user = instance.user
        notice(
            instance.organisation_id, instance.rule, "staff_account", user.public_id,
            user.get_full_name() or user.email, instance.details,
        )


@receiver(post_save, sender=ObserverSecurityAlert)
def relay_observer_alert(sender, instance, created, raw, **kwargs):
    if created and not raw:
        code = instance.credential.code
        notice(
            instance.organisation_id, "repeated_failed_pins", "observer_code", code, code,
            {"permanent": instance.permanent}, severity="high" if instance.permanent else "medium",
        )
