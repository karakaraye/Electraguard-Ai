from django.db import migrations


def queue_existing_reports(apps, schema_editor):
    Report = apps.get_model("reports", "Report")
    Triage = apps.get_model("reports", "Triage")
    database = schema_editor.connection.alias
    batch = []
    for reference in Report.objects.using(database).values_list("pk", flat=True).iterator():
        batch.append(Triage(report_id=reference, method_version="local-lexical-v1"))
        if len(batch) == 500:
            Triage.objects.using(database).bulk_create(batch, ignore_conflicts=True)
            batch.clear()
    Triage.objects.using(database).bulk_create(batch, ignore_conflicts=True)


class Migration(migrations.Migration):
    dependencies = [
        ("reports", "0003_alter_report_occurred_at_alter_reviewevent_action_and_more"),
    ]

    operations = [migrations.RunPython(queue_existing_reports, migrations.RunPython.noop)]
