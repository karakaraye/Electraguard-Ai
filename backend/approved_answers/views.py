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


def words(text):
    folded = unicodedata.normalize("NFKD", text.casefold())
    return Counter(re.findall(r"[^\W_]+", "".join(c for c in folded if not unicodedata.combining(c))))


def retrieve(question, documents):
    query = words(question)
    candidates = [(p, document, words(p)) for document in documents
                  for p in re.split(r"\n[ \t]*\n", document.body) if p.strip()]
    frequency = Counter(word for _, _, bag in candidates for word in bag)

    def vector(bag):
        return {word: (1 + math.log(count)) * (1 + math.log((1 + len(candidates)) / (1 + frequency[word])))
                for word, count in bag.items()}

    query = vector(query)
    norm = math.hypot(*query.values())
    if not norm:
        return []
    results = []
    for passage, document, bag in candidates:
        weights = vector(bag)
        denominator = norm * math.hypot(*weights.values())
        if not denominator:
            continue
        score = sum(value * weights.get(word, 0) for word, value in query.items()) / denominator
        if score >= 0.35:
            results.append({"text": passage, "source": {
                **document.source, "title": document.title, "language": document.language,
            }, "score": round(score, 4)})
    return sorted(results, key=lambda item: -item["score"])[:3]


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
