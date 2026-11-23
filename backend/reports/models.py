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
    observer = models.ForeignKey(settings.AUTH_USER_MODEL, on_delete=models.PROTECT, null=True)
    receipt_secret_digest = models.CharField(max_length=64, blank=True, editable=False)
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
    observer_code = models.CharField(max_length=10, blank=True)
    incident_details = models.JSONField(default=dict)
    review_suggestions = models.JSONField(default=dict)
    redacted_description = models.TextField(null=True)
    redactions = models.JSONField(default=list)
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
        REMOVE_MEDIA = "remove_media", "Removed evidence"
        ASSIGN = "assign", "Assigned reviewer"
        START = "start", "Started review"
        REQUEST_CLARIFICATION = "request_clarification", "Requested clarification"
        RESPOND = "respond", "Responded to clarification"
        CLOSE = "close", "Closed review"
        ACCEPT_SUGGESTION = "accept_suggestion", "Accepted suggestion"
        CORRECT_SUGGESTION = "correct_suggestion", "Corrected suggestion"
        REDACT = "redact", "Redacted report text"
        CORRECT_CATEGORY = "correct_category", "Corrected triage category"
        DECIDE_MATCH = "decide_match", "Reviewed possible match"

    report = models.ForeignKey(Report, related_name="review_events", on_delete=models.CASCADE)
    actor = models.ForeignKey(settings.AUTH_USER_MODEL, on_delete=models.PROTECT, null=True)
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
    actor = models.ForeignKey(settings.AUTH_USER_MODEL, on_delete=models.PROTECT, null=True)
    citizen_digest = models.CharField(max_length=64, blank=True)
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
                fields=["organisation", "citizen_digest", "operation", "key"],
                condition=models.Q(actor__isnull=True), name="reports_unique_citizen_request",
            ),
        ]


class MediaItem(OrganisationOwned):
    class Kind(models.TextChoices):
        PHOTO = "photo", "Photo"
        VIDEO = "video", "Video"
        AUDIO = "audio", "Audio"

    class Status(models.TextChoices):
        PROCESSING = "processing", "Processing"
        READY = "ready", "Ready"
        FAILED = "failed", "Failed"

    id = models.UUIDField(primary_key=True, default=uuid.uuid4, editable=False)
    report = models.ForeignKey(Report, related_name="media_items", on_delete=models.CASCADE)
    purpose = models.CharField(max_length=12)
    kind = models.CharField(max_length=8, choices=Kind.choices, default=Kind.PHOTO)
    status = models.CharField(max_length=12, choices=Status.choices, default=Status.READY)
    # The verified upload's declared type, used only while the original is kept for processing.
    content_type = models.CharField(max_length=32, blank=True)
    size_bytes = models.PositiveIntegerField()
    duration_ms = models.PositiveIntegerField(null=True)
    original_sha256 = models.CharField(max_length=64)
    # Empty until processing has produced the cleaned file.
    sha256 = models.CharField(max_length=64)
    blur_requested = models.BooleanField(default=False)
    # The stored file has had automatic face blur applied and no unblurred copy is kept.
    blurred = models.BooleanField(default=False)
    # A separate face-blurred copy exists for reviewers; the stored file is unblurred.
    review_copy = models.BooleanField(default=False)
    exif_removed = models.BooleanField(default=True)
    transcript = models.TextField(null=True)
    transcript_status = models.CharField(max_length=24, blank=True)
    transcript_language = models.CharField(max_length=8, blank=True)
    transcript_method = models.CharField(max_length=64, blank=True)
    attempts = models.PositiveSmallIntegerField(default=0)
    claimed_at = models.DateTimeField(null=True)
    failure_code = models.CharField(max_length=32, blank=True)
    created_at = models.DateTimeField(auto_now_add=True)

    class Meta:
        constraints = [
            models.UniqueConstraint(fields=["report", "original_sha256"], name="report_unique_media_hash")
        ]
        indexes = [models.Index(fields=["status", "created_at"], name="media_processing_queue")]


class UploadSession(OrganisationOwned):
    class Status(models.TextChoices):
        OPEN = "open", "Open"
        EXPIRED = "expired", "Expired"
        COMPLETED = "completed", "Completed"
        CANCELLED = "cancelled", "Cancelled"

    id = models.UUIDField(primary_key=True, default=uuid.uuid4, editable=False)
    report = models.ForeignKey(Report, related_name="media_uploads", on_delete=models.CASCADE)
    client_attachment_id = models.CharField(max_length=64)
    kind = models.CharField(max_length=8, default="photo")
    duration_ms = models.PositiveIntegerField(null=True)
    content_type = models.CharField(max_length=32)
    purpose = models.CharField(max_length=12)
    size_bytes = models.PositiveIntegerField()
    sha256 = models.CharField(max_length=64)
    blur_faces = models.BooleanField(default=False)
    received_bytes = models.PositiveIntegerField(default=0)
    status = models.CharField(max_length=12, choices=Status.choices, default=Status.OPEN)
    staging_id = models.UUIDField(default=uuid.uuid4)
    expires_at = models.DateTimeField(db_index=True)
    created_at = models.DateTimeField(auto_now_add=True)
    media = models.ForeignKey(MediaItem, null=True, on_delete=models.SET_NULL)

    class Meta:
        ordering = ["-created_at"]
        constraints = [
            models.UniqueConstraint(
                fields=["report", "client_attachment_id"], condition=models.Q(status="open"),
                name="report_unique_open_attachment",
            )
        ]


class MediaBlobDeletion(OrganisationOwned):
    path = models.CharField(max_length=150, unique=True)
    created_at = models.DateTimeField(auto_now_add=True)


class MediaAccess(OrganisationOwned):
    media_id = models.UUIDField()
    report = models.ForeignKey(Report, on_delete=models.CASCADE)
    actor = models.ForeignKey(settings.AUTH_USER_MODEL, on_delete=models.PROTECT)
    action = models.CharField(max_length=20)
    reason = models.CharField(max_length=500, blank=True)
    created_at = models.DateTimeField(auto_now_add=True)

    class Meta:
        indexes = [models.Index(fields=["actor", "media_id", "action", "created_at"])]


class CitizenReply(OrganisationOwned):
    id = models.UUIDField(primary_key=True, default=uuid.uuid4, editable=False)
    report = models.ForeignKey(Report, on_delete=models.CASCADE)
    event = models.OneToOneField(ReviewEvent, related_name="citizen_reply", on_delete=models.CASCADE)
    question_id = models.UUIDField()
    body = models.CharField(max_length=2000)
    created_at = models.DateTimeField(auto_now_add=True)


class AssignmentBatch(OrganisationOwned):
    actor = models.ForeignKey(settings.AUTH_USER_MODEL, on_delete=models.PROTECT)
    key = models.UUIDField()
    digest = models.CharField(max_length=64)
    results = models.JSONField(default=list)
    created_at = models.DateTimeField(auto_now_add=True)

    class Meta:
        constraints = [
            models.UniqueConstraint(fields=["organisation", "actor", "key"], name="reports_unique_assignment_batch"),
        ]
