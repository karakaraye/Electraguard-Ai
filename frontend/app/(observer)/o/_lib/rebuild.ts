import { uuidv4 } from "../../../../lib/api/client";
import type { IncidentDraft } from "../../../../lib/drafts";
import type { OutboxItem } from "../../../../lib/outbox";

/** Rebuild an editable draft from a stopped outbox item (same key, R1 needsAttention). */
export function itemToDraft(item: OutboxItem): IncidentDraft | null {
  const body = item.body;
  // A reused key is a client bug: the copy gets a new key (O-11 "Key reused").
  const code = item.last_error?.code;
  const id = code === "idempotency_key_reused" || code === "bad_request" || code === "idempotency_key_required" ? uuidv4() : item.id;
  if (!body) return null;
  const at = new Date(body.occurred_at);
  return {
    owner: item.owner,
    id,
    mode: item.channel,
    created_at: item.created_at,
    updated_at: Date.now(),
    last_step: "check",
    category_observer: body.category_observer,
    access_barrier_details: body.access_barrier_details ?? [],
    danger_now: body.danger_now,
    place: {
      polling_unit_code: body.place.polling_unit_code,
      ward_code: item.summary.ward_code,
      state_code: null,
      lga_code: null,
      label: item.summary.place_label,
      ward_name: item.summary.ward_name,
      unknown_unit: !body.place.polling_unit_code,
    },
    when: Number.isNaN(at.getTime()) ? { mode: "now" } : { mode: "day", date: body.occurred_at.slice(0, 10), time: body.occurred_at.slice(11, 16) },
    occurred_at: body.occurred_at,
    description: body.description,
    firsthand: body.firsthand,
    input_method: body.input_method ?? null,
    name_ack_hash: null,
    media: item.media.map((media) => ({
      client_media_id: media.client_media_id,
      kind: media.kind,
      content_type: media.content_type,
      size_bytes: media.size_bytes,
      sha256: media.sha256,
      duration_ms: media.duration_ms,
      blur_faces: media.blur_faces,
      blob_key: media.blob_key,
      name: media.name,
      blurred_on_phone: media.blurred_on_phone,
    })),
    ...(item.receipt_secret ? { receipt_secret: item.receipt_secret } : {}),
    related_report_id: body.related_report_id ?? null,
    from_checklist_question: body.from_checklist_question ?? null,
    language: body.language,
  };
}

