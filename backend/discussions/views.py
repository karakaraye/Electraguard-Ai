import re
from datetime import datetime, time, timedelta

from django.http import JsonResponse
from django.db import transaction
from django.db.models import Q
from django.utils import timezone

from accounts.models import ObserverCode, User
from accounts.observer_auth import endpoint, error, validation, wat
from accounts.observer_credentials import normalize_code, rate_limit
from accounts.organisations import org_scope
from reference.models import AreaDataset, KnownPollingUnit, resolve_place
from reports.conversation import uuid_text
from reports.idempotency import idempotent
from reports.incident_input import WAT, aware_datetime, field
from reports.structured_input import clean_text
from reports.v1_views import missing

from .models import Discussion, Flag, Membership, ModerationAction, Post, RequestRecord

REASONS = ("names_a_person", "too_specific_location", "abusive", "other")
VISIBLE = ("invited", "member")


def permission(request, moderator=False):
    if not request.user.is_authenticated:
        return error(401, "not_authenticated", "Sign in to continue.")
    allowed = (User.Role.MODERATOR,) if moderator else (User.Role.MODERATOR, User.Role.OBSERVER)
    if not any(request.user.has_role(role) for role in allowed):
        return error(403, "forbidden", "Your role cannot do this.")
    return None


def moderator(request):
    return request.user.has_role(User.Role.MODERATOR)


def closed(discussion):
    return discussion.closed or discussion.closes_at <= timezone.now()


def closed_error():
    return error(409, "discussion_closed", "This discussion has closed.")


def invalid(key, message, code="invalid"):
    return validation({key: field(code, message)})


def get_thread(request, discussion_id, lock=False):
    queryset = org_scope(request, Discussion)
    if lock:
        queryset = queryset.select_for_update()
    discussion = queryset.filter(pk=discussion_id).first()
    member = None
    if discussion and not moderator(request):
        member = discussion.memberships.filter(observer__user=request.user,
                                               observer__organisation_id=discussion.organisation_id).first()
    return discussion, member


def display(request, discussion, member=None, *, summary=False):
    result = dict(id=str(discussion.pk), title=discussion.title, area=discussion.area,
                  status="closed" if closed(discussion) else "open",
                  membership=member.state if member else "moderator",
                  closes_at=wat(discussion.closes_at))
    if member is None or member.state == "member":
        result["topic"] = discussion.topic
    if summary:
        posts = discussion.posts.order_by("-pk")
        latest = posts.first()
        result.update(member_count=discussion.memberships.filter(state="member").count(),
                      unread_posts=posts.filter(pk__gt=member.read_through, hidden_reason="").exclude(author=member).count()
                      if member and member.state == "member" else 0,
                      last_post_at=wat(latest.created_at) if latest and (not member or member.state == "member") else None)
    return result


def post_display(request, post):
    hidden = bool(post.hidden_reason)
    result = dict(id=str(post.public_id), author_label="Moderator" if hidden else post.author.observer.code,
                  is_me=post.author.observer.user_id == request.user.pk, body=None if hidden else post.body,
                  state="hidden" if hidden else "visible", created_at=wat(post.created_at))
    if moderator(request):
        result.update(hidden_body=post.body if hidden else None, hidden_reason=post.hidden_reason or None,
                      flag_count=post.flags.count())
    return result


def page_size(request):
    try:
        limit = int(request.GET.get("limit", 50))
        return limit if 1 <= limit <= 100 else None
    except ValueError:
        return None


@endpoint("GET")
def list_threads(request):
    blocked = permission(request)
    if blocked is not None:
        return blocked
    limit = page_size(request)
    state, cursor = request.GET.get("status", ""), request.GET.get("cursor")
    if limit is None or state not in ("", "open", "closed") or (cursor and not uuid_text(cursor)):
        return invalid("pagination", "Use a valid status, cursor and limit.")
    queryset = org_scope(request, Discussion).order_by("-pk")
    if not moderator(request):
        queryset = queryset.filter(memberships__observer__user=request.user, memberships__state__in=VISIBLE,
                                   memberships__observer__organisation_id=request.user.organisation_id)
    expired = Q(closed=True) | Q(closes_at__lte=timezone.now())
    if state:
        queryset = queryset.filter(expired if state == "closed" else ~expired)
    if cursor:
        queryset = queryset.filter(pk__lt=cursor)
    page = list(queryset[:limit + 1])
    items = [display(request, discussion, discussion.memberships.filter(observer__user=request.user).first()
                     if not moderator(request) else None, summary=True) for discussion in page[:limit]]
    return JsonResponse({"items": items, "next_cursor": str(page[limit - 1].pk) if len(page) > limit else None})


