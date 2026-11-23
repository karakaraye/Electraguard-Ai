"""Check ElectraGuard data without modifying the selected PostgreSQL database."""

import argparse
from collections import Counter
from hashlib import file_digest, sha256
import json
from pathlib import Path
import sys

import psycopg


GROUPS = {
    "report_statuses": ("reports_report", "status"),
    "review_actions": ("reports_reviewevent", "action"),
    "evidence_types": ("reports_evidence", "content_type"),
    "triage_statuses": ("reports_triage", "status"),
    "match_decisions": ("reports_triagematch", "decision"),
    "offboarding_reasons": ("accounts_accountoffboarding", "reason"),
}
ALLOWED = {
    "report_statuses": ("submitted", "in_review", "needs_clarification", "closed", "withdrawn"),
    "review_actions": (
        "assign", "start", "request_clarification", "respond", "close",
        "correct_category", "decide_match", "create", "withdraw", "remove_media",
        "accept_suggestion", "correct_suggestion", "redact",
    ),
    "evidence_types": ("image/jpeg", "image/png"),
    "triage_statuses": ("pending", "ready", "failed"),
    "match_decisions": ("pending", "confirmed", "dismissed"),
    "offboarding_reasons": ("access_ended", "role_changed", "credential_risk"),
}
ROLES = ("", "observer", "reviewer", "administrator")
OUTCOMES = ("corroborated", "insufficient_evidence", "out_of_scope")
ORPHAN_CHECKS = (
    ("reports_report", "observer_id", "accounts_user", "id"),
    ("reports_report", "assigned_reviewer_id", "accounts_user", "id"),
    ("reports_evidence", "report_id", "reports_report", "reference"),
    ("reports_reviewevent", "report_id", "reports_report", "reference"),
    ("reports_reviewevent", "actor_id", "accounts_user", "id"),
    ("reports_triage", "report_id", "reports_report", "reference"),
    ("reports_triagematch", "first_id", "reports_report", "reference"),
    ("reports_triagematch", "second_id", "reports_report", "reference"),
    ("accounts_accountoffboarding", "account_id", "accounts_user", "id"),
    ("accounts_accountoffboarding", "authorized_by_id", "accounts_user", "id"),
)


def check_closures(connection, counts, errors):
    outcomes = Counter()
    legacy = 0
    with connection.cursor(name="verify_closures") as cursor:
        cursor.execute("""
            SELECT event.change, ARRAY(
                SELECT evidence.id::text FROM reports_evidence evidence
                WHERE evidence.report_id = event.report_id
            )
            FROM reports_reviewevent event
            WHERE event.action = 'close'
        """)
        for change, actual in cursor:
            if not isinstance(change, dict):
                errors["invalid_closure_content"] += 1
                continue
            outcome = change.get("outcome")
            outcomes[outcome if outcome in OUTCOMES else "unavailable"] += 1
            note = change.get("note")
            if (
                change.get("from_status") not in ("in_review", "needs_clarification")
                or change.get("to_status") != "closed"
                or not isinstance(note, str)
                or not note.strip()
            ):
                errors["invalid_closure_content"] += 1
            if "attachment_ids" not in change:
                legacy += 1
                continue
            snapshot = change["attachment_ids"]
            if (
                not isinstance(snapshot, list)
                or any(not isinstance(value, str) for value in snapshot)
                or sorted(snapshot) != sorted(actual)
            ):
                errors["invalid_closure_snapshot"] += 1
    counts["closed_outcomes"] = dict(outcomes)
    counts["legacy_closures_without_snapshot"] = legacy


def check_private_photos(connection, root, counts, errors):
    with connection.cursor() as cursor:
        cursor.execute("SELECT to_regclass('reports_mediaitem')")
        if cursor.fetchone()[0] is None:
            return

    root = root.resolve() if root else None
    counts["private_photos"] = 0
    with connection.cursor(name="verify_private_photos") as cursor:
        cursor.execute("""
            SELECT photo.id, photo.organisation_id, photo.size_bytes, photo.sha256, report.organisation_id
            FROM reports_mediaitem photo
            JOIN reports_report report ON report.reference = photo.report_id
        """)
        for media_id, organisation, size, expected, report_organisation in cursor:
            counts["private_photos"] += 1
            if organisation != report_organisation:
                errors["private_photo_organisation_mismatches"] += 1
            if root is None:
                errors["private_media_root_required"] += 1
                continue
            path = root / str(organisation) / "photos" / f"{media_id}.jpg"
            try:
                if path.resolve() != path or not path.is_file():
                    raise OSError
                with path.open("rb") as photo:
                    digest = file_digest(photo, "sha256").hexdigest()
                    actual_size = photo.tell()
            except OSError:
                errors["private_photo_missing_or_unreadable"] += 1
                continue
            if actual_size != size or digest != expected:
                errors["private_photo_integrity_mismatches"] += 1


