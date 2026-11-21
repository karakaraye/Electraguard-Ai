from django.db import migrations, models


class Migration(migrations.Migration):
    dependencies = [("reports", "0004_queue_existing_reports")]

    operations = [
        migrations.AddField(
            model_name="report",
            name="polling_unit_code",
            field=models.CharField(blank=True, default="", max_length=32),
        ),
    ]
