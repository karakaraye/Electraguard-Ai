import uuid

from django.conf import settings
from django.db import models


class Report(models.Model):
    class Status(models.TextChoices):
        RECEIVED = "received", "Received"
        IN_REVIEW = "in_review", "In review"
        CLOSED = "closed", "Closed"

    class Category(models.TextChoices):
        ACCESS = "access", "Access or accessibility"
        MATERIALS = "materials", "Materials or equipment"
        PROCEDURE = "procedure", "Process or procedure"
        CONDUCT = "conduct", "Conduct or safety"
        OTHER = "other", "Other or unsure"

    reference = models.UUIDField(default=uuid.uuid4, unique=True, editable=False)
    submission_key = models.UUIDField(unique=True)
    receipt_digest = models.CharField(max_length=64, unique=True)
    submission_digest = models.CharField(max_length=64)
    area = models.CharField(max_length=120)
    occurred_at = models.DateTimeField()
    received_at = models.DateTimeField(auto_now_add=True, db_index=True)
    category = models.CharField(max_length=16, choices=Category.choices)
    firsthand = models.BooleanField()
    description = models.CharField(max_length=1000)
    status = models.CharField(max_length=16, choices=Status.choices, default=Status.RECEIVED)
    version = models.PositiveIntegerField(default=0)


class ReviewEvent(models.Model):
    report = models.ForeignKey(Report, on_delete=models.CASCADE, related_name="events")
    actor = models.ForeignKey(settings.AUTH_USER_MODEL, on_delete=models.PROTECT)
    status = models.CharField(max_length=16, choices=Report.Status.choices)
    version = models.PositiveIntegerField()
    reason = models.CharField(max_length=32)
    created_at = models.DateTimeField(auto_now_add=True)

    class Meta:
        constraints = [
            models.UniqueConstraint(fields=("report", "version"), name="one_audit_event_per_version"),
        ]
