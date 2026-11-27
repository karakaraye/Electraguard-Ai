import json
from io import StringIO
from pathlib import Path
from tempfile import TemporaryDirectory

from django.core.management import call_command
from django.test import TestCase, override_settings

from accounts.models import ObserverCode, User
from publicdata.models import Snapshot
from reports.models import Report
from reference.models import AreaDataset


@override_settings(DEBUG=True)
class SeedDemoDayTests(TestCase):
    def test_builds_the_day_and_is_safe_to_repeat(self):
        data = Path(__file__).resolve().parents[2] / "data/reference/official-synthetic-areas.json"
        call_command("load_reference_areas", file=data, stdout=StringIO())
        self.assertTrue(AreaDataset.objects.exists())
        with TemporaryDirectory() as folder, override_settings(PRIVATE_MEDIA_ROOT=Path(folder) / "media"):
            signins = Path(folder) / "signins.json"
            call_command("seed_demo_day", signins_file=signins, quiet=True, stdout=StringIO())
            first = (Report.objects.count(), User.objects.count(), ObserverCode.objects.count())
            call_command("seed_demo_day", signins_file=signins, quiet=True, stdout=StringIO())
            self.assertEqual(first, (Report.objects.count(), User.objects.count(), ObserverCode.objects.count()))
            self.assertGreaterEqual(first[0], 40)
            self.assertEqual(Snapshot.objects.filter(status="published").count(), 1)
            self.assertEqual(Report.objects.filter(status="closed").count() > 30, True)
            data = json.loads(signins.read_text())
            self.assertEqual(len(data["staff"]), 6)
            self.assertEqual(len(data["observers"]), 12)
            roles = set(User.objects.exclude(role="observer").values_list("role", flat=True))
            self.assertEqual(roles, {"reviewer", "coordinator", "moderator", "org_admin"})
