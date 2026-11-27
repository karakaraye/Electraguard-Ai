"""Build the ElectraGuard demonstration environment: one believable, synthetic polling day in Kano.

Run it after `migrate`, `load_reference_areas --file ../data/reference/official-synthetic-areas.json`
and `load_approved_documents <folder>`. It is safe to run again: accounts, check-ins, rumour claims and the
published snapshot are looked up first, and the reports are only created when none from this seed exist.

Passwords and PINs are never stored in the repository. Set DEMO_STAFF_PASSWORD and DEMO_OBSERVER_PIN to
choose them. Otherwise random ones are generated and written once to a private sign-in file outside the
repository (see --signins-file). Use `manage.py demo_totp <email>` for the two-step code at sign-in.
"""

import base64
import json
import os
import random
import secrets
from datetime import timedelta
from hashlib import sha256
from io import BytesIO
from pathlib import Path
from types import SimpleNamespace
from uuid import uuid4

from django.conf import settings
from django.core.management.base import BaseCommand, CommandError
from django.db import transaction
from django.utils import timezone

from accounts.models import INITIAL_ORGANISATION, ObserverCode, Organisation, StaffCredential, User
from accounts.observer_credentials import issue_code, pin_hash, too_simple
from accounts.staff_auth import encrypt

MARK = "demo_day"
STAFF_DOMAIN = "@demo.electraguard.test"

# (key, role, first name, last name)
STAFF = [
    ("reviewer.amina", User.Role.REVIEWER, "Amina", "Reviewer"),
    ("reviewer.chidi", User.Role.REVIEWER, "Chidi", "Reviewer"),
    ("coordinator.ngozi", User.Role.COORDINATOR, "Ngozi", "Coordinator"),
    ("coordinator.ibrahim", User.Role.COORDINATOR, "Ibrahim", "Coordinator"),
    ("moderator.zainab", User.Role.MODERATOR, "Zainab", "Moderator"),
    ("admin.tunde", User.Role.ORG_ADMIN, "Tunde", "Administrator"),
]

# Short, plain, synthetic observations. {u} is the polling unit name, {n} a small number, {t} a time.
TEXTS = {
    "late_materials": [
        "Ballot papers had not reached {u} by {t}. About {n} people were waiting under the tree. The officer said the van was delayed.",
        "Result sheets and the ink pad were missing when voting should have started at {u}. Staff sent a rider to the ward office.",
        "Materials arrived at {t}, more than two hours after the official opening. People stayed calm but some went home.",
        "The seal tags were not in the first delivery to {u}. Officials waited for a second delivery before opening.",
    ],
    "equipment_failure": [
        "The accreditation device could not read fingerprints for the first hour at {u}. Officials used the manual register after {t}.",
        "The device battery died at about {t}. Staff waited for a spare and about {n} voters waited in the line.",
        "Two of the five voting cubicles were broken and not replaced, so the line moved slowly at {u}.",
    ],
    "queues_crowding": [
        "Very long queue at {t}, about {n}0 people, with one accreditation table only. People were patient but pushing at the gate.",
        "The women's line was much longer than the men's line at {u}. The second table was not opened until {t}.",
        "The crowd at the gate blocked the entrance for older voters at {u}. Officials asked people to make a path.",
    ],
    "lack_of_information": [
        "Nobody at {u} could tell voters which line was for which register numbers. People moved around and asked each other.",
        "Officials did not announce the closing time at {u}. Some voters thought the unit had closed early.",
    ],
    "access_barrier": [
        "{u} is on the upper floor of the school block and has no ramp. A man in a wheelchair could not get in without being carried.",
        "There was no assistance for a blind voter at {u}. Officials had no large-print or braille guide.",
    ],
    "intimidation_violence": [
        "A group of young men gathered near the gate at {u} and shouted at voters. Officials asked them to move back. Nobody was hurt.",
        "Shouting and stones thrown near the junction by {u}. I moved away and told my coordinator.",
    ],
    "vote_buying": [
        "A man near the gate at {u} was offering small cash to people in the line. Voters refused. I could not see who he was working for.",
    ],
    "good_practice": [
        "{u} opened on time at 8:30 with all materials present. The priority line for older voters and pregnant women worked well.",
        "Officials explained the process to each line before opening at {u}. The observer table had a clear view.",
    ],
}
# Hausa and Pidgin reports, to show that the languages work.
OTHER_LANGUAGE = {
    "pcm": {
        "late_materials": "Dem never bring ballot paper reach {t}. People dey wait for line and nobody tell us wetin happen.",
        "queues_crowding": "The line long well well for {u}. Na only one table dem open for accreditation.",
    },
    "ha": {
        "late_materials": "Har zuwa {t} ba a kawo takardun zabe ba a {u}. Mutane suna jira a layi.",
        "equipment_failure": "Na'urar tantancewa ta daina aiki a {u}, ana jiran wata.",
    },
}
RATIONALES = {
    "corroborated": [
        "Two other observers in the same ward and a photo describe the same delay.",
        "The time and the place match a second report from the same ward.",
        "A reviewer matched the report with the ward check-in answers.",
    ],
    "insufficient_evidence": [
        "A single report with no time or photo. Kept as a lead only.",
        "The report could not be matched to any other report or check-in answer.",
    ],
    "out_of_scope": [
        "This describes a matter outside polling day observation.",
    ],
}
QUESTIONS = [
    "Which polling unit was this at, and about what time did the materials arrive?",
    "Roughly how many people were in the line at 9:00?",
    "Did the officials say why the second table stayed closed?",
]
SHOWCASE = (
    "Ballot papers had not arrived at the unit by 9:15 and about 60 people were waiting under the tree. "
    "Presiding officer Mr Sani said the van was delayed and gave his number 08031234567 for any complaint. "
    "I took a photo of the closed gate."
)


