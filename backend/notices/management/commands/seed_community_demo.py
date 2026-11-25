"""Seed demo data for community features in the synthetic organisation (D4).

Seeds:
1. Two approved rumour responses in all 5 languages (including 'voting moved to Saturday').
2. One sent logistics notice with the materials question.
3. Observer answers that trigger a check-in cluster warning in LGA SYN-KN-01.
"""

from datetime import timedelta
from uuid import uuid4

from django.core.management.base import BaseCommand
from django.utils import timezone

from accounts.models import INITIAL_ORGANISATION, ObserverCode, Organisation, User
from notices.models import Notice, NoticeAnswer, Question
from notices.views import _checkin_cluster_hook
from ops.models import ClusterWarning
from reports.models import Report
from rumours.models import Claim


class Command(BaseCommand):
    help = "Seed demo data for community features (rumours, check-in notice, check-in cluster)."

    def handle(self, *args, **options):
        org, _ = Organisation.objects.get_or_create(
            pk=INITIAL_ORGANISATION,
            defaults={"name": "Synthetic Demo Organisation"},
        )

        coordinator, _ = User.objects.get_or_create(
            email="demo_coord@electraguard.test",
            defaults={
                "organisation": org,
                "role": User.Role.COORDINATOR,
                "first_name": "Fatima",
                "last_name": "Musa",
            },
        )

        now = timezone.now()

        # 1. Two approved rumour responses in all 5 languages
        claim1, created1 = Claim.objects.get_or_create(
            organisation=org,
            text="Voting has been moved to Saturday in Kano",
            defaults={
                "seen_on": "whatsapp",
                "language": "en",
                "area": {"state_code": "SYN-KN", "state_name": "Kano", "lga_code": "SYN-KN-01", "lga_name": "Kano Municipal"},
                "status": "response_approved",
                "source": "public",
                "ask_count": 48,
                "harm": {"level": "high", "score": 0.85, "reasons": ["election_day", "viral_demand"]},
                "check_worthiness": {"level": "high", "score": 0.85},
                "response": {
                    "text": "INEC confirms voting is taking place on Saturday as officially scheduled.",
                    "category": "late_materials",
                    "approved_by": "Fatima Musa",
                    "approved_at": (now - timedelta(minutes=45)).isoformat(),
                    "translations": {
                        "en": "INEC confirms voting is taking place on Saturday as officially scheduled.",
                        "pcm": "INEC confirm say voting dey hold on Saturday as dem plan am.",
                        "ha": "Hukumar INEC ta tabbatar da cewa za a kada kuri'a a ranar Asabar kamar yadda aka tsara.",
                        "yo": "Ajo INEC fidi re mule pe idibo yoo waye ni ojo Asabar gege bi eto.",
                        "ig": "INEC kwadoro na a ga-eme ntuli aka na Satode dika ahaziri na mbu.",
                    },
                },
            },
        )

        claim2, created2 = Claim.objects.get_or_create(
            organisation=org,
            text="Results cancelled across Kano Municipal collation centres",
            defaults={
                "seen_on": "facebook",
                "language": "en",
                "area": {"state_code": "SYN-KN", "state_name": "Kano", "lga_code": "SYN-KN-01", "lga_name": "Kano Municipal"},
                "status": "response_approved",
                "source": "public",
                "ask_count": 22,
                "harm": {"level": "high", "score": 0.75, "reasons": ["location_specific", "viral_demand"]},
                "check_worthiness": {"level": "high", "score": 0.75},
                "response": {
                    "text": "INEC has not cancelled any results. Collation is active and proceeding under observation.",
                    "category": "lack_of_information",
                    "approved_by": "Fatima Musa",
                    "approved_at": (now - timedelta(minutes=30)).isoformat(),
                    "translations": {
                        "en": "INEC has not cancelled any results. Collation is active and proceeding under observation.",
                        "pcm": "INEC never cancel any result. Collation dey go on well under eye.",
                        "ha": "Hukumar INEC ba ta soke sakamako ba. Ana tattara sakamako a karkashin sanya ido.",
                        "yo": "Ajo INEC ko fagilee abajade kankan. Eto kika ibo n lo lowo labe amojuto.",
                        "ig": "INEC akagbughi nsonaazụ ọ bụla. Nchịkọta na-aga n'ihu n'okpuru nlekọta.",
                    },
                },
            },
        )

        # 2. One sent logistics notice with the materials question
        q_materials = Question.objects.get(id="materials_arrived")
        notice, created_notice = Notice.objects.get_or_create(
            organisation=org,
            scope_kind=Notice.ScopeKind.LGA,
            scope_code="SYN-KN-01",
            type=Notice.NoticeType.LOGISTICS,
            defaults={
                "text": "Please confirm if election materials have arrived at your polling units.",
                "question": q_materials,
                "created_by": coordinator,
                "approved_by": coordinator,
                "status": Notice.Status.SENT,
                "expires_at": now + timedelta(hours=6),
            },
        )

        # 3. Observers and answers triggering check-in cluster in SYN-KN-01
        obs_data = [
            ("demo_obs1@electraguard.test", "OBS-DM0001", "SYN-KN-01-01"),
            ("demo_obs2@electraguard.test", "OBS-DM0002", "SYN-KN-01-02"),
            ("demo_obs3@electraguard.test", "OBS-DM0003", "SYN-KN-01-01"),
        ]

        for email, code, ward in obs_data:
            user, _ = User.objects.get_or_create(
                email=email,
                defaults={"organisation": org, "role": User.Role.OBSERVER},
            )
            ObserverCode.objects.get_or_create(
                code=code,
                defaults={
                    "user": user,
                    "organisation": org,
                    "status": ObserverCode.Status.ACTIVE,
                    "label": f"Demo Observer ({ward})",
                },
            )
            # Existing open observation report anchoring the observer to the ward
            Report.objects.get_or_create(
                submission_key=uuid4(),
                defaults={
                    "organisation": org,
                    "observer": user,
                    "occurred_at": now - timedelta(minutes=40),
                    "status": Report.Status.SUBMITTED,
                    "description": f"Observation report in {ward}",
                    "incident_details": {
                        "kind": "incident",
                        "category": "late_materials",
                        "area": {
                            "state_code": "SYN-KN",
                            "lga_code": "SYN-KN-01",
                            "ward_code": ward,
                        },
                    },
                },
            )
            # Record "no" answer to notice
            NoticeAnswer.objects.update_or_create(
                notice=notice,
                observer_code=code,
                defaults={
                    "organisation": org,
                    "answer": NoticeAnswer.AnswerChoice.NO,
                    "answered_at_device": now - timedelta(minutes=15),
                },
            )

        # Trigger cluster hook
        _checkin_cluster_hook(notice)

        cw = ClusterWarning.objects.filter(
            organisation=org,
            lga_code="SYN-KN-01",
            trigger="checkins",
        ).first()

        self.stdout.write(self.style.SUCCESS(
            f"Successfully seeded demo community features:\n"
            f"  - Claim 1: {claim1.text} (approved, 5 languages)\n"
            f"  - Claim 2: {claim2.text} (approved, 5 languages)\n"
            f"  - Notice: {notice.id} (LGA SYN-KN-01, question={notice.question_id})\n"
            f"  - ClusterWarning: trigger={getattr(cw, 'trigger', None)}, observed={getattr(cw, 'observed', None)}"
        ))
