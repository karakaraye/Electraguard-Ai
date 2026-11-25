import uuid

from django.conf import settings
from django.db import models

from accounts.models import OrganisationOwned


class Question(models.Model):
    id = models.CharField(max_length=64, primary_key=True)
    category = models.CharField(max_length=32)
    text_by_lang = models.JSONField(default=dict)
    answers = models.JSONField(default=list)

    def __str__(self):
        return f"{self.id} ({self.category})"


class Notice(OrganisationOwned):
    class ScopeKind(models.TextChoices):
        WARD = "ward", "Ward"
        LGA = "lga", "LGA"

    class NoticeType(models.TextChoices):
        SAFETY = "safety", "Safety"
        LOGISTICS = "logistics", "Logistics"
        INSTRUCTION = "instruction", "Instruction"

    class Status(models.TextChoices):
        PENDING_APPROVAL = "pending_approval", "Pending Approval"
        SENT = "sent", "Sent"
        EXPIRED = "expired", "Expired"
        WITHDRAWN = "withdrawn", "Withdrawn"

    id = models.UUIDField(primary_key=True, default=uuid.uuid4, editable=False)
    scope_kind = models.CharField(max_length=16, choices=ScopeKind.choices)
    scope_code = models.CharField(max_length=64)
    type = models.CharField(max_length=32, choices=NoticeType.choices)
    text = models.CharField(max_length=280)
    question = models.ForeignKey(Question, null=True, blank=True, on_delete=models.SET_NULL, related_name="notices")
    created_by = models.ForeignKey(settings.AUTH_USER_MODEL, on_delete=models.PROTECT, related_name="+")
    approved_by = models.ForeignKey(settings.AUTH_USER_MODEL, null=True, blank=True, on_delete=models.PROTECT, related_name="+")
    status = models.CharField(max_length=20, choices=Status.choices, default=Status.SENT)
    expires_at = models.DateTimeField()
    created_at = models.DateTimeField(auto_now_add=True)

    class Meta:
        indexes = [
            models.Index(fields=["organisation", "status", "expires_at"]),
            models.Index(fields=["organisation", "scope_kind", "scope_code"]),
        ]


class NoticeAnswer(OrganisationOwned):
    class AnswerChoice(models.TextChoices):
        YES = "yes", "Yes"
        NO = "no", "No"
        NOT_SEEN = "not_seen", "Not seen"

    id = models.UUIDField(primary_key=True, default=uuid.uuid4, editable=False)
    notice = models.ForeignKey(Notice, on_delete=models.CASCADE, related_name="answers")
    observer_code = models.CharField(max_length=64)
    answer = models.CharField(max_length=16, choices=AnswerChoice.choices)
    answered_at_device = models.DateTimeField()
    received_at = models.DateTimeField(auto_now_add=True)
    version = models.PositiveIntegerField(default=1)

    class Meta:
        constraints = [
            models.UniqueConstraint(fields=["notice", "observer_code"], name="unique_notice_answer"),
        ]
        indexes = [
            models.Index(fields=["notice", "answer"]),
            models.Index(fields=["organisation", "observer_code"]),
        ]


class NoticeRequest(OrganisationOwned):
    actor = models.ForeignKey(settings.AUTH_USER_MODEL, null=True, blank=True, on_delete=models.CASCADE)
    key = models.UUIDField()
    digest = models.CharField(max_length=64)
    status = models.PositiveSmallIntegerField(default=200)
    body = models.JSONField()
    created_at = models.DateTimeField(auto_now_add=True)

    class Meta:
        constraints = [
            models.UniqueConstraint(fields=["organisation", "key"], name="unique_notice_request"),
        ]
