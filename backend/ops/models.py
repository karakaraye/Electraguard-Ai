import uuid

from django.db import models

from accounts.models import OrganisationOwned


class LateMaterialsRun(OrganisationOwned):
    id = models.UUIDField(primary_key=True, default=uuid.uuid4, editable=False)
    model_version = models.CharField(max_length=128)
    generated_at = models.DateTimeField()
    data_source = models.CharField(max_length=128)
    metrics = models.JSONField(default=dict)

    class Meta:
        indexes = [models.Index(fields=["organisation", "-generated_at"])]


class LateMaterialsRisk(models.Model):
    class Risk(models.TextChoices):
        HIGH = "high", "High"
        MEDIUM = "medium", "Medium"
        LOW = "low", "Low"

    run = models.ForeignKey(LateMaterialsRun, on_delete=models.CASCADE, related_name="risks")
    rank = models.PositiveIntegerField()
    state_code = models.CharField(max_length=40)
    lga_code = models.CharField(max_length=40)
    lga_name = models.CharField(max_length=160)
    ward_code = models.CharField(max_length=40)
    ward_name = models.CharField(max_length=160)
    polling_unit_code = models.CharField(max_length=40)
    predicted_transit_hours = models.FloatField()
    risk = models.CharField(max_length=6, choices=Risk.choices)
    factors = models.JSONField(default=list)

    class Meta:
        ordering = ["rank"]
        constraints = [
            models.UniqueConstraint(fields=["run", "rank"], name="late_materials_run_rank"),
            models.UniqueConstraint(
                fields=["run", "polling_unit_code"], name="late_materials_run_unit",
            ),
        ]


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
