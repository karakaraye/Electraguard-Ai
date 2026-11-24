from django.core.management.base import BaseCommand
from django.db import transaction

from discussions.models import Post
from privacy.redactor import redact
from reports.models import CitizenReply, Report


class Command(BaseCommand):
    help = "Redacts existing unredacted reports, citizen replies, and discussion posts in batches."

    def add_arguments(self, parser):
        parser.add_argument(
            "--batch-size",
            type=int,
            default=500,
            help="Number of records per batch (default: 500).",
        )
        parser.add_argument(
            "--dry-run",
            action="store_true",
            help="Simulate redactions without saving to database.",
        )

    def handle(self, *args, **options):
        batch_size = options["batch_size"]
        dry_run = options["dry_run"]

        self.stdout.write(f"Starting redaction of existing records (batch size: {batch_size}, dry_run: {dry_run})...")

        # 1. Reports
        report_count = 0
        report_qs = (
            Report.objects.filter(auto_redacted_description__isnull=True)
            .exclude(description="")
            .order_by("pk")
        )
        total_reports = report_qs.count()
        self.stdout.write(f"Found {total_reports} unredacted reports.")

        offset = 0
        while True:
            batch = list(report_qs[offset : offset + batch_size])
            if not batch:
                break

            to_update = []
            for report in batch:
                res = redact(report.description, report.organisation_id)
                report.auto_redacted_description = res.text
                report.auto_redactions = res.spans
                to_update.append(report)

            if not dry_run:
                with transaction.atomic():
                    Report.objects.bulk_update(
                        to_update, ["auto_redacted_description", "auto_redactions"]
                    )
            report_count += len(to_update)
            offset += len(batch)
            self.stdout.write(f"  Processed {report_count}/{total_reports} reports.")

        # 2. Citizen Replies
        reply_count = 0
        reply_qs = (
            CitizenReply.objects.filter(auto_redacted_body="")
            .exclude(body="")
            .order_by("pk")
        )
        total_replies = reply_qs.count()
        if total_replies:
            self.stdout.write(f"Found {total_replies} unredacted citizen replies.")
            offset = 0
            while True:
                batch = list(reply_qs[offset : offset + batch_size])
                if not batch:
                    break

                to_update = []
                for reply in batch:
                    res = redact(reply.body, reply.organisation_id)
                    reply.auto_redacted_body = res.text
                    reply.auto_redactions = res.spans
                    to_update.append(reply)

                if not dry_run:
                    with transaction.atomic():
                        CitizenReply.objects.bulk_update(
                            to_update, ["auto_redacted_body", "auto_redactions"]
                        )
                reply_count += len(to_update)
                offset += len(batch)
                self.stdout.write(f"  Processed {reply_count}/{total_replies} citizen replies.")

        # 3. Discussion Posts
        post_count = 0
        post_qs = (
            Post.objects.filter(auto_redacted_body="")
            .exclude(body="")
            .select_related("discussion")
            .order_by("pk")
        )
        total_posts = post_qs.count()
        if total_posts:
            self.stdout.write(f"Found {total_posts} unredacted discussion posts.")
            offset = 0
            while True:
                batch = list(post_qs[offset : offset + batch_size])
                if not batch:
                    break

                to_update = []
                for post in batch:
                    res = redact(post.body, post.discussion.organisation_id)
                    post.auto_redacted_body = res.text
                    post.auto_redactions = res.spans
                    to_update.append(post)

                if not dry_run:
                    with transaction.atomic():
                        Post.objects.bulk_update(
                            to_update, ["auto_redacted_body", "auto_redactions"]
                        )
                post_count += len(to_update)
                offset += len(batch)
                self.stdout.write(f"  Processed {post_count}/{total_posts} discussion posts.")

        self.stdout.write(
            self.style.SUCCESS(
                f"Completed: redacted {report_count} reports, {reply_count} citizen replies, {post_count} discussion posts."
            )
        )
