from uuid import UUID

from django.core import signing
from django.db import transaction
from django.http import HttpResponse, JsonResponse
from django.utils import timezone
from django.utils.http import parse_etags

from accounts.models import Organisation
from accounts.observer_auth import endpoint, error, wat
from reports.idempotency import lock_key, request_digest
from reports.incident_input import aware_datetime
from staff.audit import authorize, digest, record
from staff.cases import invalid

from .aggregate import build, combined, latest_cutoff
from .models import Schedule, Snapshot, SnapshotRequest


COORDINATORS = {"coordinator", "administrator"}


def snapshot_json(snapshot):
    return {
        "id": str(snapshot.pk), "status": snapshot.status, "version": snapshot.version,
        "cutoff": wat(snapshot.cutoff),
        "created_by": snapshot.created_by.get_full_name() or snapshot.created_by.email,
        "approved_by": (snapshot.approved_by.get_full_name() or snapshot.approved_by.email)
        if snapshot.approved_by else None,
        "published_at": wat(snapshot.published_at) if snapshot.published_at else None,
        "preview": snapshot.preview, "excluded": snapshot.excluded,
    }


def replayable(request, data, perform):
    try:
        key = UUID(request.headers.get("Idempotency-Key", ""))
        if key.version != 4:
            raise ValueError
    except ValueError:
        return error(400, "idempotency_key_required", "Send a UUID v4 Idempotency-Key.")
    actor = request.user
    organisation_id = actor.organisation_id
    checksum = request_digest(request, data)
    if not lock_key(f"publish:{organisation_id}:{actor.pk}:{key}"):
        return error(409, "request_in_progress", "This request is still being processed.", retry=2)
    scope = SnapshotRequest.objects.filter(actor=actor, organisation_id=organisation_id)
    previous = scope.filter(key=key).first()
    if previous:
        if previous.digest != checksum:
            return error(409, "idempotency_key_reused", "This send key belongs to a different request.")
        response = JsonResponse(previous.body)
        response["Idempotent-Replayed"] = "true"
        return response
    organisation = Organisation.objects.select_for_update(no_key=True).get(pk=organisation_id)
    result = perform(organisation)
    if isinstance(result, tuple):
        status, body = result
        scope.create(actor=actor, organisation=organisation, key=key, digest=checksum, status=status, body=body)
        return JsonResponse(body, status=status)
    return result


def current_snapshots(request):
    return Snapshot.objects.filter(organisation_id=request.user.organisation_id).select_related(
        "created_by", "approved_by",
    )


@endpoint("GET")
def snapshot_list(request):
    denied = authorize(request, roles=COORDINATORS)
    if denied is not None:
        return denied
    snapshots = current_snapshots(request).order_by("-id")
    try:
        limit = int(request.GET.get("limit", 50))
        if not 1 <= limit <= 100:
            return invalid("limit")
        if cursor := request.GET.get("cursor"):
            scope, previous = signing.loads(cursor, salt="snapshot-list")
            if scope != str(request.user.organisation_id):
                raise ValueError
            snapshots = snapshots.filter(id__lt=UUID(previous))
    except (ValueError, signing.BadSignature):
        return invalid("cursor" if request.GET.get("cursor") else "limit")
    rows = list(snapshots[:limit + 1])
    cursor = signing.dumps(
        [str(request.user.organisation_id), str(rows[limit - 1].pk)], salt="snapshot-list",
    ) if len(rows) > limit else None
    return JsonResponse({"items": [snapshot_json(row) for row in rows[:limit]], "next_cursor": cursor})


def create_snapshot(organisation, actor, cutoff):
    snapshot = Snapshot(organisation=organisation, created_by=actor, cutoff=cutoff)
    build(snapshot)
    snapshot.save(force_insert=True)
    record(
        organisation.pk, "create_snapshot", "public_snapshot", snapshot.pk, actor=actor,
        version=snapshot.version, content={"cutoff": wat(cutoff)},
    )
    return snapshot


def create(request, data, organisation):
    maximum = latest_cutoff(organisation, timezone.now())
    cutoff = maximum if "cutoff" not in data else aware_datetime(data["cutoff"])
    if cutoff is None:
        return invalid("cutoff", "invalid_datetime", "Enter a timestamp with an explicit offset.")
    if cutoff > maximum:
        return invalid(
            "cutoff", "too_recent", f"The cutoff must be at least {organisation.public_delay_minutes} minutes ago.",
        )
    snapshot = create_snapshot(organisation, request.user, cutoff)
    return 201, snapshot_json(snapshot)


@endpoint("POST", max_body_bytes=4096)
@transaction.atomic
def snapshot_create(request, data):
    denied = authorize(request, roles=COORDINATORS)
    return denied if denied is not None else replayable(
        request, data, lambda org: create(request, data, org),
    )