def draw_photo(seed):
    """A small synthetic picture of a polling unit gate and a line of people. No real person is shown."""
    from PIL import Image, ImageDraw

    rng = random.Random(seed)
    image = Image.new("RGB", (960, 720), (236, 226, 204))
    draw = ImageDraw.Draw(image)
    draw.rectangle((0, 470, 960, 720), fill=(196, 178, 140))
    draw.rectangle((90, 190, 520, 470), fill=(246, 240, 226), outline=(30, 28, 24), width=5)
    draw.rectangle((190, 290, 420, 470), fill=(60, 56, 50))
    draw.line((190, 290, 420, 470), fill=(246, 240, 226), width=4)
    draw.line((420, 290, 190, 470), fill=(246, 240, 226), width=4)
    draw.rectangle((120, 200, 490, 250), fill=(232, 190, 40))
    draw.polygon([(60, 190), (555, 190), (500, 130), (115, 130)], fill=(120, 108, 90), outline=(30, 28, 24))
    for index in range(rng.randint(9, 14)):
        x = 560 + index * 28 - rng.randint(0, 10)
        height = rng.randint(70, 110)
        draw.ellipse((x - 11, 400 - height, x + 11, 422 - height), fill=(60, 56, 50))
        draw.rectangle((x - 13, 420 - height, x + 13, 470), fill=(30 + rng.randint(0, 50), 60, 90))
    draw.ellipse((780, 40, 860, 120), fill=(232, 190, 40))
    buffer = BytesIO()
    image.save(buffer, format="JPEG", quality=88)
    return buffer.getvalue()


