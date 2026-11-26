import uuid

from django.conf import settings
from django.db import models

from accounts.models import OrganisationOwned


class Claim(OrganisationOwned):
    class Source(models.TextChoices):
        DESK = "desk", "Desk"
        PUBLIC = "public", "Public"
        SMS = "sms", "SMS"

    id = models.UUIDField(primary_key=True, default=uuid.uuid4, editable=False)
    text = models.CharField(max_length=4000, blank=True)
    image_id = models.UUIDField(null=True)
    image = models.BinaryField(null=True)
    image_dimensions = models.JSONField(null=True)
    image_check = models.JSONField(null=True)
    seen_on = models.CharField(max_length=20)
    seen_at = models.DateTimeField(null=True)
    language = models.CharField(max_length=3)
    area = models.JSONField(null=True)
    harm = models.JSONField()
    check_worthiness = models.JSONField()
    source = models.CharField(max_length=16, choices=Source.choices, default=Source.DESK)
    ask_count = models.PositiveIntegerField(default=0)
    status = models.CharField(max_length=20, default="new")
    version = models.PositiveIntegerField(default=0)
    response = models.JSONField(null=True)
    drafted_by = models.ForeignKey(settings.AUTH_USER_MODEL, on_delete=models.PROTECT, related_name="+", null=True)
    created_by = models.ForeignKey(
        settings.AUTH_USER_MODEL, on_delete=models.PROTECT, related_name="+", null=True, blank=True
    )
    created_at = models.DateTimeField(auto_now_add=True)

    class Meta:
        indexes = [models.Index(fields=["organisation", "-created_at"])]


class ClaimAskHour(OrganisationOwned):
    claim = models.ForeignKey(Claim, on_delete=models.CASCADE, related_name="ask_hours")
    hour = models.DateTimeField()
    count = models.PositiveIntegerField(default=0)

    class Meta:
        constraints = [
            models.UniqueConstraint(fields=["claim", "hour"], name="unique_claim_ask_hour"),
        ]
        indexes = [models.Index(fields=["claim", "-hour"])]


class ClaimRequest(OrganisationOwned):
    actor = models.ForeignKey(settings.AUTH_USER_MODEL, on_delete=models.CASCADE)
    key = models.UUIDField()
    digest = models.CharField(max_length=64)
    body = models.JSONField()
    created_at = models.DateTimeField(auto_now_add=True)

    class Meta:
        constraints = [
            models.UniqueConstraint(fields=["organisation", "actor", "key"], name="unique_claim_request"),
        ]


class PublicCheckRequest(OrganisationOwned):
    device_hash = models.CharField(max_length=64)
    key = models.UUIDField()
    digest = models.CharField(max_length=64)
    status = models.PositiveSmallIntegerField(default=201)
    body = models.JSONField()
    created_at = models.DateTimeField(auto_now_add=True)

    class Meta:
        constraints = [
            models.UniqueConstraint(
                fields=["organisation", "device_hash", "key"], name="unique_public_check_request"
            ),
        ]
