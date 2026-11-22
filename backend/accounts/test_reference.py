import gzip
import json
from io import StringIO
from pathlib import Path
from tempfile import TemporaryDirectory

from django.core.management import call_command
from django.core.management.base import CommandError
from django.test import TestCase

from reference.management.commands.load_reference_areas import DEFAULT_DATA
from reference.models import AreaDataset, polling_unit_exists

from .models import INITIAL_ORGANISATION, Organisation, User

AREAS = "/api/v1/reference/areas"
SETTINGS = "/api/v1/reference/settings"
CACHE = "public, max-age=86400, stale-while-revalidate=604800"


class ReferenceTests(TestCase):
    @classmethod
    def setUpTestData(cls):
        call_command("load_reference_areas", stdout=StringIO())
        cls.observer = User.objects.create_user("a@reference.example", role=User.Role.OBSERVER)
        organisation = Organisation.objects.get(pk=INITIAL_ORGANISATION)
        organisation.coverage_state_codes = ["SYN-KN"]
        organisation.coverage_lga_codes = ["SYN-KN-01"]
        organisation.save()

    def test_index_and_state_cache_contract(self):
        index = self.client.get(AREAS)
        self.assertEqual(index.status_code, 200)
        self.assertEqual(index.json()["source"], "synthetic")
        first = index.json()["states"][0]
        self.assertEqual((first["lga_count"], first["unit_count"]), (2, 8))
        state_path = f"{AREAS}/{first['state_code']}"
        state = self.client.get(state_path)
        self.assertEqual(state.status_code, 200)
        self.assertEqual(state.json()["version"], index.json()["dataset_version"])
        self.assertEqual(state.json()["lgas"][0]["wards"][0]["units"][0][0], "SYN-KN-01-01-001")
        self.assertEqual(first["bytes_gzip"], len(gzip.compress(state.content, mtime=0)))
        self.assertNotEqual(index["ETag"], state["ETag"])
        for path, response in ((AREAS, index), (state_path, state)):
            self.assertEqual(response["Cache-Control"], CACHE)
            cached = self.client.get(path, HTTP_IF_NONE_MATCH='W/' + response["ETag"])
            self.assertEqual((cached.status_code, cached.content), (304, b""))
            self.assertEqual((cached["ETag"], cached["Cache-Control"]), (response["ETag"], CACHE))
        self.client.force_login(self.observer)
        cached = self.client.get(AREAS)
        self.assertNotIn("cookie", cached.get("Vary", "").lower())
        self.assertFalse(cached.cookies)
        unknown = self.client.get(f"{AREAS}/unknown")
        self.assertEqual((unknown.status_code, unknown.json()["error"]["code"]), (404, "not_found"))
        self.assertIn("no-store", unknown["Cache-Control"])

    def test_historical_codes_version_selection_and_loader_idempotency(self):
        raw = json.loads(DEFAULT_DATA.read_text())
        removed = raw["states"][0]["lgas"][0]["wards"][0]["units"].pop()[0]
        raw["dataset_version"] = "2026-11-22.10"
        raw["states"][1]["state_code"] = "01"
        with TemporaryDirectory() as folder:
            path = Path(folder) / "new-release.json"
            path.write_text(json.dumps(raw), encoding="utf-8")
            call_command("load_reference_areas", file=path, stdout=StringIO())
            call_command("load_reference_areas", file=path, stdout=StringIO())
            raw["states"][1]["name"] = "Changed without a version"
            path.write_text(json.dumps(raw), encoding="utf-8")
            with self.assertRaisesMessage(CommandError, "already exists with different content"):
                call_command("load_reference_areas", file=path, stdout=StringIO())

        call_command("load_reference_areas", stdout=StringIO())
        self.assertEqual(AreaDataset.objects.count(), 2)
        self.assertEqual(self.client.get(AREAS).json()["dataset_version"], "2026-11-22.10")
        self.assertEqual(self.client.get(f"{AREAS}/01").json()["state_code"], "01")
        self.assertTrue(polling_unit_exists(removed))
        self.assertFalse(polling_unit_exists("UNKNOWN-UNIT"))

    def test_settings_require_observer_and_use_actor_organisation(self):
        response = self.client.get(SETTINGS)
        self.assertEqual((response.status_code, response.json()["error"]["code"]), (401, "not_authenticated"))
        second = Organisation.objects.create(
            name="Fictional second organisation", coverage_state_codes=["SYN-LA"],
            party_labels=["A", "B", "C", "D", "E"],
        )
        other = User.objects.create_user(
            "b@reference.example", role=User.Role.OBSERVER, organisation=second,
        )
        for observer, states, lgas in (
            (self.observer, ["SYN-KN"], ["SYN-KN-01"]), (other, ["SYN-LA"], []),
        ):
            self.client.force_login(observer)
            response = self.client.get(SETTINGS, {"organisation_id": str(second.pk)})
            self.assertEqual(response.json(), {
                "coverage_area": {"state_codes": states, "lga_codes": lgas},
                "party_labels": ["A", "B", "C", "D", "E"],
            })
            self.assertIn("no-store", response["Cache-Control"])
        reviewer = User.objects.create_user("staff@reference.example", role=User.Role.REVIEWER)
        self.client.force_login(reviewer)
        self.assertEqual(self.client.get(SETTINGS).status_code, 403)
