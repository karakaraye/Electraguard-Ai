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
    class Detector(models.TextChoices):
        THRESHOLD = "threshold", "Threshold"
        SPIKE = "spike", "Spike"
        DRIFT = "drift", "Drift"

    class BaselineKind(models.TextChoices):
        SAME_AREA_EARLIER = "same_area_earlier", "Same area earlier today"
        PEER_AREAS = "peer_areas", "Peer areas"
        THRESHOLD = "threshold", "Threshold fallback"

    id = models.UUIDField(primary_key=True, default=uuid.uuid4, editable=False)
    category = models.CharField(max_length=40)
    area = models.JSONField()
    lga_code = models.CharField(max_length=128)
    report_ids = models.JSONField()
    baseline = models.FloatField(default=0.0)
    detector = models.CharField(max_length=20, default=Detector.THRESHOLD, choices=Detector.choices)
    observed = models.PositiveIntegerField(default=0)
    expected = models.FloatField(default=0.0)
    p_value = models.FloatField(null=True, blank=True)
    q_value = models.FloatField(null=True, blank=True)
    window_minutes = models.PositiveSmallIntegerField(default=60)
    baseline_kind = models.CharField(max_length=32, default=BaselineKind.SAME_AREA_EARLIER, choices=BaselineKind.choices)
    explanation = models.TextField(blank=True, default="")
    window_start = models.DateTimeField()
    window_end = models.DateTimeField()
    notified_at = models.DateTimeField(null=True, blank=True)
    reviewed_at = models.DateTimeField(null=True)
    reviewed_by = models.CharField(max_length=254, blank=True)

    class Meta:
        indexes = [models.Index(fields=["organisation", "-window_end"])]
