from django.db import migrations, models


class Migration(migrations.Migration):
    dependencies = [("reports", "0011_report_observer_read_version_and_more")]
    operations = [
        migrations.AddField("evidence", "purpose", models.CharField(default="evidence", max_length=8)),
    ]
