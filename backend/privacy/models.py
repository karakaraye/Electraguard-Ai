from django.conf import settings
from django.db import models

from accounts.models import Organisation, OrganisationOwned
from reports.models import Report


class OrganisationSecret(models.Model):
    organisation = models.OneToOneField(Organisation, on_delete=models.CASCADE, related_name="redaction_secret")
    secret = models.BinaryField(max_length=32)
    created_at = models.DateTimeField(auto_now_add=True)


class OriginalAccess(OrganisationOwned):
    report = models.ForeignKey(Report, related_name="original_accesses", on_delete=models.CASCADE)
    actor = models.ForeignKey(settings.AUTH_USER_MODEL, on_delete=models.PROTECT)
    reason = models.CharField(max_length=500)
    created_at = models.DateTimeField(auto_now_add=True)

    class Meta:
        indexes = [models.Index(fields=["organisation", "report", "-created_at"])]
