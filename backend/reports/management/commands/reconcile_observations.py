import json
from collections import Counter
from datetime import date

from django.core.management.base import BaseCommand, CommandError
from django.db import connection

from reports.models import Report, Triage


class Command(BaseCommand):
    help = "Recompute internal aggregate dashboard totals from PostgreSQL for a WAT date range."

    def add_arguments(self, parser):
        parser.add_argument("--start", required=True, type=date.fromisoformat)
        parser.add_argument("--end", required=True, type=date.fromisoformat)

    def handle(self, *args, **options):
        start, end = options["start"], options["end"]
        if start > end:
            raise CommandError("The first WAT date must be on or before the last WAT date.")

        with connection.cursor() as cursor:
            cursor.execute(
                """
                SELECT report.status,
                       COALESCE(NULLIF(triage.corrected_category, ''), NULLIF(triage.category, ''), 'uncategorized'),
                       closure.outcome,
                       COUNT(*)
                FROM reports_report AS report
                LEFT JOIN reports_triage AS triage ON triage.report_id = report.reference
                LEFT JOIN LATERAL (
                    SELECT event.change->>'outcome' AS outcome
                    FROM reports_reviewevent AS event
                    WHERE report.status = 'closed'
                      AND event.report_id = report.reference
                      AND event.action = 'close'
                    ORDER BY event.version DESC
                    LIMIT 1
                ) AS closure ON true
                WHERE (report.occurred_at AT TIME ZONE 'Africa/Lagos')::date BETWEEN %s AND %s
                GROUP BY 1, 2, 3
                """,
                [start, end],
            )
            rows = cursor.fetchall()

        statuses = Counter()
        categories = Counter()
        outcomes = Counter()
        for status, category, outcome, count in rows:
            statuses[status] += count
            categories[category] += count
            if status == Report.Status.CLOSED:
                key = outcome if outcome in Report.Outcome.values else "unrecorded"
                outcomes[key] += count
        result = {
            "report_count": statuses.total(),
            "statuses": breakdown(statuses, Report.Status.choices),
            "outcomes": breakdown(outcomes, [*Report.Outcome.choices, ("unrecorded", "Outcome unavailable")]),
            "categories": breakdown(categories, [*Triage.Category.choices, ("uncategorized", "Uncategorized")]),
        }
        self.stdout.write(json.dumps(result, indent=2))


def breakdown(counts, choices):
    return [{"label": label, "count": counts[value]} for value, label in choices]
