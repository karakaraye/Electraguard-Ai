from django.db import models

from accounts.models import OrganisationOwned


class MaterialsRisk(OrganisationOwned):
    polling_unit_code = models.CharField(max_length=128)
    state_code = models.CharField(max_length=32)
    generated_at = models.DateTimeField()
    prediction = models.JSONField()
    metrics = models.JSONField()

    class Meta:
        constraints = [models.UniqueConstraint(
            fields=["organisation", "polling_unit_code"], name="intelligence_unique_materials_unit",
        )]


class ClusterSuggestion(OrganisationOwned):
    state_code = models.CharField(max_length=32)
    lga_code = models.CharField(max_length=32)
    category = models.CharField(max_length=32)
    window_end = models.DateTimeField()
    count = models.PositiveIntegerField()
    baseline = models.FloatField()

    class Meta:
        constraints = [models.UniqueConstraint(
            fields=["organisation", "lga_code", "category", "window_end"],
            name="intelligence_unique_cluster_window",
        )]
