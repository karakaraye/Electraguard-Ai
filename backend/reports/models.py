import uuid

from django.conf import settings
from django.db import models
from django.utils import timezone

from accounts.models import OrganisationOwned


class Report(OrganisationOwned):
    class Status(models.TextChoices):
        SUBMITTED = "submitted", "Submitted"
        IN_REVIEW = "in_review", "In review"
        NEEDS_CLARIFICATION = "needs_clarification", "Needs clarification"
        CLOSED = "closed", "Closed"
        WITHDRAWN = "withdrawn", "Withdrawn"

    class Outcome(models.TextChoices):
        CORROBORATED = "corroborated", "Corroborated by available evidence"
        INSUFFICIENT_EVIDENCE = "insufficient_evidence", "Insufficient evidence"
        OUT_OF_SCOPE = "out_of_scope", "Out of scope"

    reference = models.UUIDField(primary_key=True, default=uuid.uuid4, editable=False)
    observer = models.ForeignKey(settings.AUTH_USER_MODEL, null=True, on_delete=models.PROTECT)
    channel = models.CharField(max_length=12, default="app")
    receipt_secret_hash = models.CharField(max_length=64, blank=True, default="")
    assigned_reviewer = models.ForeignKey(
        settings.AUTH_USER_MODEL, null=True, blank=True, on_delete=models.PROTECT,
        related_name="assigned_reports",
    )
    version = models.PositiveIntegerField(default=0)
    submission_key = models.UUIDField()
    occurred_at = models.DateTimeField(db_index=True, null=True)
    location = models.CharField(max_length=160)
    polling_unit_code = models.CharField(max_length=128, blank=True, default="")
    description = models.CharField(max_length=2000)
    receipt_code = models.CharField(max_length=12, null=True, unique=True)
    kind = models.CharField(max_length=16, default="incident")
    structured_details = models.JSONField(default=dict, blank=True)
    result_flags = models.JSONField(default=list, blank=True)
    observer_read_version = models.PositiveIntegerField(default=0)
    reviewer_read_version = models.PositiveIntegerField(default=0)
    observer_code = models.CharField(max_length=10, blank=True)
    incident_details = models.JSONField(default=dict)
    withdrawn_at = models.DateTimeField(null=True)
    status = models.CharField(max_length=24, choices=Status.choices, default=Status.SUBMITTED)
    created_at = models.DateTimeField(auto_now_add=True)

    class Meta:
        ordering = ["-created_at", "reference"]
        constraints = [
            models.UniqueConstraint(
                fields=["observer", "submission_key"], name="reports_observer_submission_key"
            ),
        ]


class Evidence(OrganisationOwned):
    id = models.UUIDField(primary_key=True, default=uuid.uuid4, editable=False)
    report = models.ForeignKey(Report, related_name="attachments", on_delete=models.CASCADE)
    name = models.CharField(max_length=255)
    content_type = models.CharField(max_length=20)
    purpose = models.CharField(max_length=8, default="evidence")
    sha256 = models.CharField(max_length=64)
    content = models.BinaryField()
    created_at = models.DateTimeField(default=timezone.now, null=True)

    class Meta:
        ordering = ["id"]
        constraints = [
            models.UniqueConstraint(fields=["report", "sha256"], name="reports_unique_evidence"),
        ]


class ReviewEvent(OrganisationOwned):
    class Action(models.TextChoices):
        CREATE = "create", "Created report"
        WITHDRAW = "withdraw", "Withdrew report"
        ASSIGN = "assign", "Assigned reviewer"
        START = "start", "Started review"
        REQUEST_CLARIFICATION = "request_clarification", "Requested clarification"
        RESPOND = "respond", "Responded to clarification"
        MESSAGE = "message", "Sent message"
        CLOSE = "close", "Closed review"
        CORRECT_CATEGORY = "correct_category", "Corrected triage category"
        DECIDE_MATCH = "decide_match", "Reviewed possible match"

    report = models.ForeignKey(Report, related_name="review_events", on_delete=models.CASCADE)
    actor = models.ForeignKey(settings.AUTH_USER_MODEL, null=True, on_delete=models.PROTECT)
    created_at = models.DateTimeField(auto_now_add=True)
    version = models.PositiveIntegerField()
    action = models.CharField(max_length=24, choices=Action.choices)
    change = models.JSONField()

    class Meta:
        ordering = ["version"]
        constraints = [
            models.UniqueConstraint(fields=["report", "version"], name="reports_unique_review_version"),
        ]


class Triage(OrganisationOwned):
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


class TriageMatch(OrganisationOwned):
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


class ReportIdempotency(OrganisationOwned):
    actor = models.ForeignKey(settings.AUTH_USER_MODEL, null=True, on_delete=models.PROTECT)
    secret_scope = models.CharField(max_length=64, blank=True, default="")
    operation = models.CharField(max_length=24)
    key = models.UUIDField()
    digest = models.CharField(max_length=64)
    status = models.PositiveSmallIntegerField()
    body = models.JSONField()
    report = models.ForeignKey(Report, on_delete=models.CASCADE)
    created_at = models.DateTimeField(auto_now_add=True, db_index=True)

    class Meta:
        constraints = [
            models.UniqueConstraint(
                fields=["organisation", "actor", "operation", "key"], name="reports_unique_request_key"
            ),
            models.UniqueConstraint(
                fields=["organisation", "secret_scope", "operation", "key"],
                condition=models.Q(actor__isnull=True), name="reports_unique_citizen_key",
            ),
        ]


class OcrRead(OrganisationOwned):
    """A result-sheet photo read before its report exists. Held for 24 hours."""

    id = models.UUIDField(primary_key=True, default=uuid.uuid4, editable=False)
    observer = models.ForeignKey(settings.AUTH_USER_MODEL, on_delete=models.CASCADE)
    key = models.UUIDField()
    photo_sha256 = models.CharField(max_length=64)
    content_type = models.CharField(max_length=20)
    content = models.BinaryField()
    fields = models.JSONField()
    model_version = models.CharField(max_length=40)
    notice_key = models.CharField(max_length=40, null=True)
    expires_at = models.DateTimeField(db_index=True)
    used_by = models.ForeignKey(Report, null=True, on_delete=models.SET_NULL)

    class Meta:
        constraints = [models.UniqueConstraint(fields=["observer", "key"], name="reports_unique_ocr_key")]
