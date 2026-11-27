import math
import re
import unicodedata
from collections import Counter

from django.db.models import F
from django.http import JsonResponse

from accounts.models import User
from accounts.observer_auth import endpoint, error, validation
from accounts.observer_credentials import rate_limit
from reports.incident_input import field
from reports.structured_input import clean_text

from .models import AnswerCount, ApprovedDocument

LANGUAGES = ("en", "pcm", "ha", "yo", "ig")


# Everyday English words carry no meaning for matching; other languages are matched on every word.
STOP_WORDS = frozenset("a an the i me my you your we our is are am was be do does did how what when where which who can could "
                       "should would of to in on at for with and or it its this that there if as by from have has had not".split())


def words(text):
    folded = unicodedata.normalize("NFKD", text.casefold())
    found = re.findall(r"[^\W_]+", "".join(c for c in folded if not unicodedata.combining(c)))
    return Counter(word for word in found if word not in STOP_WORDS)


def slugify(text):
    folded = unicodedata.normalize("NFKD", text.casefold())
    return re.sub(r"[^a-z0-9]+", "-", "".join(c for c in folded if not unicodedata.combining(c))).strip("-") or "section"


def blocks(body):
    """Split a guide into (heading, text) blocks: a block is the lines between blank lines or headings."""
    heading, lines, out = "", [], []

    def flush():
        text = "\n".join(lines).strip()
        if text:
            out.append((heading, text))
        lines.clear()

    for line in body.splitlines():
        match = re.match(r"#{1,6}\s+(.*\S)\s*$", line)
        if match:
            flush()
            heading = match.group(1)
        elif not line.strip():
            flush()
        else:
            lines.append(line)
    flush()
    return out


def retrieve(question, documents):
    query = words(question)
    candidates = []
    for document in documents:
        for heading, text in blocks(document.body):
            candidates.append((heading, text, document, words(f"{heading}\n{text}")))
    frequency = Counter(word for *_, bag in candidates for word in bag)

    def vector(bag):
        return {word: (1 + math.log(count)) * (1 + math.log((1 + len(candidates)) / (1 + frequency[word])))
                for word, count in bag.items()}

    query = vector(query)
    norm = math.hypot(*query.values())
    if not norm:
        return []
    results = []
    for heading, passage, document, bag in candidates:
        weights = vector(bag)
        denominator = norm * math.hypot(*weights.values())
        if not denominator:
            continue
        score = sum(value * weights.get(word, 0) for word, value in query.items()) / denominator
        if score >= 0.2:
            source = {**document.source, "title": document.title, "language": document.language}
            if heading:
                source["section"] = heading
                if str(source.get("url", "")).startswith("/guide/"):
                    source["url"] = source["url"].split("#")[0] + "#" + slugify(heading)
            results.append({"text": passage, "source": source, "score": round(score, 4)})
    return sorted(results, key=lambda item: -item["score"])[:3]


def guide_slug(document):
    document_id = str(document.source.get("document_id", ""))
    return document_id[len("guide-"):] if document_id.startswith("guide-") else None


def guide_summary(document, language):
    version = document.source.get("version", "")
    return {"slug": guide_slug(document), "document_id": document.source.get("document_id"), "title": document.title,
            "version": version, "language": document.language, "fallback_language_used": document.language != language,
            "approved_on": f"{version}-01" if re.fullmatch(r"\d{4}-\d{2}", version) else None}


def guide_documents(request):
    """The public guides in the requested language, with English filling any page not yet translated."""
    language = request.GET.get("language")
    if language not in LANGUAGES:
        language = "en"
    documents = {}
    for item in ApprovedDocument.objects.filter(observer_only=False, language__in={language, "en"}).order_by("pk"):
        slug = guide_slug(item)
        if slug and (slug not in documents or item.language == language):
            documents[slug] = item
    return language, documents


@endpoint("GET")
def guides(request):
    language, documents = guide_documents(request)
    return JsonResponse({"language": language, "documents": [
        guide_summary(item, language) for _, item in sorted(documents.items(), key=lambda pair: pair[1].title)]})


@endpoint("GET")
def guide(request, slug):
    language, documents = guide_documents(request)
    document = documents.get(slug)
    if document is None:
        return error(404, "not_found", "This guide is not available.")
    sections = []
    for heading, text in blocks(document.body):
        if sections and sections[-1]["heading"] == heading:
            sections[-1]["body"] += "\n\n" + text
        else:
            sections.append({"id": slugify(heading or document.title), "heading": heading or document.title, "body": text})
    return JsonResponse({**guide_summary(document, language), "sections": sections})


@endpoint("POST", max_body_bytes=8192)
def ask(request, data):
    address = request.session.session_key or request.META.get("REMOTE_ADDR", "")
    retry = rate_limit("ask", address, 20, 60)
    if retry is not None:
        return error(429, "rate_limited", "Try again later.", retry=retry)
    errors = {}
    question = clean_text(data.get("question"), 3, 500)
    language = data.get("language")
    audience = data.get("audience")
    if question is None:
        errors["question"] = field("invalid", "Enter a question of 3 to 500 characters.")
    if language not in LANGUAGES:
        errors["language"] = field("invalid_choice", "Choose a supported language.")
    if audience not in ("public", "observer"):
        errors["audience"] = field("invalid_choice", "Choose an audience.")
    if errors:
        return validation(errors)
    documents = ApprovedDocument.objects.order_by("pk")
    if not (audience == "observer" and request.user.is_authenticated and request.user.role == User.Role.OBSERVER):
        documents = documents.filter(observer_only=False)
    passages = retrieve(question, documents.filter(language=language))
    if not passages and language != "en":
        passages = retrieve(question, documents.filter(language="en"))
    status = "answered" if passages else "abstained"
    count, _ = AnswerCount.objects.get_or_create(language=language, status=status)
    AnswerCount.objects.filter(pk=count.pk).update(count=F("count") + 1)
    return JsonResponse({"status": status, "language": language, "passages": passages,
                         "fallback_language_used": bool(passages and passages[0]["source"]["language"] != language)})
