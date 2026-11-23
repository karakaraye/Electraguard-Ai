import uuid

from django.conf import settings
from django.db import models

from accounts.models import OrganisationOwned


class AuditEvent(OrganisationOwned):
    id = models.UUIDField(primary_key=True, default=uuid.uuid4, editable=False)
    sequence = models.PositiveBigIntegerField()
    created_at = models.DateTimeField()
    actor_ref = models.CharField(max_length=80, blank=True)
    actor_label = models.CharField(max_length=254, blank=True)
    action = models.CharField(max_length=80)
    object_type = models.CharField(max_length=80)
    object_id = models.CharField(max_length=80, blank=True)
    version = models.PositiveIntegerField(null=True)
    content_digest = models.CharField(max_length=64)
    prev_hash = models.CharField(max_length=64)
    hash = models.CharField(max_length=64)

    class Meta:
        ordering = ["sequence"]
        constraints = [
            models.UniqueConstraint(fields=["organisation", "sequence"], name="audit_org_sequence"),
        ]
        indexes = [models.Index(fields=["organisation", "created_at"], name="audit_org_timestamp")]


class AssignmentRequest(OrganisationOwned):
    actor = models.ForeignKey(settings.AUTH_USER_MODEL, on_delete=models.CASCADE)
    key = models.UUIDField()
    digest = models.CharField(max_length=64)
    results = models.JSONField(default=list)
    created_at = models.DateTimeField(auto_now_add=True)

    class Meta:
        constraints = [
            models.UniqueConstraint(
                fields=["organisation", "actor", "key"], name="unique_assignment_request",
            ),
        ]


class StaffInviteRequest(OrganisationOwned):
    actor = models.ForeignKey(settings.AUTH_USER_MODEL, on_delete=models.CASCADE, related_name="+")
    invited_user = models.ForeignKey(settings.AUTH_USER_MODEL, on_delete=models.CASCADE, related_name="+")
    key = models.UUIDField()
    digest = models.CharField(max_length=64)

    class Meta:
        constraints = [
            models.UniqueConstraint(
                fields=["organisation", "actor", "key"], name="unique_staff_invite_request",
            ),
        ]


class CodeBatch(OrganisationOwned):
    id = models.UUIDField(primary_key=True, default=uuid.uuid4, editable=False)
    label = models.CharField(max_length=80)
    count = models.PositiveSmallIntegerField()
    created_at = models.DateTimeField(auto_now_add=True)
    created_by = models.ForeignKey(settings.AUTH_USER_MODEL, on_delete=models.PROTECT)
    printed_at = models.DateTimeField(null=True)


class CodeBatchMembership(models.Model):
    batch = models.ForeignKey(CodeBatch, on_delete=models.PROTECT, related_name="members")
    credential = models.OneToOneField("accounts.ObserverCode", on_delete=models.PROTECT, related_name="batch_membership")


class CodeIssuance(OrganisationOwned):
    count = models.PositiveSmallIntegerField()
    day = models.DateField()

    class Meta:
        indexes = [models.Index(fields=["organisation", "day"])]


class CodeRequest(OrganisationOwned):
    actor = models.ForeignKey(settings.AUTH_USER_MODEL, on_delete=models.CASCADE)
    key = models.UUIDField()
    digest = models.CharField(max_length=64)
    body = models.JSONField(null=True)
    encrypted = models.BinaryField(null=True)
    expires_at = models.DateTimeField(null=True)
    created_at = models.DateTimeField(auto_now_add=True)

    class Meta:
        constraints = [
            models.UniqueConstraint(fields=["organisation", "actor", "key"], name="unique_code_request"),
        ]
