"""Ward check-in endpoints (NOT-01 to NOT-06) and coordinator workflow."""

import re
from collections import defaultdict
from datetime import timedelta
from uuid import UUID

from django.conf import settings
from django.db import transaction
from django.db.models import Count, Q
from django.http import JsonResponse
from django.utils import timezone
from django.utils.dateparse import parse_datetime

from accounts.models import ObserverCode, User
from accounts.observer_auth import endpoint, error, validation, wat
from accounts.observer_credentials import rate_limit
from reference.models import AreaDataset, resolve_place
from reports.idempotency import lock_key, request_digest
from reports.models import Report
from staff.access import COORDINATORS
from staff.audit import authorize, record

from .filtering import validate_notice_content
from .models import Notice, NoticeAnswer, NoticeRequest, Question


def coordinator_required(request):
    if not request.user.is_authenticated:
        return error(401, "not_authenticated", "Sign in to continue.")
    if request.user.role not in COORDINATORS and not any(r in COORDINATORS for r in request.user.additional_roles):
        return error(403, "forbidden", "Only coordinators can manage notices.")
    return None


def observer_required(request):
    if not request.user.is_authenticated:
        return error(401, "not_authenticated", "Sign in to continue.")
    if request.user.role != User.Role.OBSERVER and not request.user.has_role(User.Role.OBSERVER):
        return error(403, "forbidden", "Only observers can access this.")
    return None


def _checkin_cluster_hook(notice: Notice):
    """B8: Hook into clusters (OPS-02).

    When No answers reach 3 or more across 2 or more wards in one LGA within the notice window,
    open or extend a cluster with trigger "checkins". Related open reports get triage priority boost.
    """
    if not notice.question:
        return

    from ops.models import ClusterWarning

    min_no = getattr(settings, "CHECKIN_CLUSTER_MIN_NO_ANSWERS", 3)
    min_wards = getattr(settings, "CHECKIN_CLUSTER_MIN_WARDS", 2)

    lga_code = notice.scope_code if notice.scope_kind == "lga" else None
    if not lga_code:
        place_info = resolve_place(notice.scope_code) or {}
        lga_code = place_info.get("lga_code") or notice.scope_code.rsplit("-", 1)[0]

    no_answers = NoticeAnswer.objects.filter(
        notice=notice,
        answer=NoticeAnswer.AnswerChoice.NO,
    ).values_list("observer_code", flat=True)

    if len(no_answers) < min_no:
        return

    # Resolve wards of answering observers
    wards = set()
    if notice.scope_kind == "ward":
        wards.add(notice.scope_code)
    else:
        for obs_code in no_answers:
            rep = Report.objects.filter(
                organisation_id=notice.organisation_id,
                observer__observer_credential__code=obs_code,
            ).order_by("-created_at").first()
            if rep and rep.incident_details and rep.incident_details.get("area", {}).get("ward_code"):
                wards.add(rep.incident_details["area"]["ward_code"])

    if len(no_answers) >= min_no and len(wards) >= min_wards:
        now = timezone.now()
        cat = notice.question.category
        place_info = resolve_place(lga_code) or {}
        lga_name = place_info.get("lga_name") or lga_code

        existing = ClusterWarning.objects.filter(
            organisation=notice.organisation,
            lga_code=lga_code,
            category=cat,
            reviewed_at__isnull=True,
        ).order_by("-window_end").first()

        if existing:
            existing.trigger = "checkins"
            existing.observed = len(no_answers)
            existing.total_reports = max(existing.total_reports, len(no_answers))
            existing.window_end = now
            existing.save(update_fields=["trigger", "observed", "total_reports", "window_end"])
        else:
            ClusterWarning.objects.create(
                organisation=notice.organisation,
                category=cat,
                area={"lga_code": lga_code, "lga_name": lga_name},
                lga_code=lga_code,
                report_ids=[],
                baseline=0.0,
                expected=1.0,
                observed=len(no_answers),
                total_reports=len(no_answers),
                detector=ClusterWarning.Detector.THRESHOLD,
                trigger="checkins",
                window_minutes=max(15, int((now - notice.created_at).total_seconds() / 60)),
                baseline_kind=ClusterWarning.BaselineKind.THRESHOLD,
                explanation=f"Check-in cluster: {len(no_answers)} No answers across {len(wards)} wards in {lga_name} for {notice.question.id}",
                window_start=notice.created_at,
                window_end=now,
            )

        # Boost open reports in those wards of matching category
        open_reports = Report.objects.filter(
            organisation=notice.organisation,
            status=Report.Status.SUBMITTED,
            kind="incident",
        )
        for report in open_reports:
            r_area = (report.incident_details or {}).get("area") or {}
            if r_area.get("ward_code") in wards:
                sugg = report.review_suggestions or {}
                sugg["urgency"] = {
                    "value": "urgent",
                    "reasons": ["checkin_cluster_boost"],
                    "corrected_value": None,
                }
                report.review_suggestions = sugg
                report.save(update_fields=["review_suggestions"])


