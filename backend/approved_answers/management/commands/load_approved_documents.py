import json
from pathlib import Path

from django.core.management.base import BaseCommand, CommandError
from django.db import transaction

from approved_answers.models import ApprovedDocument
from approved_answers.views import LANGUAGES


class Command(BaseCommand):
    help = "Load Markdown with a JSON metadata object between leading --- delimiter lines."

    def add_arguments(self, parser):
        parser.add_argument("folder", type=Path)

    @transaction.atomic
    def handle(self, folder, **options):
        if not folder.is_dir():
            raise CommandError("Choose an approved documents folder.")
        for path in sorted(folder.glob("*.md")):
            try:
                start, header, body = path.read_text(encoding="utf-8").split("---\n", 2)
                metadata = json.loads(header)
                source = {key: metadata[key] for key in ("document_id", "section", "version", "url")}
                language, title = metadata["language"], metadata["title"]
                restricted = metadata.get("observer_only", False)
                if (start or language not in LANGUAGES or not isinstance(title, str) or not 1 <= len(title) <= 200
                        or not body.strip() or type(restricted) is not bool
                        or any(not isinstance(value, str) or not value for value in source.values())):
                    raise ValueError
            except (ValueError, KeyError, TypeError, AttributeError, OSError) as exc:
                raise CommandError(f"Invalid approved document: {path.name}") from exc
            ApprovedDocument.objects.update_or_create(
                language=language, source__document_id=source["document_id"], source__section=source["section"],
                defaults={"title": title, "body": body, "source": source, "observer_only": restricted},
            )
