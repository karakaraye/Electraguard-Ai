import uuid
from django.db import models

from accounts.models import OrganisationOwned
from reports.models import Report


class ReviewClock(OrganisationOwned):
    class State(models.TextChoices):
        ON_TIME = "on_time", "On time"
        DUE_SOON = "due_soon", "Due soon"
        OVERDUE = "overdue", "Overdue"
        STOPPED = "stopped", "Stopped"

    id = models.UUIDField(primary_key=True, default=uuid.uuid4, editable=False)
    report = models.OneToOneField(Report, on_delete=models.CASCADE, related_name="clock")
    urgency = models.CharField(max_length=20, default="normal")
    target_minutes = models.PositiveIntegerField(default=240)
    started_at = models.DateTimeField()
    due_at = models.DateTimeField()
    state = models.CharField(max_length=20, default=State.ON_TIME, choices=State.choices)
    paused = models.BooleanField(default=False)
    paused_at = models.DateTimeField(null=True, blank=True)
    paused_seconds = models.PositiveIntegerField(default=0)
    stopped_at = models.DateTimeField(null=True, blank=True)
    notified_at = models.DateTimeField(null=True, blank=True)

    class Meta:
        indexes = [
            models.Index(fields=["organisation", "state"]),
            models.Index(fields=["organisation", "due_at"]),
        ]

    def __str__(self):
        return f"ReviewClock({self.report_id}, state={self.state}, target={self.target_minutes}m)"
