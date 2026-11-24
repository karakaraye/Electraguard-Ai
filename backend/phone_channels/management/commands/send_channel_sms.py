import json
from datetime import timedelta
from urllib.error import URLError
from urllib.parse import urlencode
from urllib.request import Request, urlopen

from django.conf import settings
from django.core.management.base import BaseCommand, CommandError
from django.db import transaction
from django.utils import timezone

from phone_channels.models import Callback, OutboundSMS, PhoneLanguage, SimulatorSend


@transaction.atomic
def send_job(job_id):
    job = OutboundSMS.objects.select_for_update(skip_locked=True).filter(pk=job_id).first()
    if job is None:
        return False
    form = {"username": "sandbox", "to": job.destination, "message": job.text}
    if job.short_code:
        form["from"] = job.short_code
    request = Request("https://api.sandbox.africastalking.com/version1/messaging",
                      data=urlencode(form).encode(), headers={
                          "apiKey": settings.CHANNEL_SMS_API_KEY, "Accept": "application/json",
                      })
    try:
        with urlopen(request, timeout=10) as response:
            recipients = json.load(response)["SMSMessageData"]["Recipients"]
        if not recipients or recipients[0]["statusCode"] not in {100, 101, 102}:
            raise ValueError("SMS was rejected")
    except (URLError, TimeoutError, ValueError, KeyError, TypeError):
        raise CommandError("The SMS provider did not acknowledge the queued message.") from None
    job.delete()
    return True


class Command(BaseCommand):
    help = "Deliver queued replies to the Africa's Talking sandbox."

    def add_arguments(self, parser):
        parser.add_argument("--limit", type=int, default=50)

    def handle(self, *args, **options):
        now = timezone.now()
        Callback.objects.filter(response="prompt", created_at__lt=now - timedelta(minutes=5)).delete()
        OutboundSMS.objects.filter(created_at__lt=now - timedelta(days=1)).delete()
        PhoneLanguage.objects.filter(expires_at__lte=now).delete()
        SimulatorSend.objects.filter(created_at__lt=now - timedelta(days=30)).delete()
        if not settings.CHANNEL_SMS_API_KEY:
            raise CommandError("Set CHANNEL_SMS_API_KEY before delivering SMS.")
        job_ids = list(OutboundSMS.objects.order_by("pk").values_list("pk", flat=True)[:options["limit"]])
        failures = 0
        for job_id in job_ids:
            try:
                send_job(job_id)
            except CommandError:
                failures += 1
        if failures:
            raise CommandError(f"The SMS provider did not acknowledge {failures} queued replies.")
