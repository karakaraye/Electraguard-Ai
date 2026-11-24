from django.db import models


class ApprovedDocument(models.Model):
    language = models.CharField(max_length=3, db_index=True)
    title = models.CharField(max_length=200)
    body = models.TextField()
    source = models.JSONField()
    observer_only = models.BooleanField(default=False)


class AnswerCount(models.Model):
    language = models.CharField(max_length=3)
    status = models.CharField(max_length=9)
    count = models.PositiveBigIntegerField(default=0)

    class Meta:
        unique_together = [("language", "status")]
