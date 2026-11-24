import uuid

from django.db import models

from accounts.models import OrganisationOwned


class Alert(OrganisationOwned):
    id = models.UUIDField(primary_key=True, default=uuid.uuid4, editable=False)
    rule = models.CharField(max_length=48)
    severity = models.CharField(max_length=10)
    status = models.CharField(max_length=16, default="open")
    version = models.PositiveIntegerField(default=0)
    subject_key = models.CharField(max_length=128)
    subject_type = models.CharField(max_length=32)
    subject_label = models.CharField(max_length=254)
    details = models.JSONField(default=dict)
    note = models.CharField(max_length=500, blank=True)
    first_seen_at = models.DateTimeField(auto_now_add=True)
    last_seen_at = models.DateTimeField(auto_now=True)
    detector = models.CharField(max_length=8, default="rules")

    class Meta:
        constraints = [
            models.UniqueConstraint(
                fields=["organisation", "rule", "subject_key"], condition=models.Q(status="open"),
                name="unique_open_security_alert",
            ),
        ]
        indexes = [models.Index(fields=["organisation", "-last_seen_at"])]


class SeenNetwork(OrganisationOwned):
    actor = models.CharField(max_length=36)
    network = models.CharField(max_length=64)
    created_at = models.DateTimeField(auto_now_add=True)

    class Meta:
        constraints = [models.UniqueConstraint(
            fields=["organisation", "actor", "network"], name="unique_staff_network",
        )]
