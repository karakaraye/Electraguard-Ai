from django.core.management.base import BaseCommand, CommandError
from django.db import transaction
from django.utils import timezone
from sklearn.metrics import mean_absolute_error

from accounts.models import Organisation
from intelligence.learning import logistics_features, logistics_model
from intelligence.models import MaterialsRisk


class Command(BaseCommand):
    help = "Refresh synthetic late-materials risk suggestions for one organisation."

    def add_arguments(self, parser):
        parser.add_argument("organisation", help="Organisation primary key")

    @transaction.atomic
    def handle(self, *args, **options):
        organisation = Organisation.objects.select_for_update().filter(pk=options["organisation"]).first()
        if organisation is None:
            raise CommandError("Unknown organisation.")
        model, rows, test = logistics_model()
        predict = lambda samples: model.predict([logistics_features(row) for row in samples])
        mae = mean_absolute_error([float(row["transit_hours"]) for row in test], predict(test))
        metrics = {"mae_transit_hours": round(float(mae), 3), "evaluated_on": "held-out 20%"}
        now = timezone.now()
        rankings = sorted(zip(predict(rows), rows), key=lambda item: (-item[0], item[1]["pu_id"]))
        by_unit = {}
        for hours, row in rankings:
            code = row["pu_id"]
            by_unit.setdefault(code, MaterialsRisk(
                organisation=organisation, polling_unit_code=code, state_code=row["state"],
                generated_at=now, metrics=metrics,
                prediction={
                    "lga_code": row["lga"], "lga_name": row["lga"], "ward_code": row["ward"],
                    "ward_name": row["ward"], "polling_unit_code": code,
                    "predicted_transit_hours": round(float(hours), 2),
                    "risk": "high" if hours >= 5 else "medium" if hours >= 3 else "low",
                    "factors": ["distance_from_hub", "settlement", "dispatch_hour"],
                },
            ))
        MaterialsRisk.objects.filter(organisation=organisation).delete()
        MaterialsRisk.objects.bulk_create(by_unit.values())
        self.stdout.write(f"Wrote {len(by_unit)} polling-unit risk rows.")
