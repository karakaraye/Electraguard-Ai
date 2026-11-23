import uuid

from django.db import models

from accounts.models import OrganisationOwned


class ClusterSettings(OrganisationOwned):
    window_minutes = models.PositiveSmallIntegerField(default=60)
    min_reports = models.PositiveSmallIntegerField(default=5)
    categories = models.JSONField(default=list)
    version = models.PositiveIntegerField(default=0)

    class Meta:
        constraints = [models.UniqueConstraint(fields=["organisation"], name="one_cluster_settings_per_org")]


class ClusterWarning(OrganisationOwned):
    id = models.UUIDField(primary_key=True, default=uuid.uuid4, editable=False)
    category = models.CharField(max_length=40)
    area = models.JSONField()
    lga_code = models.CharField(max_length=128)
    report_ids = models.JSONField()
    baseline = models.FloatField()
    window_start = models.DateTimeField()
    window_end = models.DateTimeField()
    reviewed_at = models.DateTimeField(null=True)
    reviewed_by = models.CharField(max_length=254, blank=True)

    class Meta:
        indexes = [models.Index(fields=["organisation", "-window_end"])]
