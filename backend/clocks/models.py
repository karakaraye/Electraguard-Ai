import uuid
from django.db import models

from accounts.models import OrganisationOwned
from reports.models import Report


class ReviewClock(OrganisationOwned):
    class Kind(models.TextChoices):
        FIRST_ACTION = "first_action", "First reviewer action"
        QUESTION_REPLY = "question_reply", "Question reply"

    class State(models.TextChoices):
        ON_TIME = "on_time", "On time"
        DUE_SOON = "due_soon", "Due soon"
        OVERDUE = "overdue", "Overdue"
        STOPPED = "stopped", "Stopped"

    id = models.UUIDField(primary_key=True, default=uuid.uuid4, editable=False)
    report = models.ForeignKey(Report, on_delete=models.CASCADE, related_name="clocks")
    kind = models.CharField(max_length=20, default=Kind.FIRST_ACTION, choices=Kind.choices)
    urgency = models.CharField(max_length=20, default="normal")
    target_minutes = models.PositiveIntegerField(default=240)
    started_at = models.DateTimeField()
    due_at = models.DateTimeField()
    state = models.CharField(max_length=20, default=State.ON_TIME, choices=State.choices)
    # The paused, paused_at, and paused_seconds fields are reserved for future intake-pause / hold features.
    # Currently, review clocks run continuously from receipt to action or reply without pausing,
    # so paused remains False and paused_seconds is 0.
    paused = models.BooleanField(default=False)
    paused_at = models.DateTimeField(null=True, blank=True)
    paused_seconds = models.PositiveIntegerField(default=0)
    stopped_at = models.DateTimeField(null=True, blank=True)
    notified_at = models.DateTimeField(null=True, blank=True)

    class Meta:
        indexes = [
            models.Index(fields=["organisation", "state"]),
            models.Index(fields=["organisation", "due_at"]),
            models.Index(fields=["report", "stopped_at"]),
        ]
        constraints = [
            models.UniqueConstraint(
                fields=["report", "kind"],
                condition=models.Q(stopped_at__isnull=True),
                name="unique_open_clock_per_kind",
            ),
        ]

    def __str__(self):
        return f"ReviewClock({self.report_id}, kind={self.kind}, state={self.state}, target={self.target_minutes}m)"