def verify(connection, private_media_root=None):
    counts = {}
    errors = Counter()
    with connection.cursor() as cursor:
        for label, (table, column) in GROUPS.items():
            cursor.execute(f"SELECT {column}, count(*) FROM {table} GROUP BY {column}")
            known = {}
            for value, total in cursor:
                if value in ALLOWED[label]:
                    known[value] = total
                else:
                    errors[f"invalid_{label}"] += total
            counts[label] = known

        cursor.execute("SELECT role, is_active, count(*) FROM accounts_user GROUP BY role, is_active")
        roles = {}
        for role, active, total in cursor:
            if role in ROLES:
                roles[f"{role or 'unassigned'}:{'active' if active else 'inactive'}"] = total
            else:
                errors["invalid_account_roles"] += total
        counts["accounts_by_role"] = roles
        cursor.execute("SELECT count(*) FROM accounts_user WHERE is_staff OR is_superuser")
        counts["django_privileged_accounts"] = cursor.fetchone()[0]

        for child, column, parent, key in ORPHAN_CHECKS:
            cursor.execute(f"""
                SELECT count(*) FROM {child} child
                LEFT JOIN {parent} parent ON child.{column} = parent.{key}
                WHERE child.{column} IS NOT NULL AND parent.{key} IS NULL
            """)
            errors["orphaned_core_relationships"] += cursor.fetchone()[0]

        cursor.execute("""
            SELECT count(*) FROM reports_report report
            LEFT JOIN accounts_user owner ON owner.id = report.observer_id
            LEFT JOIN accounts_user reviewer ON reviewer.id = report.assigned_reviewer_id
            WHERE (report.observer_id IS NOT NULL AND owner.role <> 'observer') OR reviewer.role <> 'reviewer'
        """)
        errors["invalid_report_roles"] = cursor.fetchone()[0]

        cursor.execute("""
            SELECT count(*) FROM reports_report report
            LEFT JOIN (
                SELECT report_id, count(*) AS total, min(version) AS first,
                       max(version) AS last, count(DISTINCT version) AS unique_versions,
                       count(*) FILTER (WHERE action = 'close') AS closures,
                       min(version) FILTER (WHERE action = 'create') AS creation
                FROM reports_reviewevent GROUP BY report_id
            ) events ON events.report_id = report.reference
            WHERE report.version <> coalesce(events.last, 0)
               OR events.first IS DISTINCT FROM CASE
                   WHEN events.total IS NULL THEN NULL WHEN events.creation = 0 THEN 0 ELSE 1 END
               OR events.last - events.first + 1 <> events.unique_versions
               OR coalesce(events.closures, 0) <> CASE WHEN report.status = 'closed' THEN 1 ELSE 0 END
        """)
        errors["invalid_audit_versions_or_closure_count"] = cursor.fetchone()[0]

        cursor.execute("""
            SELECT count(*) FROM reports_reviewevent event
            LEFT JOIN accounts_user actor ON actor.id = event.actor_id
            JOIN reports_report report ON report.reference = event.report_id
            WHERE (event.action = 'assign' AND actor.role IS DISTINCT FROM 'administrator')
               OR (event.action IN ('respond', 'create', 'withdraw', 'remove_media')
                   AND event.actor_id IS DISTINCT FROM report.observer_id)
               OR (event.action NOT IN ('assign', 'respond', 'create', 'withdraw', 'remove_media')
                   AND actor.role IS DISTINCT FROM 'reviewer')
               OR (event.action = 'close' AND actor.id IS DISTINCT FROM report.assigned_reviewer_id)
        """)
        errors["invalid_audit_actors"] = cursor.fetchone()[0]

    with connection.cursor(name="verify_evidence") as cursor:
        cursor.itersize = 16
        cursor.execute("SELECT content, sha256 FROM reports_evidence")
        for content, expected in cursor:
            if sha256(content).hexdigest() != expected:
                errors["evidence_hash_mismatches"] += 1

    check_closures(connection, counts, errors)
    check_private_photos(connection, private_media_root, counts, errors)
    return {"counts": counts, "integrity_errors": {key: value for key, value in errors.items() if value}}


def main():
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument("--database", required=True, help="Explicit PostgreSQL database name.")
    parser.add_argument("--compare", type=Path, help="Compare counts with an earlier aggregate verification JSON.")
    parser.add_argument("--private-media-root", type=Path, help="Restored private media directory.")
    args = parser.parse_args()
    try:
        with psycopg.connect(dbname=args.database, connect_timeout=5) as connection:
            connection.execute("SET TRANSACTION ISOLATION LEVEL REPEATABLE READ READ ONLY")
            result = verify(connection, args.private_media_root)
    except psycopg.Error as error:
        print(f"Restore verification could not read the expected database schema ({type(error).__name__}).", file=sys.stderr)
        return 2

    if args.compare:
        try:
            baseline = json.loads(args.compare.read_text(encoding="utf-8-sig"))
            expected = baseline["counts"]
            if not isinstance(expected, dict) or baseline["integrity_errors"] or baseline.get("count_differences"):
                raise ValueError
        except (OSError, ValueError, KeyError, TypeError):
            print("Provide a readable verification baseline with no integrity errors or count differences.", file=sys.stderr)
            return 2
        result["count_differences"] = sorted(
            key for key in expected.keys() | result["counts"].keys()
            if expected.get(key) != result["counts"].get(key)
        )

    print(json.dumps(result, indent=2, sort_keys=True))
    return 1 if result["integrity_errors"] or result.get("count_differences") else 0


if __name__ == "__main__":
    sys.exit(main())
