from functools import wraps
from hashlib import sha256

from django.db import OperationalError
from django.db.models import F, Func, JSONField, Value
from django.http import HttpResponse, HttpResponseNotModified, JsonResponse
from django.utils.cache import add_never_cache_headers
from django.utils.http import parse_etags

from accounts.models import User
from accounts.observer_auth import endpoint, error
from accounts.organisations import org_scope

from .documents import encode_document
from .models import AreaDataset

CACHE_CONTROL = "public, max-age=86400, stale-while-revalidate=604800"


def cached_document(request, document):
    content = encode_document(document)
    etag = f'"{sha256(content).hexdigest()}"'
    matches = parse_etags(request.headers.get("If-None-Match", ""))
    if "*" in matches or any(candidate.removeprefix("W/") == etag for candidate in matches):
        response = HttpResponseNotModified()
    else:
        response = HttpResponse(content, content_type="application/json")
    response["Cache-Control"] = CACHE_CONTROL
    response["ETag"] = etag
    return response


def public_document(view):
    @wraps(view)
    def wrapped(request, *args, **kwargs):
        if request.method != "GET":
            response = error(405, "method_not_allowed", "This method is not available.")
            response["Allow"] = "GET"
        else:
            try:
                response = view(request, *args, **kwargs)
            except OperationalError:
                response = error(503, "service_unavailable", "The reference list is temporarily unavailable.")
        if response.status_code >= 400:
            add_never_cache_headers(response)
        return response
    return wrapped


@public_document
def area_index(request):
    document = AreaDataset.objects.values_list("index", flat=True).first()
    if document is None:
        return error(503, "service_unavailable", "The reference list has not been loaded.")
    return cached_document(request, document)


@public_document
def area_state(request, state_code):
    state = Func(F("states"), Value(state_code), function="jsonb_extract_path", output_field=JSONField())
    document = AreaDataset.objects.values_list(state, flat=True).first()
    if document is None:
        return error(404, "not_found", "We could not find that state.")
    return cached_document(request, document)


@endpoint("GET")
def public_settings(request):
    if not request.user.is_authenticated:
        return error(401, "not_authenticated", "Sign in to continue.")
    if request.user.role != User.Role.OBSERVER:
        return error(403, "forbidden", "Your role cannot do this.")
    organisation = org_scope(request).get()
    return JsonResponse({
        "coverage_area": {
            "state_codes": organisation.coverage_state_codes,
            "lga_codes": organisation.coverage_lga_codes,
        },
        "party_labels": organisation.party_labels,
    })