def _expire_stale_notices(organisation=None):
    qs = Notice.objects.filter(status=Notice.Status.SENT, expires_at__lte=timezone.now())
    if organisation:
        qs = qs.filter(organisation=organisation)
    qs.update(status=Notice.Status.EXPIRED)


# ---------------------------------------------------------------------------
# NOT-01: POST /api/v1/notices (Create Notice)
# ---------------------------------------------------------------------------
@endpoint("POST", max_body_bytes=16384)
@transaction.atomic
def create_notice(request, data):
    blocked = coordinator_required(request)
    if blocked:
        return blocked

    # Idempotency
    try:
        key = UUID(request.headers.get("Idempotency-Key", ""))
        if key.version != 4:
            raise ValueError
    except ValueError:
        return error(400, "idempotency_key_required", "Send a UUID v4 Idempotency-Key.")

    if not lock_key(f"not1:{request.user.organisation_id}:{request.user.pk}:{key}"):
        return error(409, "request_in_progress", "This request is still being processed.", retry=2)

    checksum = request_digest(request, data)
    scope_req = NoticeRequest.objects.filter(organisation=request.user.organisation, key=key)
    previous = scope_req.first()
    if previous:
        if previous.digest != checksum:
            return error(409, "idempotency_key_reused", "This send key belongs to a different request.")
        resp = JsonResponse(previous.body, status=previous.status)
        resp["Idempotent-Replayed"] = "true"
        return resp

    # Validate scope
    raw_scope = data.get("scope")
    if not isinstance(raw_scope, dict):
        return validation({"scope": {"code": "invalid", "message": "Provide scope object."}})
    scope_kind = raw_scope.get("kind")
    scope_code = str(raw_scope.get("code") or "").strip()
    if scope_kind not in ("ward", "lga"):
        return validation({"scope.kind": {"code": "invalid_choice", "message": "Choose ward or lga."}})
    if not scope_code:
        return validation({"scope.code": {"code": "required", "message": "Provide scope code."}})

    # Scope reference check
    place_info = resolve_place(scope_code)
    if not place_info:
        # Check against AreaDataset releases
        rel = AreaDataset.objects.first()
        if rel and rel.states:
            found = False
            for s in rel.states.values():
                for lga in s.get("lgas", []):
                    if scope_kind == "lga" and lga.get("lga_code") == scope_code:
                        found = True
                        break
                    for w in lga.get("wards", []):
                        if scope_kind == "ward" and w.get("ward_code") == scope_code:
                            found = True
                            break
                    if found:
                        break
                if found:
                    break
            if not found:
                return validation({"scope.code": {"code": "not_found", "message": "Scope code not found in reference data."}})

    # Validate type
    notice_type = data.get("type")
    if notice_type not in (Notice.NoticeType.SAFETY, Notice.NoticeType.LOGISTICS, Notice.NoticeType.INSTRUCTION):
        return validation({"type": {"code": "invalid_choice", "message": "Choose safety, logistics, or instruction."}})

    # Validate text
    raw_text = data.get("text")
    if not isinstance(raw_text, str) or not 1 <= len(raw_text.strip()) <= 280:
        return validation({"text": {"code": "invalid_length", "message": "Enter 1 to 280 characters."}})
    text = raw_text.strip()

    # 5D Content filter
    is_blocked, reasons = validate_notice_content(text)
    if is_blocked:
        return JsonResponse(
            {"error": {"code": "blocked_content", "message": "Notice contains prohibited content.", "reasons": reasons}},
            status=400,
        )

    # Optional question
    question_id = data.get("question_id")
    question = None
    if question_id:
        question = Question.objects.filter(id=question_id).first()
        if not question:
            return validation({"question_id": {"code": "not_found", "message": "Question does not exist."}})

    # Expiry
    expires_in_minutes = data.get("expires_in_minutes", 360)
    try:
        expires_in_minutes = int(expires_in_minutes)
        if not 15 <= expires_in_minutes <= 1440:
            raise ValueError
    except (TypeError, ValueError):
        return validation({"expires_in_minutes": {"code": "invalid_range", "message": "Expires between 15 and 1440 minutes."}})

    now = timezone.now()
    expires_at = now + timedelta(minutes=expires_in_minutes)

    # Safety notices start as pending_approval; others go straight to sent
    status = Notice.Status.PENDING_APPROVAL if notice_type == Notice.NoticeType.SAFETY else Notice.Status.SENT

    notice = Notice.objects.create(
        organisation=request.user.organisation,
        scope_kind=scope_kind,
        scope_code=scope_code,
        type=notice_type,
        text=text,
        question=question,
        created_by=request.user,
        approved_by=request.user if status == Notice.Status.SENT else None,
        status=status,
        expires_at=expires_at,
    )

    record(request.user.organisation_id, "create_notice", "notice", str(notice.id), actor=request.user)

    body = {"id": str(notice.id), "status": notice.status}
    scope_req.create(
        organisation=request.user.organisation,
        actor=request.user,
        key=key,
        digest=checksum,
        status=201,
        body=body,
    )
    return JsonResponse(body, status=201)


