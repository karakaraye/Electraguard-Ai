from django.db import models


class AreaDataset(models.Model):
    class Source(models.TextChoices):
        SYNTHETIC = "synthetic", "Synthetic"
        OFFICIAL = "official", "Official"

    version = models.CharField(max_length=24, primary_key=True)
    released_on = models.DateField()
    revision = models.PositiveIntegerField()
    source = models.CharField(max_length=16, choices=Source.choices)
    index = models.JSONField()
    states = models.JSONField()

    class Meta:
        ordering = ["-released_on", "-revision"]


class KnownPollingUnit(models.Model):
    code = models.CharField(max_length=128, primary_key=True)


def polling_unit_exists(code):
    """Resolve a unit code from any imported reference release."""
    return KnownPollingUnit.objects.filter(pk=code).exists()