@endpoint("GET")
@transaction.atomic
def thread(request, discussion_id):
    blocked = permission(request)
    if blocked is not None:
        return blocked
    discussion, member = get_thread(request, discussion_id, lock=True)
    if not discussion or (not moderator(request) and (not member or member.state not in VISIBLE)):
        return missing()
    limit = page_size(request)
    after = request.GET.get("after")
    if limit is None or (after and not uuid_text(after)):
        return invalid("pagination", "Use a valid post and limit.")
    page = []
    if not member or member.state == "member":
        posts = discussion.posts.select_related("author__observer").order_by("pk")
        if after:
            anchor = posts.filter(public_id=after).first()
            if anchor is None:
                return missing()
            posts = posts.filter(pk__gt=anchor.pk)
        page = list(posts[:limit + 1])
        if member and page and page[min(limit, len(page)) - 1].pk > member.read_through:
            member.read_through = page[min(limit, len(page)) - 1].pk
            member.save(update_fields=["read_through"])
    return JsonResponse({"discussion": display(request, discussion, member),
                         "posts": [post_display(request, post) for post in page[:limit]],
                         "next_after": str(page[limit - 1].public_id) if len(page) > limit else None})


def audit(discussion, request, action, **details):
    ModerationAction.objects.create(discussion=discussion, actor=request.user, action=action, details=details)


def area_input(data):
    ward, lga = data.get("ward_code"), data.get("lga_code")
    if isinstance(ward, str) and lga is None:
        area = resolve_place(None, ward)
        return {k: v for k, v in area.items() if not k.startswith("polling_unit")} if area else None
    if isinstance(lga, str) and ward is None:
        for states in AreaDataset.objects.values_list("states", flat=True).iterator(chunk_size=1):
            for state in states.values():
                for entry in state["lgas"]:
                    if entry["lga_code"] == lga:
                        return dict(state_code=state["state_code"], state_name=state["name"],
                                    lga_code=lga, lga_name=entry["name"], ward_code=None, ward_name=None)
    return None


@endpoint("POST", max_body_bytes=32768)
def create(request, data):
    blocked = permission(request, moderator=True)
    if blocked is not None:
        return blocked

    def perform():
        title, topic = clean_text(data.get("title"), 3, 120), clean_text(data.get("topic", ""), 0, 500)
        area = area_input(data)
        if title is None or topic is None:
            return invalid("title" if title is None else "topic", "Check the text length and characters.")
        if area is None:
            return invalid("lga_code" if "lga_code" in data else "ward_code", "Choose a recognised area.", "unknown_area")
        deadline = aware_datetime(data.get("closes_at"))
        if "closes_at" not in data and request.user.organisation.election_day:
            deadline = datetime.combine(request.user.organisation.election_day + timedelta(days=2), time.max, WAT)
        if deadline is None or deadline <= timezone.now():
            return invalid("closes_at", "Choose a future closing time with an explicit offset.")
        discussion = Discussion.objects.create(organisation_id=request.user.organisation_id, title=title,
                                               topic=topic, area=area, closes_at=deadline)
        audit(discussion, request, "create")
        return 201, {"discussion": display(request, discussion)}, None

    return idempotent(request, "DIS-05-create", data, perform, record_model=RequestRecord)


def collection(request):
    return (create if request.method == "POST" else list_threads)(request)


def post_or_flag(request, data, discussion, member, post_id):
    if closed(discussion):
        return closed_error()
    if post_id:
        post = discussion.posts.filter(public_id=post_id).first()
        if not post:
            return missing()
        reason = data.get("reason")
        if reason not in REASONS:
            return invalid("reason", "Choose a flag reason.")
        Flag.objects.get_or_create(post=post, member=member, defaults={"reason": reason})
        return 204, {}, None
    retry = rate_limit("discussion-post", str(member.pk), 30, 3600)
    if retry is not None:
        return error(429, "rate_limited", "Try again later.", retry=retry)
    body = clean_text(data.get("body"), 1, 1000)
    if body is None or set(data) != {"body"}:
        return invalid("body", "Send text of 1 to 1000 characters.")
    candidates = set(re.findall(r"[\w-]+", body)) | set(re.findall(r"[\w-]+", body.upper()))
    if KnownPollingUnit.objects.filter(pk__in=candidates).exists():
        return invalid("body", "Name the ward, not the polling unit.", "contains_polling_unit_code")
    name_check = bool(re.search(r"\b(?:Mr|Mrs|Ms|Dr|Chief)\.?\s+[^\W\d_]+", body))
    post = discussion.posts.create(author=member, body=body, name_check=name_check)
    return 201, {"post": post_display(request, post)}, None