# ---------------------------------------------------------------------------
# NOT-02: POST /api/v1/notices/{id}/approve & reject
# ---------------------------------------------------------------------------
@endpoint("POST")
@transaction.atomic
def approve_notice(request, data=None, notice_id=None):
    blocked = coordinator_required(request)
    if blocked:
        return blocked

    notice = Notice.objects.select_for_update().filter(
        organisation=request.user.organisation, pk=notice_id,
    ).first()
    if not notice:
        return error(404, "not_found", "Notice not found.")

    if notice.status != Notice.Status.PENDING_APPROVAL:
        return error(409, "conflict", "Notice is not pending approval.")

    # Guard: same person cannot approve
    if notice.created_by_id == request.user.pk:
        return error(403, "same_person_approval", "A different coordinator must approve this notice.")

    notice.status = Notice.Status.SENT
    notice.approved_by = request.user
    notice.save(update_fields=["status", "approved_by"])

    record(request.user.organisation_id, "approve_notice", "notice", str(notice.id), actor=request.user)
    return JsonResponse({"status": "sent"})


@endpoint("POST")
@transaction.atomic
def reject_notice(request, data=None, notice_id=None):
    blocked = coordinator_required(request)
    if blocked:
        return blocked

    notice = Notice.objects.select_for_update().filter(
        organisation=request.user.organisation, pk=notice_id,
    ).first()
    if not notice:
        return error(404, "not_found", "Notice not found.")

    note = (data or {}).get("note", "").strip() if isinstance(data, dict) else ""
    if not note:
        return validation({"note": {"code": "required", "message": "Provide a rejection note."}})

    notice.status = Notice.Status.WITHDRAWN
    notice.save(update_fields=["status"])

    record(request.user.organisation_id, "reject_notice", "notice", str(notice.id), actor=request.user)
    return JsonResponse({"status": "withdrawn"})


# ---------------------------------------------------------------------------
# NOT-03: GET /api/v1/notices and GET /api/v1/notices/{id}/results
# ---------------------------------------------------------------------------
@endpoint("GET")
def list_notices(request):
    blocked = coordinator_required(request)
    if blocked:
        return blocked

    _expire_stale_notices(request.user.organisation)

    notices = Notice.objects.filter(organisation=request.user.organisation).select_related(
        "question", "created_by", "approved_by"
    ).order_by("-created_at")

    items = []
    for n in notices:
        q_data = None
        if n.question:
            q_data = {
                "id": n.question.id,
                "category": n.question.category,
                "text_by_lang": n.question.text_by_lang,
                "answers": n.question.answers,
            }
        items.append({
            "id": str(n.id),
            "scope": {"kind": n.scope_kind, "code": n.scope_code},
            "type": n.type,
            "text": n.text,
            "question": q_data,
            "status": n.status,
            "expires_at": wat(n.expires_at),
            "created_at": wat(n.created_at),
            "created_by": n.created_by.get_full_name() or n.created_by.email,
            "approved_by": (n.approved_by.get_full_name() or n.approved_by.email) if n.approved_by else None,
        })
    return JsonResponse({"items": items})