def snapshots(request):
    return snapshot_create(request) if request.method == "POST" else snapshot_list(request)


@endpoint("GET")
def snapshot_detail(request, snapshot_id):
    denied = authorize(request, roles=COORDINATORS)
    if denied is not None:
        return denied
    snapshot = current_snapshots(request).filter(pk=snapshot_id).first()
    if snapshot is None:
        return error(404, "not_found", "We could not find that.")
    return JsonResponse(snapshot_json(snapshot))


def publish(snapshot, actor, *, automatic=False):
    Snapshot.objects.filter(
        organisation=snapshot.organisation, status=Snapshot.Status.PUBLISHED,
    ).update(status=Snapshot.Status.SUPERSEDED)
    snapshot.status = Snapshot.Status.PUBLISHED
    snapshot.approved_by = actor
    snapshot.published_at = timezone.now()
    snapshot.preview["published_at"] = wat(snapshot.published_at)
    snapshot.version += 1
    snapshot.save(update_fields=["status", "approved_by", "published_at", "preview", "version"])
    record(
        snapshot.organisation_id, "publish_snapshot", "public_snapshot", snapshot.pk, actor=actor,
        version=snapshot.version, content={"automatic": automatic},
    )


def validate_version(data, actual):
    if type(data.get("version")) is not int or data["version"] < 0:
        return invalid("version", "required" if "version" not in data else "invalid")
    if data["version"] != actual:
        return error(409, "stale_version", "This record has changed. Refresh before trying again.")
    return None


def decide(request, data, org, snapshot_id, decision):
    snapshot = current_snapshots(request).filter(pk=snapshot_id).first()
    if snapshot is None:
        return error(404, "not_found", "We could not find that.")
    problem = validate_version(data, snapshot.version)
    if problem is not None:
        return problem
    if snapshot.status != Snapshot.Status.DRAFT:
        return error(409, "invalid_transition", "Only a draft snapshot can be changed.")
    if decision == "approve":
        if snapshot.cutoff > latest_cutoff(org, timezone.now()):
            return invalid("cutoff", "too_recent", "The cutoff is too recent for the current delay.")
        publish(snapshot, request.user)
    else:
        snapshot.status = Snapshot.Status.DISCARDED
        snapshot.version += 1
        snapshot.save(update_fields=["status", "version"])
        record(
            org.pk, "discard_snapshot", "public_snapshot", snapshot.pk, actor=request.user,
            version=snapshot.version,
        )
    return 200, snapshot_json(snapshot)


@endpoint("POST", max_body_bytes=4096)
@transaction.atomic
def snapshot_decision(request, data, snapshot_id, decision):
    denied = authorize(request, roles=COORDINATORS)
    return denied if denied is not None else replayable(
        request, data, lambda org: decide(request, data, org, snapshot_id, decision),
    )


def update_schedule(request, data, organisation):
    if type(data.get("hourly")) is not bool:
        return invalid("hourly")
    schedule = Schedule.objects.filter(organisation=organisation).first()
    problem = validate_version(data, schedule.version if schedule else 0)
    if problem is not None:
        return problem
    if schedule is None:
        schedule = Schedule(organisation=organisation)
    schedule.hourly = data["hourly"]
    schedule.approver = request.user if schedule.hourly else None
    schedule.version += 1
    schedule.save()
    record(
        organisation.pk, "update_publish_schedule", "organisation", organisation.pk,
        actor=request.user, version=schedule.version, content={"hourly": schedule.hourly},
    )
    return 200, {"hourly": schedule.hourly, "version": schedule.version}


@endpoint("PUT", max_body_bytes=4096)
@transaction.atomic
def schedule(request, data):
    denied = authorize(request, roles=COORDINATORS)
    return denied if denied is not None else replayable(
        request, data, lambda org: update_schedule(request, data, org),
    )


def results(request):
    if request.method != "GET":
        response = error(405, "method_not_allowed", "This method is not available.")
        response["Allow"] = "GET"
        return response
    published = list(Snapshot.objects.filter(status=Snapshot.Status.PUBLISHED).order_by(
        "organisation_id",
    ).values_list("preview", flat=True))
    timestamp = max(item["published_at"] for item in published) if published else wat(
        timezone.now().replace(second=0, microsecond=0),
    )
    body = {
        "generated_at": timestamp, "notice_key": "results.notice",
        "snapshots": published, "combined": combined(published),
    }
    etag = '"' + digest(body) + '"'
    previous = parse_etags(request.headers.get("If-None-Match", ""))
    if etag in [tag.removeprefix("W/") for tag in previous] or "*" in previous:
        response = HttpResponse(status=304)
    else:
        response = JsonResponse(body)
    response["ETag"] = etag
    response["Cache-Control"] = "public, max-age=300"
    return response
