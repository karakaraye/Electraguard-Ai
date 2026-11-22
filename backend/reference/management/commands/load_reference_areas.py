import gzip
import json
import re
import unicodedata
from datetime import date
from pathlib import Path

from django.core.management.base import BaseCommand, CommandError
from django.db import transaction

from reference.documents import encode_document
from reference.models import AreaDataset, KnownPollingUnit

DEFAULT_DATA = Path(__file__).resolve().parents[4] / "data/reference/synthetic-areas.json"


def clean_text(value, limit):
    if not isinstance(value, str):
        raise ValueError("Codes and names must be strings.")
    value = unicodedata.normalize("NFC", value.strip())
    if not value or len(value) > limit or not value.isprintable():
        raise ValueError(f"Codes and names must be printable and at most {limit} characters.")
    return value


def node(raw, key, seen):
    code = clean_text(raw[key], 128)
    if "/" in code or code in seen:
        raise ValueError(f"Duplicate or invalid {key}: {code}")
    seen.add(code)
    return code, clean_text(raw["name"], 250)


def array(value):
    if not isinstance(value, list) or not value:
        raise ValueError("Hierarchy entries must be non-empty arrays.")
    return value


def prepare(raw):
    version = raw["dataset_version"]
    if not isinstance(version, str) or not re.fullmatch(r"\d{4}-\d{2}-\d{2}\.[1-9]\d{0,5}", version):
        raise ValueError("Use dataset_version YYYY-MM-DD.N.")
    day, revision = version.split(".")
    released_on = date.fromisoformat(day)
    source = raw["source"]
    if source not in AreaDataset.Source.values:
        raise ValueError("Source must be synthetic or official.")

    states, summaries, unit_codes = {}, [], set()
    lga_codes, ward_codes = set(), set()
    for raw_state in array(raw["states"]):
        state_code, state_name = node(raw_state, "state_code", set(states))
        lgas, count = [], 0
        for raw_lga in array(raw_state["lgas"]):
            lga_code, lga_name = node(raw_lga, "lga_code", lga_codes)
            wards = []
            for raw_ward in array(raw_lga["wards"]):
                ward_code, ward_name = node(raw_ward, "ward_code", ward_codes)
                units = []
                for unit in array(raw_ward["units"]):
                    if not isinstance(unit, list) or len(unit) != 2:
                        raise ValueError("A unit must be a [code, name] pair.")
                    code, name = node({"unit_code": unit[0], "name": unit[1]}, "unit_code", unit_codes)
                    units.append([code, name])
                count += len(units)
                wards.append({"ward_code": ward_code, "name": ward_name, "units": units})
            lgas.append({"lga_code": lga_code, "name": lga_name, "wards": wards})
        state = {"state_code": state_code, "name": state_name, "version": version, "lgas": lgas}
        states[state_code] = state
        summaries.append({
            "state_code": state_code, "name": state_name, "version": version,
            "lga_count": len(lgas), "unit_count": count,
            "bytes_gzip": len(gzip.compress(encode_document(state), mtime=0)),
        })

    return version, {
        "released_on": released_on, "revision": int(revision), "source": source,
        "index": {"dataset_version": version, "source": source, "states": summaries},
        "states": states,
    }, unit_codes


class Command(BaseCommand):
    help = "Import a versioned polling-unit reference JSON release."

    def add_arguments(self, parser):
        parser.add_argument("--file", type=Path, default=DEFAULT_DATA)

    def handle(self, *args, **options):
        try:
            raw = json.loads(options["file"].read_text(encoding="utf-8"))
            version, defaults, codes = prepare(raw)
        except (OSError, ValueError, TypeError, KeyError) as exc:
            raise CommandError(f"Invalid reference dataset: {exc}") from exc
        self.store(version, defaults, codes)
        self.stdout.write(f"Reference release {version}: {len(codes)} polling units.")

    @transaction.atomic
    def store(self, version, defaults, codes):
        release, created = AreaDataset.objects.get_or_create(version=version, defaults=defaults)
        if not created:
            if any(getattr(release, name) != value for name, value in defaults.items()):
                raise CommandError("This version already exists with different content. Use a new version.")
            return
        KnownPollingUnit.objects.bulk_create(
            [KnownPollingUnit(code=code) for code in sorted(codes)], batch_size=1000, ignore_conflicts=True,
        )