@endpoint("GET")
def notice_results(request, notice_id):
    blocked = coordinator_required(request)
    if blocked:
        return blocked

    notice = Notice.objects.filter(organisation=request.user.organisation, pk=notice_id).first()
    if not notice:
        return error(404, "not_found", "Notice not found.")

    answers = NoticeAnswer.objects.filter(notice=notice)

    # Resolve wards and polling units in scope
    rel = AreaDataset.objects.first()
    wards_in_scope = defaultdict(lambda: {"yes": 0, "no": 0, "not_seen": 0, "units": set(), "answered_units": set()})

    if rel and rel.states:
        for s in rel.states.values():
            for lga in s.get("lgas", []):
                lga_match = notice.scope_kind == "lga" and lga.get("lga_code") == notice.scope_code
                for w in lga.get("wards", []):
                    w_code = w.get("ward_code")
                    if lga_match or (notice.scope_kind == "ward" and w_code == notice.scope_code):
                        entry = wards_in_scope[w_code]  # a ward with no answers still appears
                        for u in w.get("units", []):
                            u_code = u[0] if isinstance(u, (list, tuple)) and u else None
                            if u_code:
                                entry["units"].add(u_code)

    # Count answers
    for ans in answers:
        rep = Report.objects.filter(
            organisation_id=notice.organisation_id,
            observer__observer_credential__code=ans.observer_code,
        ).order_by("-created_at").first()
        w_code = None
        u_code = None
        if rep and rep.incident_details and rep.incident_details.get("area"):
            area = rep.incident_details["area"]
            w_code = area.get("ward_code")
            u_code = area.get("polling_unit_code") or rep.polling_unit_code
        if not w_code and notice.scope_kind == "ward":
            w_code = notice.scope_code

        target_ward = wards_in_scope[w_code or "unknown"]
        if ans.answer in target_ward:
            target_ward[ans.answer] += 1
        if u_code:
            target_ward["answered_units"].add(u_code)

    wards_out = {}
    for w_code, stats in wards_in_scope.items():
        unanswered = sorted(stats["units"] - stats["answered_units"])
        wards_out[w_code] = {
            "yes": stats["yes"],
            "no": stats["no"],
            "not_seen": stats["not_seen"],
            "unanswered_units": unanswered,
        }

    return JsonResponse({
        "notice_id": str(notice.id),
        "status": notice.status,
        "wards": wards_out,
    })


# ---------------------------------------------------------------------------
# NOT-04: GET /api/v1/observer/notices
# ---------------------------------------------------------------------------
@endpoint("GET")
def observer_notices(request):
    blocked = observer_required(request)
    if blocked:
        return blocked

    _expire_stale_notices(request.user.organisation)

    # Determine observer's ward and LGA from query or latest report
    ward_code = request.GET.get("ward_code")
    lga_code = request.GET.get("lga_code")
    if not (ward_code or lga_code):
        latest = Report.objects.filter(observer=request.user).order_by("-created_at").first()
        if latest and latest.incident_details and latest.incident_details.get("area"):
            area = latest.incident_details["area"]
            ward_code = area.get("ward_code")
            lga_code = area.get("lga_code")

    now = timezone.now()
    qs = Notice.objects.filter(
        organisation=request.user.organisation,
        status=Notice.Status.SENT,
        expires_at__gt=now,
    ).select_related("question").order_by("-created_at")

    if ward_code or lga_code:
        scope_q = Q()
        if ward_code:
            scope_q |= Q(scope_kind="ward", scope_code=ward_code)
        if lga_code:
            scope_q |= Q(scope_kind="lga", scope_code=lga_code)
        qs = qs.filter(scope_q)

    # Observer code for my_answer
    obs_code = ObserverCode.objects.filter(user=request.user).values_list("code", flat=True).first()
    my_answers = {}
    if obs_code:
        for a in NoticeAnswer.objects.filter(notice__in=qs, observer_code=obs_code):
            my_answers[a.notice_id] = {
                "answer": a.answer,
                "answered_at": wat(a.answered_at_device),
            }

    items = []
    for n in qs:
        q_data = None
        if n.question:
            q_data = {
                "id": n.question.id,
                "category": n.question.category,
                "text_by_lang": n.question.text_by_lang,
                "answers": n.question.answers,
            }
        items.append({
            "id": str(n.id),
            "scope": {"kind": n.scope_kind, "code": n.scope_code},
            "type": n.type,
            "text": n.text,
            "question": q_data,
            "my_answer": my_answers.get(n.id),
            "expires_at": wat(n.expires_at),
            "created_at": wat(n.created_at),
        })

    return JsonResponse({"items": items})


