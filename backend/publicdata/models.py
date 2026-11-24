import uuid

from django.conf import settings
from django.db import models

from accounts.models import OrganisationOwned


class Snapshot(OrganisationOwned):
    class Status(models.TextChoices):
        DRAFT = "draft", "Draft"
        PUBLISHED = "published", "Published"
        DISCARDED = "discarded", "Discarded"
        SUPERSEDED = "superseded", "Superseded"

    id = models.UUIDField(primary_key=True, default=uuid.uuid4, editable=False)
    status = models.CharField(max_length=12, choices=Status.choices, default=Status.DRAFT)
    version = models.PositiveIntegerField(default=0)
    cutoff = models.DateTimeField()
    created_at = models.DateTimeField(auto_now_add=True)
    created_by = models.ForeignKey(settings.AUTH_USER_MODEL, on_delete=models.PROTECT, related_name="+")
    approved_by = models.ForeignKey(
        settings.AUTH_USER_MODEL, on_delete=models.PROTECT, related_name="+", null=True,
    )
    published_at = models.DateTimeField(null=True)
    preview = models.JSONField()
    excluded = models.JSONField()

    class Meta:
        constraints = [
            models.UniqueConstraint(
                fields=["organisation"], condition=models.Q(status="published"),
                name="one_published_snapshot_per_org",
            ),
        ]


class Schedule(OrganisationOwned):
    hourly = models.BooleanField(default=False)
    version = models.PositiveIntegerField(default=0)
    approver = models.ForeignKey(settings.AUTH_USER_MODEL, on_delete=models.PROTECT, null=True)
    last_attempt_at = models.DateTimeField(null=True)

    class Meta:
        constraints = [
            models.UniqueConstraint(fields=["organisation"], name="one_snapshot_schedule_per_org"),
        ]


class SnapshotRequest(OrganisationOwned):
    actor = models.ForeignKey(settings.AUTH_USER_MODEL, on_delete=models.CASCADE)
    key = models.UUIDField()
    digest = models.CharField(max_length=64)
    status = models.PositiveSmallIntegerField()
    body = models.JSONField()
    created_at = models.DateTimeField(auto_now_add=True)

    class Meta:
        constraints = [
            models.UniqueConstraint(
                fields=["organisation", "actor", "key"], name="unique_snapshot_request",
            ),
        ]