class Command(BaseCommand):
    help = "Seed a full synthetic polling-day story in Kano for demonstrations (idempotent)."

    def add_arguments(self, parser):
        default = Path(settings.PRIVATE_MEDIA_ROOT).parent / "demo-signins.json"
        parser.add_argument("--signins-file", type=Path, default=default,
                            help=f"Private file for the generated sign-ins (default {default}).")
        parser.add_argument("--quiet", action="store_true", help="Do not print the sign-in table.")

    def handle(self, *args, **options):
        if not settings.DEBUG:
            raise CommandError("seed_demo_day builds demonstration data. Run it only with DJANGO_DEBUG=true on a demo database.")
        self.rng = random.Random(20261215)
        self.now = timezone.now()
        self.signins_path = options["signins_file"]
        self.signins = self.load_signins()
        self.summary = {}
        self.step("reference areas", self.areas)
        self.step("organisation", self.organisation)
        self.step("approved guide", self.guide)
        self.step("staff accounts", self.accounts)
        self.step("observer cards", self.observers)
        if Report_exists(MARK):
            self.stdout.write("Reports from this seed already exist; leaving them as they are.")
        else:
            self.step("reports and reviews", self.reports)
        self.step("check-ins", self.checkins)
        self.step("rumour claims", self.rumours)
        self.step("public snapshot", self.snapshot)
        self.finish(options["quiet"])

    def step(self, name, run):
        started = timezone.now()
        run()
        self.stdout.write(f"  {name}: {(timezone.now() - started).total_seconds():.1f}s")

    # --- sign-in store -------------------------------------------------------------------------------

    def load_signins(self):
        if self.signins_path.exists():
            return json.loads(self.signins_path.read_text(encoding="utf-8"))
        return {"staff": {}, "observers": {}}

    def save_signins(self):
        self.signins_path.parent.mkdir(parents=True, exist_ok=True)
        self.signins_path.write_text(json.dumps(self.signins, indent=2), encoding="utf-8")

    # --- reference data and organisation -----------------------------------------------------------------

    def areas(self):
        from reference.models import AreaDataset

        dataset = AreaDataset.objects.order_by("-released_on", "-revision").first()
        if dataset is None or "KN" not in dataset.states:
            raise CommandError("Load the reference areas first: load_reference_areas --file ../data/reference/official-synthetic-areas.json")
        self.state = dataset.states["KN"]
        self.wards = []
        for lga in self.state["lgas"]:
            for ward in lga["wards"]:
                self.wards.append({
                    "lga_code": lga["lga_code"], "lga_name": lga["name"], "ward_code": ward["ward_code"],
                    "ward_name": ward["name"], "units": ward["units"],
                })

    def guide(self):
        """Load the approved guide (docs/approved-guide/<language>/*.md) so Ask and rumour answers have sources."""
        from approved_answers.models import ApprovedDocument

        root = Path(__file__).resolve().parents[4] / "docs" / "approved-guide"
        count = 0
        for folder in sorted(root.glob("*")):
            for path in sorted(folder.glob("*.md")):
                body = path.read_text(encoding="utf-8")
                title = next((line[2:].strip() for line in body.splitlines() if line.startswith("# ")), path.stem)
                ApprovedDocument.objects.update_or_create(
                    language=folder.name, source__document_id=f"guide-{path.stem}", source__section="1",
                    defaults={
                        "title": title[:200], "body": body, "observer_only": False,
                        "source": {"document_id": f"guide-{path.stem}", "section": "1", "version": "2026-11", "url": "/guide"},
                    },
                )
                count += 1
        self.summary["approved guide pages"] = count

    def organisation(self):
        local = timezone.localtime(self.now, timezone.get_fixed_timezone(60))
        organisation, _ = Organisation.objects.get_or_create(pk=INITIAL_ORGANISATION, defaults={"name": "ElectraGuard demonstration"})
        organisation.name = "ElectraGuard demonstration (synthetic data)"
        organisation.election_day = local.date()
        organisation.coverage_state_codes = ["KN"]
        organisation.coverage_lga_codes = [lga["lga_code"] for lga in self.state["lgas"]]
        organisation.simulator_enabled = True
        organisation.intake_paused = False
        organisation.save()
        self.org = organisation

    # --- people ---------------------------------------------------------------------------------------

    def accounts(self):
        password = os.environ.get("DEMO_STAFF_PASSWORD") or None
        self.staff = {}
        created = 0
        for key, role, first, last in STAFF:
            email = key + STAFF_DOMAIN
            user = User.objects.filter(email=email).first()
            if user is None:
                chosen = password or self.signins["staff"].get(email, {}).get("password") or "Ballot-box-" + secrets.token_hex(6)
                user = User.objects.create_user(
                    email, chosen, organisation_id=INITIAL_ORGANISATION, role=role, first_name=first, last_name=last,
                )
                shared = base64.b32encode(secrets.token_bytes(20)).decode()
                StaffCredential.objects.create(
                    user=user, organisation_id=INITIAL_ORGANISATION, secret=encrypt(shared), enforce_totp=True,
                )
                self.signins["staff"][email] = {"role": role, "name": f"{first} {last}", "password": chosen}
                created += 1
            elif password:
                user.set_password(password)
                user.save(update_fields=["password"])
                self.signins["staff"].setdefault(email, {"role": role, "name": f"{first} {last}"})["password"] = password
            self.staff[key] = user
        self.summary["staff accounts"] = f"{len(STAFF)} ({created} new)"
        self.save_signins()

    def observers(self):
        from accounts.observer_credentials import ALPHABET  # noqa: F401

        fixed_pin = os.environ.get("DEMO_OBSERVER_PIN") or self.signins.get("observer_pin")
        if fixed_pin and (not fixed_pin.isdigit() or len(fixed_pin) != 6 or too_simple(fixed_pin)):
            raise CommandError("DEMO_OBSERVER_PIN must be six digits and not a simple run such as 123456.")
        while not fixed_pin:
            candidate = f"{secrets.randbelow(10**6):06d}"
            if not too_simple(candidate):
                fixed_pin = candidate
        self.signins["observer_pin"] = fixed_pin
        self.observer_list = []
        created = 0
        for number in range(1, 13):
            label = f"Demo observer {number:02d}"
            credential = ObserverCode.objects.filter(label=label).select_related("user").first()
            if credential is None:
                with transaction.atomic():
                    credential, setup = issue_code(self.org, label)
                    created += 1
                    if number <= 10:
                        credential.pin_hash = pin_hash(fixed_pin)
                        credential.setup_hash = ""
                        credential.setup_prefix_hash = ""
                        credential.status = ObserverCode.Status.ACTIVE
                        credential.activated_at = self.now
                        credential.save()
                        self.signins["observers"][credential.code] = {"label": label, "state": "active", "pin": fixed_pin}
                    else:
                        self.signins["observers"][credential.code] = {"label": label, "state": "first sign-in", "setup_pin": setup}
            self.observer_list.append(credential)
        self.save_signins()
        self.summary["observer cards"] = f"12 ({created} new): 10 active, 2 for first sign-in"

    # --- reports --------------------------------------------------------------------------------------

    def reports(self):
        from clocks.models import ReviewClock
        from intelligence.triage import process_next
        from reports.models import Report, ReviewEvent

        now, rng = self.now, self.rng
        coordinator = self.staff["coordinator.ngozi"]
        reviewers = [self.staff["reviewer.amina"], self.staff["reviewer.chidi"]]
        plan = self.plan()
        made = []
        for spec in plan:
            made.append((spec, self.create_report(spec)))
        # A short synthetic suggestion pass, as the background worker would do.
        processed = 0
        while process_next():
            processed += 1
        # Reviewer actions
        for spec, report in made:
            report.refresh_from_db()
            self.work(spec, report, coordinator, reviewers)
        self.fix_clocks()
        from django.core.management import call_command
        from ops.clusters import detect

        detect(INITIAL_ORGANISATION, timezone.now())
        call_command("run_review_clocks", "--once", stdout=BytesIO_text())
        counts = {}
        for report in Report.objects.filter(incident_details__demo=MARK):
            label = report.kind if report.kind != "incident" else report.status
            counts[label] = counts.get(label, 0) + 1
        self.summary["reports"] = f"{sum(counts.values())}: " + ", ".join(f"{count} {name}" for name, count in sorted(counts.items()))
        self.summary["suggestion jobs processed"] = processed
        self.summary["audit events"] = None  # filled in finish()

    def area_for(self, ward_index, unit_index):
        ward = self.wards[ward_index % len(self.wards)]
        unit = ward["units"][unit_index % len(ward["units"])]
        return ward, unit

    def plan(self):
        """The list of reports to create, newest information last. Times are minutes before now."""
        rng = self.rng
        plan = []

        def add(**spec):
            plan.append(spec)

        # Reviewed (closed) reports: these feed the public totals. All occurred more than 75 minutes ago.
        closed = (
            [("late_materials", 9), ("equipment_failure", 7), ("queues_crowding", 8), ("lack_of_information", 5),
             ("access_barrier", 3), ("intimidation_violence", 2), ("vote_buying", 1), ("good_practice", 3)]
        )
        outcomes = ["corroborated"] * 22 + ["insufficient_evidence"] * 12 + ["out_of_scope"] * 4
        rng.shuffle(outcomes)
        index = 0
        for category, number in closed:
            for _ in range(number):
                add(kind="incident", status="closed", category=category, minutes_ago=rng.randint(80, 480),
                    ward=rng.randrange(9), unit=rng.randrange(5), outcome=outcomes[index % len(outcomes)],
                    observer=rng.randrange(10), citizen=(index % 13 == 7), photo=(index % 9 == 2))
                index += 1
        # A surge of late materials in the first local government area, still open, in the last 45 minutes.
        for step in range(7):
            add(kind="incident", status="submitted" if step % 2 else "in_review", category="late_materials",
                minutes_ago=5 + step * 6, ward=step % 3, unit=step % 5, observer=step % 3, firsthand=True)
        # The showcase case for the reviewer scene.
        add(kind="incident", status="in_review", category="late_materials", minutes_ago=34, ward=0, unit=0,
            observer=0, showcase=True, photo=True, firsthand=True, assign=0)
        # Other open reports.
        open_specs = [
            ("equipment_failure", "in_review"), ("queues_crowding", "in_review"), ("queues_crowding", "submitted"),
            ("intimidation_violence", "submitted"), ("vote_buying", "submitted"), ("access_barrier", "in_review"),
            ("lack_of_information", "submitted"), ("equipment_failure", "submitted"), ("misinformation", "submitted"),
            ("good_practice", "in_review"), ("not_sure", "submitted"),
        ]
        for category, status in open_specs:
            add(kind="incident", status=status, category=category, minutes_ago=rng.randint(12, 150), ward=rng.randrange(3, 9),
                unit=rng.randrange(5), observer=rng.randrange(3, 10), photo=(category == "access_barrier"),
                danger=(category == "intimidation_violence"), citizen=(category in ("lack_of_information", "misinformation")))
        # Reviewer questions, one of them to a signed-in demo observer.
        for position, (category, observer) in enumerate((("late_materials", 3), ("queues_crowding", 4), ("equipment_failure", 6))):
            add(kind="incident", status="needs_clarification", category=category, minutes_ago=60 + position * 25,
                ward=observer, unit=position, observer=observer, question=QUESTIONS[position])
        # Citizen reports through the public form
        for position in range(4):
            add(kind="incident", status="submitted" if position < 3 else "in_review", category=["queues_crowding", "late_materials", "lack_of_information", "equipment_failure"][position],
                minutes_ago=20 + position * 17, ward=position * 2 + 1, unit=position, citizen=True)
        # Result sheets (one that does not add up) and checklists
        add(kind="result_sheet", status="submitted", minutes_ago=18, ward=0, unit=1, observer=0, sheet="mismatch", assign=0)
        add(kind="result_sheet", status="in_review", minutes_ago=42, ward=4, unit=2, observer=3, sheet="consistent")
        add(kind="result_sheet", status="closed", minutes_ago=130, ward=7, unit=0, observer=7, sheet="consistent", outcome="corroborated")
        add(kind="checklist", status="submitted", minutes_ago=95, ward=1, unit=3, observer=1, stage="opening")
        add(kind="checklist", status="submitted", minutes_ago=70, ward=5, unit=1, observer=5, stage="accreditation")
        return plan

    def create_report(self, spec):
        from reports.models import MediaItem, Report, ReviewEvent
        from reports.media_storage import photo_key, storage
        from reports.photo_processing import clean_photo
        from reports.result_checks import check_result_sheet
        from reports.v1_views import persist_report

        rng, now = self.rng, self.now
        # An observer reports from one home ward; a citizen can be anywhere.
        home = spec["ward"] if spec.get("citizen") or "observer" not in spec else spec["observer"] % 9
        ward, unit = self.area_for(home, spec["unit"])
        area = {
            "state_code": "KN", "state_name": self.state["name"], "lga_code": ward["lga_code"], "lga_name": ward["lga_name"],
            "ward_code": ward["ward_code"], "ward_name": ward["ward_name"],
            "polling_unit_code": unit[0], "polling_unit_name": unit[1],
        }
        occurred = now - timedelta(minutes=spec["minutes_ago"])
        sent = min(occurred + timedelta(minutes=rng.randint(4, 14)), now - timedelta(minutes=1))
        language = "en"
        category = spec.get("category")
        clock_time = timezone.localtime(occurred, timezone.get_fixed_timezone(60)).strftime("%H:%M")
        if spec["kind"] == "incident":
            if spec.get("showcase"):
                text = SHOWCASE
            else:
                other = [code for code, texts in OTHER_LANGUAGE.items() if category in texts]
                if other and rng.random() < 0.18:
                    language = rng.choice(other)
                    template = OTHER_LANGUAGE[language][category]
                else:
                    template = rng.choice(TEXTS[category if category in TEXTS else "lack_of_information"])
                text = template.format(u=unit[1].split(",")[0] + f" in {ward['ward_name']}", n=rng.randint(3, 9), t=clock_time)
            details = {
                "language": language, "category_observer": category, "access_barrier_details": ["steps_no_ramp"] if category == "access_barrier" else [],
                "danger_now": bool(spec.get("danger")), "firsthand": spec.get("firsthand", rng.random() < 0.7), "input_method": "typed",
                "from_checklist_question": None, "related_report_id": None, "time_known": True,
                "device_saved_at": None, "area": area, "demo": MARK,
            }
            if rng.random() < 0.12:
                details["device_saved_at"] = (occurred + timedelta(minutes=1)).isoformat()
            values = {"occurred_at": occurred, "description": text, "incident_details": details}
            extra = {}
            structured = None
        else:
            details = {
                "language": "en", "category_observer": None, "access_barrier_details": [], "danger_now": None, "firsthand": None,
                "input_method": None, "from_checklist_question": None, "related_report_id": None, "time_known": True,
                "device_saved_at": None, "area": area, "demo": MARK,
            }
            values = {"occurred_at": occurred, "description": "", "incident_details": details}
            if spec["kind"] == "result_sheet":
                labels = self.org.party_labels
                if spec["sheet"] == "consistent":
                    votes = dict(zip(labels, [118, 74, 61, 40, 25]))
                    rejected, accredited = 9, 327
                else:
                    votes = dict(zip(labels, [102, 88, 57, 33, 19]))
                    rejected, accredited = 11, 330
                structured = {
                    "registered": 612, "accredited": accredited, "rejected": rejected, "votes": votes,
                    "confirmed_fields": ["registered", "accredited", "rejected", *(f"votes.{k}" for k in votes)],
                    "entry_method": "manual", "unreadable": False,
                }
                extra = {"kind": "result_sheet", "structured_details": structured, "result_flags": check_result_sheet(structured, [])}
            else:
                answers = {
                    "opening": [{"question": "opened_on_time", "answer": "yes"}, {"question": "materials_all_present", "answer": "no"},
                                {"question": "officials_present", "answer": "yes"}, {"question": "party_agents_present", "answer": "yes"},
                                {"question": "materials_missing", "answer": ["indelible_ink"]}],
                    "accreditation": [{"question": "device_working", "answer": "yes"}, {"question": "priority_given", "answer": "yes"},
                                      {"question": "queue_size", "answer": "50_200"}],
                }[spec["stage"]]
                structured = {"stage": spec["stage"], "answers": answers, "note": None}
                extra = {"kind": "checklist", "structured_details": structured}
        reviewer_assignee = None
        if spec.get("citizen"):
            secret = secrets.token_urlsafe(32)[:43].ljust(43, "A")
            _, _, report = persist_report(None, INITIAL_ORGANISATION, values, secret_digest=sha256(secret.encode()).hexdigest(), **extra)
        else:
            credential = self.observer_list[spec.get("observer", 0) % len(self.observer_list)]
            _, _, report = persist_report(credential.user, INITIAL_ORGANISATION, values, code=credential.code, **extra)
        Report.objects.filter(pk=report.pk).update(created_at=sent)
        ReviewEvent.objects.filter(report=report, version=0).update(created_at=sent)
        from clocks.models import ReviewClock

        for clock in ReviewClock.objects.filter(report=report):
            clock.started_at = sent
            clock.due_at = sent + timedelta(minutes=clock.target_minutes)
            clock.save(update_fields=["started_at", "due_at"])
        if spec.get("photo"):
            raw = draw_photo(report.pk.int)
            cleaned, blurred = clean_photo(raw, "image/jpeg", True)
            media = MediaItem.objects.create(
                report=report, organisation_id=INITIAL_ORGANISATION, purpose="evidence", size_bytes=len(cleaned),
                original_sha256=sha256(raw).hexdigest(), sha256=sha256(cleaned).hexdigest(), blurred=blurred,
            )
            storage().write(photo_key(INITIAL_ORGANISATION, media.pk), cleaned)
        report.refresh_from_db()
        return report

    def work(self, spec, report, coordinator, reviewers):
        """Take the report to its planned stage through the same events the screens write."""
        from reports.models import Report, ReviewEvent
        from reports.reviewer_views import decide_suggestion
        from reports.workflow import closure_snapshot, record_change

        Action, Status = ReviewEvent.Action, Report.Status
        rng = self.rng
        status = spec["status"]
        created = report.created_at

        def act(actor, action, change, when, field=None):
            record_change(report, actor, action, change, field)
            ReviewEvent.objects.filter(report=report, version=report.version).update(created_at=min(when, self.now - timedelta(seconds=30)))

        is_sheet_or_check = spec["kind"] != "incident"
        assignable = status != "submitted" or spec.get("assign") is not None or rng.random() < 0.7
        if spec["kind"] == "checklist":
            return
        if not assignable:
            return
        area = report.incident_details["area"]
        reviewer = reviewers[spec["assign"]] if spec.get("assign") is not None else reviewers[0 if area["lga_code"] != self.state["lgas"][1]["lga_code"] else 1]
        report.assigned_reviewer = reviewer
        act(coordinator, Action.ASSIGN, {"previous_reviewer": None, "reviewer": reviewer.email}, created + timedelta(minutes=3), "assigned_reviewer")
        if status == "submitted":
            return
        started = created + timedelta(minutes=rng.randint(6, 35))
        report.status = Status.IN_REVIEW
        act(reviewer, Action.START, {"from_status": "submitted", "to_status": "in_review"}, started, "status")
        request = SimpleNamespace(user=reviewer)
        triage_ready = hasattr(report, "triage") and report.triage.status == "ready"
        calmer = {"good_practice": "low", "queues_crowding": "normal", "lack_of_information": "normal", "not_sure": "normal", "equipment_failure": "high"}
        if status == "in_review" and triage_ready and not spec.get("showcase") and spec.get("category") in calmer:
            try:
                decide_suggestion(request, report, "urgency", {"decision": "correct", "value": calmer[spec["category"]]})
            except Exception:
                pass
        if status == "closed" and triage_ready and not is_sheet_or_check:
            report.refresh_from_db()
            for kind in ("category", "urgency"):
                try:
                    options = report.triage.suggestions[kind]
                    original = options.get("value")
                    decision = {"decision": "accept"}
                    if original is None or (kind == "urgency" and rng.random() < 0.2):
                        decision = {"decision": "correct", "value": "high" if original != "high" else "normal"} if kind == "urgency" else None
                    if decision:
                        decide_suggestion(request, report, kind, decision)
                except Exception:
                    continue
        if status == "needs_clarification":
            question = spec["question"]
            report.status = Status.NEEDS_CLARIFICATION
            act(reviewer, Action.REQUEST_CLARIFICATION, {
                "from_status": "in_review", "to_status": "needs_clarification", "note": question,
                "auto_redacted_body": question, "auto_redactions": [],
            }, started + timedelta(minutes=rng.randint(5, 20)), "status")
            return
        if status == "closed":
            outcome = spec["outcome"]
            rationale = rng.choice(RATIONALES[outcome])
            closed_at = started + timedelta(minutes=rng.randint(12, 70))
            report.status = Status.CLOSED
            act(reviewer, Action.CLOSE, {
                "from_status": "in_review", "to_status": "closed", "note": rationale, "auto_redacted_body": rationale,
                "auto_redactions": [], "outcome": outcome, **closure_snapshot(report),
            }, closed_at, "status")

    def fix_clocks(self):
        from clocks.models import ReviewClock
        from reports.models import ReviewEvent

        for clock in ReviewClock.objects.filter(kind=ReviewClock.Kind.FIRST_ACTION, report__incident_details__demo=MARK):
            clock.due_at = clock.started_at + timedelta(minutes=clock.target_minutes)
            first = ReviewEvent.objects.filter(
                report=clock.report, action__in=("start", "request_clarification", "close"),
            ).order_by("created_at").first()
            if first is not None:
                clock.stopped_at = first.created_at
                clock.state = ReviewClock.State.STOPPED
            clock.save(update_fields=["due_at", "stopped_at", "state"])

    # --- check-ins, rumours and the snapshot -----------------------------------------------------------

    def checkins(self):
        from notices.models import Notice, NoticeAnswer, Question
        from notices.views import _checkin_cluster_hook

        now = self.now
        ngozi, ibrahim = self.staff["coordinator.ngozi"], self.staff["coordinator.ibrahim"]
        first_lga, second_lga, third_lga = (lga["lga_code"] for lga in self.state["lgas"])
        second_ward = next(w["ward_code"] for w in self.wards if w["lga_code"] == second_lga)
        specs = [
            (Notice.ScopeKind.LGA, first_lga, "logistics", "Please say whether election materials have arrived at your polling unit.",
             "materials_arrived", 85, ["no", "no", "no", "yes"], [0, 1, 2, 9], ngozi),
            (Notice.ScopeKind.LGA, second_lga, "logistics", "Please say whether voting has started at your polling unit.",
             "voting_started", 50, ["yes", "yes", "not_seen"], [3, 4, 5], ibrahim),
            (Notice.ScopeKind.WARD, second_ward, "logistics", "Is your polling unit calm right now?",
             "unit_calm", 30, ["yes"], [3], ngozi),
        ]
        made = 0
        for kind, code, type_, text, question, minutes, answers, observers, author in specs:
            if Notice.objects.filter(scope_kind=kind, scope_code=code, question_id=question).exists():
                continue
            created = now - timedelta(minutes=minutes)
            approver = ibrahim if author == ngozi else ngozi
            notice = Notice.objects.create(
                organisation_id=INITIAL_ORGANISATION, scope_kind=kind, scope_code=code, type=type_, text=text,
                question=Question.objects.get(pk=question), created_by=author, approved_by=approver,
                status=Notice.Status.SENT, expires_at=now + timedelta(hours=5),
            )
            Notice.objects.filter(pk=notice.pk).update(created_at=created)
            for observer, answer in zip(observers, answers):
                NoticeAnswer.objects.create(
                    organisation_id=INITIAL_ORGANISATION, notice=notice, observer_code=self.observer_list[observer].code,
                    answer=answer, answered_at_device=created + timedelta(minutes=self.rng.randint(4, 25)),
                )
            _checkin_cluster_hook(notice)
            made += 1
        pending_text = "Stay inside the unit compound until the crowd at the gate has cleared. Wait for your coordinator."
        if not Notice.objects.filter(status=Notice.Status.PENDING_APPROVAL, scope_code=third_lga).exists():
            pending = Notice.objects.create(
                organisation_id=INITIAL_ORGANISATION, scope_kind=Notice.ScopeKind.LGA, scope_code=third_lga, type="safety",
                text=pending_text, created_by=ibrahim, status=Notice.Status.PENDING_APPROVAL, expires_at=now + timedelta(hours=3),
            )
            Notice.objects.filter(pk=pending.pk).update(created_at=now - timedelta(minutes=6))
            made += 1
        self.summary["check-ins"] = f"{Notice.objects.count()} in total ({made} new), with answers and one safety notice waiting for a second coordinator"

    def rumours(self):
        from rumours.models import Claim, ClaimAskHour
        from rumours.views import assessment

        now = self.now
        ngozi, ibrahim = self.staff["coordinator.ngozi"], self.staff["coordinator.ibrahim"]
        kano = {"state_code": "KN", "state_name": self.state["name"], "lga_code": None, "lga_name": None}
        specs = [
            {
                "text": "Voting has been moved to Saturday in Kano", "seen_on": "whatsapp", "asks": 41, "status": "response_approved",
                "category": "lack_of_information", "minutes": 120, "area": kano,
                "answer": {
                    "en": "Voting dates are announced only by the electoral commission. Look for the official notice at your polling unit. ElectraGuard cannot confirm a date.",
                    "pcm": "Na only the electoral commission dey announce voting date. Look the official notice for your polling unit. ElectraGuard no fit confirm date.",
                    "ha": "Hukumar zabe ce kadai ke bayyana ranar zabe. Duba sanarwar hukuma a rumfar zabenka. ElectraGuard ba za ta iya tabbatar da rana ba.",
                },
            },
            {
                "text": "ElectraGuard will announce who won in Kano", "seen_on": "facebook", "asks": 23, "status": "response_approved",
                "category": "misinformation", "minutes": 100, "area": kano,
                "answer": {
                    "en": "ElectraGuard does not count votes or announce winners. It shows reviewed observation counts only, with numbers below 5 hidden. Not official results.",
                    "pcm": "ElectraGuard no dey count vote or announce who win. E dey show only observation wey reviewers don check, and e dey hide number wey small pass 5. Na no official result.",
                    "ha": "ElectraGuard ba ta kidaya kuri'u ko ta bayyana wanda ya ci. Tana nuna abin da masu dubawa suka tantance kawai, ba sakamakon hukuma ba.",
                },
            },
            {
                "text": "Observers can see my name and phone number when I send a report", "seen_on": "sms", "asks": 17, "status": "response_approved",
                "category": "lack_of_information", "minutes": 80, "area": None,
                "answer": {
                    "en": "No. You can send a report without a name or phone number. Names and numbers typed in the text are replaced by tokens before a reviewer reads it.",
                    "pcm": "No. You fit send report without name or phone number. Name and number wey dey inside the text go change to token before reviewer see am.",
                    "ha": "A'a. Za ka iya aika rahoto ba tare da suna ko lambar waya ba. Ana maye gurbin suna da lambobi da alama kafin mai dubawa ya karanta.",
                },
            },
            {"text": "A polling unit in Kano has run out of ballot papers", "seen_on": "whatsapp", "asks": 12, "status": "response_draft",
             "category": "late_materials", "minutes": 25, "area": {**kano, "lga_code": self.state["lgas"][1]["lga_code"], "lga_name": self.state["lgas"][1]["name"]},
             "draft": "ElectraGuard has reviewed reports of late materials in this area. We have not confirmed that any unit ran out of ballot papers. Ask your coordinator."},
            {"text": "People are being told to pay to collect their voter card", "seen_on": "sms", "asks": 7, "status": "new",
             "category": None, "minutes": 14, "area": None},
            {"text": "Result sheets are being changed at the collation centre", "seen_on": "facebook", "asks": 4, "status": "new",
             "category": None, "minutes": 9, "area": kano},
            {"text": "The queue at one Kano unit is moving to a different building", "seen_on": "whatsapp", "asks": 3, "status": "new",
             "category": None, "minutes": 4, "area": kano},
            {"text": "Free bags of rice are being given at a polling unit", "seen_on": "x", "asks": 2, "status": "dismissed",
             "category": None, "minutes": 140, "area": None},
        ]
        made = 0
        for spec in specs:
            if Claim.objects.filter(organisation_id=INITIAL_ORGANISATION, text=spec["text"]).exists():
                continue
            seen = now - timedelta(minutes=spec["minutes"])
            harm, worth = assessment(spec["text"], spec["area"], seen, self.org, ask_trend_1h=min(spec["asks"], 12))
            response = None
            drafted_by = None
            if spec["status"] == "response_approved":
                response = {
                    "text": spec["answer"]["en"], "language": "en", "category": spec["category"], "drafted_by": "Ibrahim Coordinator",
                    "drafted_at": (seen + timedelta(minutes=10)).isoformat(), "approved_by": "Ngozi Coordinator",
                    "approved_at": (seen + timedelta(minutes=24)).isoformat(), "rejection_note": None, "translations": spec["answer"],
                }
                drafted_by = ibrahim
            elif spec["status"] == "response_draft":
                response = {
                    "text": spec["draft"], "language": "en", "category": spec["category"], "drafted_by": "Ibrahim Coordinator",
                    "drafted_at": (now - timedelta(minutes=8)).isoformat(), "approved_by": None, "approved_at": None, "rejection_note": None,
                }
                drafted_by = ibrahim
            claim = Claim.objects.create(
                organisation_id=INITIAL_ORGANISATION, text=spec["text"], seen_on=spec["seen_on"], seen_at=seen, language="en",
                area=spec["area"], harm=harm, check_worthiness=worth, source="public" if spec["seen_on"] in ("sms", "whatsapp", "facebook", "x") else "desk",
                ask_count=spec["asks"], status=spec["status"], response=response, drafted_by=drafted_by, created_by=None,
            )
            Claim.objects.filter(pk=claim.pk).update(created_at=seen)
            last_hour = now.replace(minute=0, second=0, microsecond=0)
            ClaimAskHour.objects.create(organisation_id=INITIAL_ORGANISATION, claim=claim, hour=last_hour, count=max(1, spec["asks"] // 3))
            ClaimAskHour.objects.create(organisation_id=INITIAL_ORGANISATION, claim=claim, hour=last_hour - timedelta(hours=1), count=spec["asks"] - max(1, spec["asks"] // 3))
            made += 1
        self.summary["rumour claims"] = f"{Claim.objects.count()} in total ({made} new): 3 with approved answers in three languages, 1 draft waiting for a second coordinator, 3 new, 1 dismissed"

    def snapshot(self):
        from publicdata.aggregate import latest_cutoff
        from publicdata.models import Snapshot
        from publicdata.views import create_snapshot, publish

        if Snapshot.objects.filter(organisation_id=INITIAL_ORGANISATION).exists():
            self.summary["public snapshot"] = "already published"
            return
        creator, approver = self.staff["coordinator.ngozi"], self.staff["coordinator.ibrahim"]
        with transaction.atomic():
            snapshot = create_snapshot(self.org, creator, latest_cutoff(self.org, timezone.now()))
            publish(snapshot, approver)
        total = snapshot.preview["total"]
        shown = "hidden (under 5)" if total["suppressed"] else total["count"]
        hidden = sum(1 for state in snapshot.preview["by_state"] for cell in state["by_category"].values() if cell["suppressed"])
        self.summary["public snapshot"] = f"published, total {shown}, {hidden} category cells hidden because they are under 5"

    def finish(self, quiet):
        from staff.models import AuditEvent

        self.summary["audit events"] = AuditEvent.objects.filter(organisation_id=INITIAL_ORGANISATION).count()
        self.stdout.write(self.style.SUCCESS("Demonstration day is ready."))
        for key, value in self.summary.items():
            if value is not None:
                self.stdout.write(f"  {key}: {value}")
        self.stdout.write(f"  sign-ins file (private, outside the repository): {self.signins_path}")
        if quiet:
            return
        self.stdout.write("")
        self.stdout.write("Staff sign-ins (email, password; use `manage.py demo_totp <email>` for the six-digit code):")
        for email, info in self.signins["staff"].items():
            self.stdout.write(f"  {info['role']:<13} {email}  {info.get('password', '(set by DEMO_STAFF_PASSWORD)')}")
        self.stdout.write("Observer cards (code, PIN):")
        for code, info in self.signins["observers"].items():
            self.stdout.write(f"  {code}  {info['label']}  " + (f"PIN {info['pin']}" if info["state"] == "active" else f"setup PIN {info['setup_pin']} (first sign-in)"))


def Report_exists(mark):
    from reports.models import Report

    return Report.objects.filter(incident_details__demo=mark).exists()


class BytesIO_text:
    """A throw-away stdout for the commands this one calls."""

    def write(self, value):
        return len(value)

    def flush(self):
        pass
