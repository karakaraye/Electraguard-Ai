"""
Convert the hackathon's polling_units_synthetic.csv into the reference JSON
release that `manage.py load_reference_areas` imports.

  python scripts/convert-polling-units-csv.py path/to/polling_units_synthetic.csv \
      data/reference/official-synthetic-areas.json --version 2026-11-23.1

Codes:
- state: the state's ISO 3166-2:NG suffix (Kano -> KN);
- LGA:   <state>-<LGA number>        ("Kano LGA-2"  -> KN-02);
- ward:  <LGA>-<ward number>         ("Kano L2-W3"  -> KN-02-03);
- unit:  the dataset's own pu_id     (SIM-00042), so reports join the dataset.
Names are kept as written in the file; a unit is named by its order in the ward
and its settlement type ("Polling unit 2, rural"), since the file has no unit names.
"""

import argparse
import csv
import json
import re
import sys
from collections import OrderedDict
from pathlib import Path

STATE_CODES = {
    "Abia": "AB", "Adamawa": "AD", "Akwa Ibom": "AK", "Anambra": "AN", "Bauchi": "BA", "Bayelsa": "BY",
    "Benue": "BE", "Borno": "BO", "Cross River": "CR", "Delta": "DE", "Ebonyi": "EB", "Edo": "ED",
    "Ekiti": "EK", "Enugu": "EN", "FCT": "FC", "Federal Capital Territory": "FC", "Gombe": "GO", "Imo": "IM",
    "Jigawa": "JI", "Kaduna": "KD", "Kano": "KN", "Katsina": "KT", "Kebbi": "KE", "Kogi": "KO", "Kwara": "KW",
    "Lagos": "LA", "Nasarawa": "NA", "Niger": "NI", "Ogun": "OG", "Ondo": "ON", "Osun": "OS", "Oyo": "OY",
    "Plateau": "PL", "Rivers": "RI", "Sokoto": "SO", "Taraba": "TA", "Yobe": "YO", "Zamfara": "ZA",
}
REQUIRED = {"pu_id", "state", "lga", "ward", "settlement"}


def number(pattern, text, what):
    match = re.fullmatch(pattern, text.strip())
    if not match:
        raise ValueError(f"Unexpected {what} name: {text!r}")
    return int(match.group(1))


def convert(rows, version):
    states = OrderedDict()
    seen = set()
    for line, row in enumerate(rows, start=2):
        state_name, lga_name, ward_name = row["state"].strip(), row["lga"].strip(), row["ward"].strip()
        unit_code, settlement = row["pu_id"].strip(), row["settlement"].strip().lower()
        if state_name not in STATE_CODES:
            raise ValueError(f"Line {line}: unknown state {state_name!r}")
        if not re.fullmatch(r"[A-Z]+-\d+", unit_code) or unit_code in seen:
            raise ValueError(f"Line {line}: missing, malformed or repeated pu_id {unit_code!r}")
        seen.add(unit_code)
        state_code = STATE_CODES[state_name]
        lga_number = number(rf"{re.escape(state_name)} LGA-(\d+)", lga_name, "LGA")
        ward_match = re.fullmatch(rf"{re.escape(state_name)} L(\d+)-W(\d+)", ward_name)
        if not ward_match or int(ward_match.group(1)) != lga_number:
            raise ValueError(f"Line {line}: ward {ward_name!r} does not belong to {lga_name!r}")
        lga_code = f"{state_code}-{lga_number:02d}"
        ward_code = f"{lga_code}-{int(ward_match.group(2)):02d}"
        state = states.setdefault(state_code, {"state_code": state_code, "name": state_name, "lgas": OrderedDict()})
        lga = state["lgas"].setdefault(lga_code, {"lga_code": lga_code, "name": lga_name, "wards": OrderedDict()})
        ward = lga["wards"].setdefault(ward_code, {"ward_code": ward_code, "name": ward_name, "units": []})
        ward["units"].append((unit_code, settlement))

    out_states = []
    for state in sorted(states.values(), key=lambda s: s["name"]):
        lgas = []
        for lga in sorted(state["lgas"].values(), key=lambda item: item["lga_code"]):
            wards = []
            for ward in sorted(lga["wards"].values(), key=lambda item: item["ward_code"]):
                units = [
                    [code, f"Polling unit {index}, {settlement}"]
                    for index, (code, settlement) in enumerate(sorted(ward["units"]), start=1)
                ]
                wards.append({"ward_code": ward["ward_code"], "name": ward["name"], "units": units})
            lgas.append({"lga_code": lga["lga_code"], "name": lga["name"], "wards": wards})
        out_states.append({"state_code": state["state_code"], "name": state["name"], "lgas": lgas})
    return {"dataset_version": version, "source": "official", "states": out_states}, len(seen)


def main():
    parser = argparse.ArgumentParser(description=__doc__, formatter_class=argparse.RawDescriptionHelpFormatter)
    parser.add_argument("csv", type=Path)
    parser.add_argument("output", type=Path)
    parser.add_argument("--version", required=True, help="Release version, YYYY-MM-DD.N")
    args = parser.parse_args()
    if not re.fullmatch(r"\d{4}-\d{2}-\d{2}\.[1-9]\d{0,5}", args.version):
        parser.error("Use --version YYYY-MM-DD.N")
    with args.csv.open(newline="", encoding="utf-8-sig") as handle:
        reader = csv.DictReader(handle)
        missing = REQUIRED - set(reader.fieldnames or [])
        if missing:
            sys.exit(f"The CSV is missing columns: {', '.join(sorted(missing))}")
        try:
            release, count = convert(reader, args.version)
        except ValueError as exc:
            sys.exit(str(exc))
    args.output.write_text(json.dumps(release, ensure_ascii=False, indent=1) + "\n", encoding="utf-8")
    print(f"{args.output}: {len(release['states'])} states, {count} polling units.")


if __name__ == "__main__":
    main()