@endpoint("POST", max_body_bytes=8192)
@transaction.atomic
def observer_write(request, data, discussion_id, operation, post_id=None):
    blocked = permission(request)
    if blocked is not None:
        return blocked
    if moderator(request):
        return error(403, "forbidden", "Your role cannot do this.")
    discussion, member = get_thread(request, discussion_id, lock=True)
    if not discussion or not member:
        return missing()
    if operation != "membership" and member.state != "member":
        return error(409, "not_a_member", "Join this discussion first.")

    def perform():
        if operation != "membership":
            return post_or_flag(request, data, discussion, member, post_id)
        action = data.get("action")
        if action not in ("accept", "decline", "leave"):
            return invalid("action", "Choose a membership action.")
        previous, target = {"accept": ("invited", "member"), "decline": ("invited", "declined"),
                            "leave": ("member", "left")}[action]
        if member.state != target:
            if closed(discussion):
                return closed_error()
            if member.state != previous:
                return error(409, "invalid_transition", "This membership action is unavailable.")
            member.state = target
            member.save(update_fields=["state"])
        return 200, {"discussion_id": str(discussion.pk), "membership": target}, None

    return idempotent(request, f"DIS-{operation}", data, perform, record_model=RequestRecord)


@endpoint("POST", max_body_bytes=32768)
@transaction.atomic
def moderate(request, data, discussion_id, operation, post_id=None, observer_code=None):
    blocked = permission(request, moderator=True)
    if blocked is not None:
        return blocked
    discussion, _ = get_thread(request, discussion_id, lock=True)
    if discussion is None:
        return missing()
    if operation == "invite":
        if closed(discussion):
            return closed_error()
        codes = data.get("observer_codes")
        if not isinstance(codes, list) or not 1 <= len(codes) <= 200 or any(
            not isinstance(code, str) or not 1 <= len(code) <= 40 for code in codes
        ):
            return invalid("observer_codes", "Enter 1 to 200 observer codes.")
        result = {"invited": [], "already_members": [], "not_found": []}
        normalized = {normalize_code(code) or code for code in codes}
        available = org_scope(request, ObserverCode).exclude(status=ObserverCode.Status.REVOKED).in_bulk(normalized, field_name="code")
        for code in sorted(normalized):
            if code not in available:
                result["not_found"].append(code)
                continue
            member, created = discussion.memberships.get_or_create(observer=available[code])
            if not created and member.state in ("left", "declined"):
                member.state = "invited"
                member.save(update_fields=["state"])
                created = True
            result["invited" if created else "already_members"].append(code)
        audit(discussion, request, operation, invited=result["invited"])
        return JsonResponse(result)
    if operation == "close":
        discussion.closed = True
        discussion.save(update_fields=["closed"])
        audit(discussion, request, operation)
        return JsonResponse({"discussion": display(request, discussion)})
    if operation == "remove":
        member = discussion.memberships.filter(observer__code=normalize_code(observer_code),
                                               observer__organisation_id=discussion.organisation_id).first()
        if member is None:
            return missing()
        reason = clean_text(data.get("reason"), 1, 500)
        if reason is None:
            return invalid("reason", "Enter a reason.")
        member.state = "removed"
        member.save(update_fields=["state"])
        audit(discussion, request, operation, observer_code=member.observer.code, reason=reason)
        return JsonResponse({"membership": "removed"})
    post = discussion.posts.filter(public_id=post_id).select_related("author__observer").first()
    if post is None:
        return missing()
    reason = data.get("reason") if operation == "hide" else ""
    note = clean_text(data.get("note", ""), 0, 500)
    if operation == "hide" and reason not in (*REASONS, "off_topic"):
        return invalid("reason", "Choose a moderation reason.")
    if note is None:
        return invalid("note", "Use up to 500 characters.")
    post.hidden_reason = reason
    post.save(update_fields=["hidden_reason"])
    audit(discussion, request, operation, post_id=str(post.public_id), reason=reason, note=note)
    return JsonResponse({"post": post_display(request, post)})


@endpoint("GET")
def flags(request):
    blocked = permission(request, moderator=True)
    if blocked is not None:
        return blocked
    limit = page_size(request)
    cursor = request.GET.get("cursor")
    if limit is None or request.GET.get("status", "open") != "open" or (cursor and not uuid_text(cursor)):
        return invalid("pagination", "Use a valid status, cursor and limit.")
    queryset = Post.objects.filter(discussion__organisation_id=request.user.organisation_id, hidden_reason="").filter(
        Q(name_check=True) | Q(flags__isnull=False),
    ).distinct().select_related("author__observer").order_by("-public_id")
    if cursor:
        queryset = queryset.filter(public_id__lt=cursor)
    page = list(queryset[:limit + 1])
    items = [{"post": post_display(request, post), "discussion_id": str(post.discussion_id),
              "reasons": sorted(set(post.flags.values_list("reason", flat=True))), "name_check": post.name_check,
              "flag_count": post.flags.count()} for post in page[:limit]]
    return JsonResponse({"items": items, "next_cursor": str(page[limit - 1].public_id) if len(page) > limit else None})
