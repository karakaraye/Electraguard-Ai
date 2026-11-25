"""Multilingual claim matching over coordinator-approved responses (with TF-IDF fallback)."""

from functools import lru_cache

from django.conf import settings
from sklearn.feature_extraction.text import TfidfVectorizer
from sklearn.metrics.pairwise import cosine_similarity
from sklearn.pipeline import FeatureUnion

from .models import Claim

EMBEDDING_MODEL_NAME = "paraphrase-multilingual-MiniLM-L12-v2"


@lru_cache(maxsize=1)
def _embedding_model():
    """Load local multilingual sentence-transformer if installed; never makes network calls."""
    try:
        from sentence_transformers import SentenceTransformer

        return SentenceTransformer(EMBEDDING_MODEL_NAME, local_files_only=True)
    except Exception:
        return None


def _score_texts(query: str, texts: list[str]) -> list[float]:
    if not query.strip() or not texts:
        return [0.0] * len(texts)

    model = _embedding_model()
    if model is not None:
        embeddings = model.encode([query, *texts], normalize_embeddings=True)
        q_vec = embeddings[0:1]
        c_vecs = embeddings[1:]
        sims = (q_vec @ c_vecs.T)[0]
        return [float(s) for s in sims]

    # TF-IDF fallback combining word and character n-grams for multilingual robustness
    vec = FeatureUnion([
        ("word", TfidfVectorizer(ngram_range=(1, 2), sublinear_tf=True, lowercase=True)),
        ("char", TfidfVectorizer(analyzer="char_wb", ngram_range=(3, 5), sublinear_tf=True, lowercase=True)),
    ])
    matrix = vec.fit_transform([query, *texts])
    sims = cosine_similarity(matrix[0:1], matrix[1:])[0]
    return [float(s) for s in sims]


def match_threshold() -> float:
    return float(getattr(settings, "COMMUNITY_MATCH_THRESHOLD", 0.35))


def match_candidates(query: str, claims: list[Claim], threshold: float | None = None):
    """Return (best_claim, best_score, matched_bool) over the given claims."""
    if threshold is None:
        threshold = match_threshold()
    candidates = [c for c in claims if (c.text or "").strip()]
    if not query or not query.strip() or not candidates:
        return None, 0.0, False

    scores = _score_texts(query, [c.text for c in candidates])
    best_idx = max(range(len(candidates)), key=lambda i: scores[i])
    best_claim = candidates[best_idx]
    best_score = round(scores[best_idx], 4)
    if best_score < threshold:
        return best_claim, best_score, False
    return best_claim, best_score, True


def match_approved(query: str, organisation_id, threshold: float | None = None):
    """Match against coordinator-approved claims ONLY. Never returns an unapproved verdict."""
    approved = list(
        Claim.objects.filter(organisation_id=organisation_id, status="response_approved").order_by("-created_at")
    )
    claim, score, matched = match_candidates(query, approved, threshold=threshold)
    if not matched:
        return None, score
    return claim, score


def match_existing(query: str, organisation_id, threshold: float | None = None):
    """Match against any existing claim in the organisation (for CHK-02 deduplication)."""
    existing = list(Claim.objects.filter(organisation_id=organisation_id).order_by("-created_at"))
    claim, score, matched = match_candidates(query, existing, threshold=threshold)
    if not matched:
        return None, score
    return claim, score