# ---------------------------------------------------------------------------
# NOT-05: POST /api/v1/observer/notices/{id}/answer
# ---------------------------------------------------------------------------
@endpoint("POST", max_body_bytes=8192)
@transaction.atomic
def answer_notice(request, data, notice_id=None):
    blocked = observer_required(request)
    if blocked:
        return blocked

    notice = Notice.objects.filter(
        organisation=request.user.organisation, pk=notice_id,
    ).first()
    if not notice:
        return error(404, "not_found", "Notice not found.")

    now = timezone.now()
    if notice.status != Notice.Status.SENT or notice.expires_at <= now:
        return error(409, "notice_expired", "Notice has expired.")

    # Validate answer choice
    answer = data.get("answer")
    if answer not in (NoticeAnswer.AnswerChoice.YES, NoticeAnswer.AnswerChoice.NO, NoticeAnswer.AnswerChoice.NOT_SEEN):
        return validation({"answer": {"code": "invalid_choice", "message": "Choose yes, no, or not_seen."}})

    # Validate answered_at timestamp
    raw_stamp = data.get("answered_at")
    if not raw_stamp:
        return validation({"answered_at": {"code": "required", "message": "Provide answered_at timestamp."}})
    stamp = parse_datetime(raw_stamp) if isinstance(raw_stamp, str) else None
    if stamp is None:
        return validation({"answered_at": {"code": "invalid_format", "message": "Invalid ISO8601 timestamp."}})
    if timezone.is_naive(stamp):
        stamp = timezone.make_aware(stamp)

    # Clock skew and freshness guards
    if stamp > now + timedelta(minutes=5):
        return error(400, "invalid_timestamp", "Answer timestamp cannot be in the future.")
    if stamp < now - timedelta(hours=24):
        return error(400, "stale_answer", "Answer timestamp is older than 24 hours.")
    if stamp > notice.expires_at:
        return error(409, "notice_expired", "Notice expired before answer was recorded.")

    obs_code = ObserverCode.objects.filter(user=request.user).values_list("code", flat=True).first()
    if not obs_code:
        obs_code = str(request.user.pk)

    ans, created = NoticeAnswer.objects.select_for_update().get_or_create(
        notice=notice,
        observer_code=obs_code,
        defaults={
            "organisation": request.user.organisation,
            "answer": answer,
            "answered_at_device": stamp,
            "version": 1,
        },
    )
    if not created:
        ans.answer = answer
        ans.answered_at_device = stamp
        ans.version += 1
        ans.save(update_fields=["answer", "answered_at_device", "version"])

    record(request.user.organisation_id, "answer_notice", "notice", str(notice.id), version=ans.version, actor=request.user)

    # B8 cluster trigger hook
    if answer == NoticeAnswer.AnswerChoice.NO:
        _checkin_cluster_hook(notice)

    return JsonResponse({"status": "recorded", "answer": answer})


# ---------------------------------------------------------------------------
# NOT-06: GET /api/v1/notices/questions
# ---------------------------------------------------------------------------
@endpoint("GET")
def list_questions(request):
    questions = Question.objects.all().order_by("pk")
    return JsonResponse({
        "items": [
            {
                "id": q.id,
                "category": q.category,
                "text_by_lang": q.text_by_lang,
                "answers": q.answers,
            }
            for q in questions
        ]
    })
