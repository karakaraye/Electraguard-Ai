from django.db import migrations, models


class Migration(migrations.Migration):
    initial = True
    dependencies = []
    operations = [
        migrations.CreateModel(
            name="ApprovedDocument",
            fields=[
                ("id", models.BigAutoField(primary_key=True, serialize=False, auto_created=True, verbose_name="ID")),
                ("language", models.CharField(db_index=True, max_length=3)),
                ("title", models.CharField(max_length=200)),
                ("body", models.TextField()),
                ("source", models.JSONField()),
                ("observer_only", models.BooleanField(default=False)),
            ],
        ),
        migrations.CreateModel(
            name="AnswerCount",
            fields=[
                ("id", models.BigAutoField(primary_key=True, serialize=False, auto_created=True, verbose_name="ID")),
                ("language", models.CharField(max_length=3)),
                ("status", models.CharField(max_length=9)),
                ("count", models.PositiveBigIntegerField(default=0)),
            ],
            options={"unique_together": {("language", "status")}},
        ),
    ]
