import uuid

from django.conf import settings
from django.db import models


class Report(models.Model):
    class Status(models.TextChoices):
        SUBMITTED = "submitted", "Submitted"
        IN_REVIEW = "in_review", "In review"
        NEEDS_CLARIFICATION = "needs_clarification", "Needs clarification"
        CLOSED = "closed", "Closed"

    class Outcome(models.TextChoices):
        CORROBORATED = "corroborated", "Corroborated by available evidence"
        INSUFFICIENT_EVIDENCE = "insufficient_evidence", "Insufficient evidence"
        OUT_OF_SCOPE = "out_of_scope", "Out of scope"

    reference = models.UUIDField(primary_key=True, default=uuid.uuid4, editable=False)
    observer = models.ForeignKey(settings.AUTH_USER_MODEL, on_delete=models.PROTECT)
    assigned_reviewer = models.ForeignKey(
        settings.AUTH_USER_MODEL, null=True, blank=True, on_delete=models.PROTECT,
        related_name="assigned_reports",
    )
    version = models.PositiveIntegerField(default=0)
    submission_key = models.UUIDField()
    occurred_at = models.DateTimeField(db_index=True)
    location = models.CharField(max_length=160)
    description = models.CharField(max_length=1000)
    status = models.CharField(max_length=24, choices=Status.choices, default=Status.SUBMITTED)
    created_at = models.DateTimeField(auto_now_add=True)

    class Meta:
        ordering = ["-created_at", "reference"]
        constraints = [
            models.UniqueConstraint(
                fields=["observer", "submission_key"], name="reports_observer_submission_key"
            ),
        ]


class Evidence(models.Model):
    id = models.UUIDField(primary_key=True, default=uuid.uuid4, editable=False)
    report = models.ForeignKey(Report, related_name="attachments", on_delete=models.CASCADE)
    name = models.CharField(max_length=255)
    content_type = models.CharField(max_length=20)
    sha256 = models.CharField(max_length=64)
    content = models.BinaryField()

    class Meta:
        ordering = ["id"]
        constraints = [
            models.UniqueConstraint(fields=["report", "sha256"], name="reports_unique_evidence"),
        ]


class ReviewEvent(models.Model):
    class Action(models.TextChoices):
        ASSIGN = "assign", "Assigned reviewer"
        START = "start", "Started review"
        REQUEST_CLARIFICATION = "request_clarification", "Requested clarification"
        RESPOND = "respond", "Responded to clarification"
        CLOSE = "close", "Closed review"
        CORRECT_CATEGORY = "correct_category", "Corrected triage category"
        DECIDE_MATCH = "decide_match", "Reviewed possible match"

    report = models.ForeignKey(Report, related_name="review_events", on_delete=models.CASCADE)
    actor = models.ForeignKey(settings.AUTH_USER_MODEL, on_delete=models.PROTECT)
    created_at = models.DateTimeField(auto_now_add=True)
    version = models.PositiveIntegerField()
    action = models.CharField(max_length=24, choices=Action.choices)
    change = models.JSONField()

    class Meta:
        ordering = ["version"]
        constraints = [
            models.UniqueConstraint(fields=["report", "version"], name="reports_unique_review_version"),
        ]


class Triage(models.Model):
    class Status(models.TextChoices):
        PENDING = "pending", "Pending"
        READY = "ready", "Ready"
        FAILED = "failed", "Unavailable"

    class Category(models.TextChoices):
        ACCESS = "access", "Access or accessibility"
        MATERIALS = "materials", "Materials or equipment"
        PROCEDURE = "procedure", "Process or procedure"
        CONDUCT = "conduct", "Conduct or safety"
        OTHER = "other", "Other or unclear"

    report = models.OneToOneField(Report, related_name="triage", on_delete=models.CASCADE)
    status = models.CharField(max_length=12, choices=Status.choices, default=Status.PENDING)
    method_version = models.CharField(max_length=32)
    attempted_at = models.DateTimeField(null=True)
    category = models.CharField(max_length=12, choices=Category.choices, blank=True)
    corrected_category = models.CharField(max_length=12, choices=Category.choices, blank=True)


class TriageMatch(models.Model):
    class Decision(models.TextChoices):
        PENDING = "pending", "Awaiting review"
        CONFIRMED = "confirmed", "Confirmed by Reviewer"
        DISMISSED = "dismissed", "Dismissed by Reviewer"

    first = models.ForeignKey(Report, related_name="+", on_delete=models.CASCADE)
    second = models.ForeignKey(Report, related_name="+", on_delete=models.CASCADE)
    score = models.FloatField()
    decision = models.CharField(max_length=12, choices=Decision.choices, default=Decision.PENDING)

    class Meta:
        constraints = [
            models.UniqueConstraint(fields=["first", "second"], name="reports_unique_triage_pair"),
            models.CheckConstraint(condition=models.Q(first__lt=models.F("second")), name="reports_ordered_triage_pair"),
        ]
