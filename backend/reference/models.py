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


def resolve_place(unit_code, ward_code=None):
    """Resolve a unit/ward pair from one release, preferring the latest match."""
    for states in AreaDataset.objects.values_list("states", flat=True).iterator(chunk_size=1):
        for state in states.values():
            for lga in state["lgas"]:
                for ward in lga["wards"]:
                    if ward_code is not None and ward["ward_code"] != ward_code:
                        continue
                    name = dict(ward["units"]).get(unit_code) if unit_code else None
                    if unit_code is not None and name is None:
                        continue
                    return {
                        "state_code": state["state_code"], "state_name": state["name"],
                        "lga_code": lga["lga_code"], "lga_name": lga["name"],
                        "ward_code": ward["ward_code"], "ward_name": ward["name"],
                        "polling_unit_code": unit_code, "polling_unit_name": name,
                    }
    return None


def resolve_lga(lga_code):
    """Resolve an LGA (and its state) from the newest release that lists it."""
    if not lga_code:
        return None
    for states in AreaDataset.objects.values_list("states", flat=True).iterator(chunk_size=1):
        for state in states.values():
            for lga in state["lgas"]:
                if lga["lga_code"] == lga_code:
                    return {
                        "state_code": state["state_code"], "state_name": state["name"],
                        "lga_code": lga["lga_code"], "lga_name": lga["name"],
                    }
    return None


def area_name(code):
    """Official name for a state, LGA or ward code, or the code itself when it is not in any release."""
    if not code:
        return code
    for states in AreaDataset.objects.values_list("states", flat=True).iterator(chunk_size=1):
        for state in states.values():
            if state["state_code"] == code:
                return state["name"]
            for lga in state["lgas"]:
                if lga["lga_code"] == code:
                    return lga["name"]
                for ward in lga["wards"]:
                    if ward["ward_code"] == code:
                        return ward["name"]
    return code
