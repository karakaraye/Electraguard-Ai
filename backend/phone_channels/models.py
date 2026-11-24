from django.db import models

from accounts.models import OrganisationOwned
from reports.models import Report


class Callback(OrganisationOwned):
    key = models.CharField(max_length=64)
    response = models.TextField(blank=True)
    created_at = models.DateTimeField(auto_now_add=True)

    class Meta:
        constraints = [models.UniqueConstraint(fields=["organisation", "key"], name="phone_unique_callback")]


class PhoneReporter(OrganisationOwned):
    report = models.OneToOneField(Report, on_delete=models.CASCADE)
    phone_hash = models.CharField(max_length=64)


class PhoneLanguage(OrganisationOwned):
    phone_hash = models.CharField(max_length=64)
    language = models.CharField(max_length=3)
    expires_at = models.DateTimeField()

    class Meta:
        constraints = [models.UniqueConstraint(fields=["organisation", "phone_hash"], name="phone_unique_language")]


class OutboundSMS(OrganisationOwned):
    destination = models.CharField(max_length=16)
    short_code = models.CharField(max_length=32, blank=True)
    text = models.CharField(max_length=500)
    created_at = models.DateTimeField(auto_now_add=True)


class Simulator(OrganisationOwned):
    browser = models.CharField(max_length=64)
    number = models.CharField(max_length=16, unique=True)
    messages = models.JSONField(default=list)
    calls = models.JSONField(default=dict)

    class Meta:
        constraints = [models.UniqueConstraint(fields=["organisation", "browser"], name="phone_unique_browser")]


class SimulatorSend(OrganisationOwned):
    simulator = models.ForeignKey(Simulator, on_delete=models.CASCADE)
    key = models.UUIDField()
    digest = models.CharField(max_length=64)
    body = models.JSONField()
    created_at = models.DateTimeField(auto_now_add=True)

    class Meta:
        constraints = [models.UniqueConstraint(fields=["simulator", "key"], name="phone_unique_sim_send")]
