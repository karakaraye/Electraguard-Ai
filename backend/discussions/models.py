from uuid import uuid4

from django.conf import settings
from django.db import models

from accounts.models import ObserverCode, OrganisationOwned


class Discussion(OrganisationOwned):
    id = models.UUIDField(primary_key=True, default=uuid4, editable=False)
    title = models.CharField(max_length=120)
    topic = models.CharField(max_length=500)
    area = models.JSONField()
    closes_at = models.DateTimeField(db_index=True)
    closed = models.BooleanField(default=False)
    created_at = models.DateTimeField(auto_now_add=True)


class Membership(models.Model):
    discussion = models.ForeignKey(Discussion, on_delete=models.CASCADE, related_name="memberships")
    observer = models.ForeignKey(ObserverCode, on_delete=models.PROTECT)
    state = models.CharField(max_length=12, default="invited")
    read_through = models.PositiveBigIntegerField(default=0)

    class Meta:
        unique_together = [("discussion", "observer")]


class Post(models.Model):
    public_id = models.UUIDField(default=uuid4, unique=True, editable=False)
    discussion = models.ForeignKey(Discussion, on_delete=models.CASCADE, related_name="posts")
    author = models.ForeignKey(Membership, on_delete=models.PROTECT)
    body = models.CharField(max_length=1000)
    hidden_reason = models.CharField(max_length=32, blank=True)
    name_check = models.BooleanField(default=False)
    created_at = models.DateTimeField(auto_now_add=True)


class Flag(models.Model):
    post = models.ForeignKey(Post, on_delete=models.CASCADE, related_name="flags")
    member = models.ForeignKey(Membership, on_delete=models.CASCADE)
    reason = models.CharField(max_length=32)

    class Meta:
        unique_together = [("post", "member")]


class ModerationAction(models.Model):
    discussion = models.ForeignKey(Discussion, on_delete=models.CASCADE)
    actor = models.ForeignKey(settings.AUTH_USER_MODEL, null=True, on_delete=models.SET_NULL)
    action = models.CharField(max_length=24)
    details = models.JSONField(default=dict)
    created_at = models.DateTimeField(auto_now_add=True)


class RequestRecord(OrganisationOwned):
    actor = models.ForeignKey(settings.AUTH_USER_MODEL, on_delete=models.CASCADE)
    key = models.UUIDField()
    operation = models.CharField(max_length=24)
    digest = models.CharField(max_length=64)
    body = models.JSONField()
    status = models.PositiveSmallIntegerField()
    created_at = models.DateTimeField(auto_now_add=True)

    class Meta:
        unique_together = [("organisation", "actor", "operation", "key")]
