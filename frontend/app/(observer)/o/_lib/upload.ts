"use client";

/**
 * One prepared file sent with MED-01 → MED-02 chunks → MED-03, for the
 * result-sheet photo (O-16) and a message attachment (O-14). Incident evidence
 * goes through the shared outbox instead. Same rules: resume from the server's
 * offset, the same keys on every retry, a new session after 24 h (G15).
 */

import { api, apiWithTimeout, retryDelay } from "../../../../lib/api/client";
import type { MediaKind, MediaPurpose, MediaSummary } from "../../../../lib/api/types";

export type UploadResult =
  | { kind: "saved"; media: MediaSummary }
  | { kind: "retry"; delayMs: number }
  | { kind: "refused"; code: string };

export async function uploadPhoto(input: {
  reportId: string;
  blob: Blob;
  content_type: string;
  size_bytes: number;
  sha256: string;
  upload_key: string;
  complete_key: string;
  kind?: MediaKind;
  purpose?: MediaPurpose;
  duration_ms?: number | null;
  attempt?: number;
}): Promise<UploadResult> {
  const kind = input.kind ?? "photo";
  const retry = (): UploadResult => ({ kind: "retry", delayMs: retryDelay(input.attempt ?? 0) });
  const start = await api("MED-01", {
    params: { report_id: input.reportId },
    body: {
      kind,
      purpose: input.purpose ?? "evidence",
      content_type: input.content_type,
      size_bytes: input.size_bytes,
      sha256: input.sha256,
      duration_ms: input.duration_ms ?? null,
      ...(kind === "photo" ? { blur_faces: false } : {}),
      client_media_id: input.upload_key,
    },
    idempotency_key: input.upload_key,
  });
  if (!start.ok) return start.status === 0 || start.status >= 500 || start.error.code === "rate_limited" ? retry() : { kind: "refused", code: start.error.code };
  if (start.data.media) return { kind: "saved", media: start.data.media };
  const upload = start.data.upload;
  let offset = upload.received_bytes;
  while (offset < input.size_bytes) {
    const chunk = input.blob.slice(offset, Math.min(offset + upload.chunk_bytes, input.size_bytes));
    const sent = await apiWithTimeout("MED-02.send", { params: { upload_id: upload.id }, body: chunk, headers: { "Upload-Offset": String(offset) } }, 60_000);
    if (sent.ok) {
      offset = sent.data.received_bytes;
      continue;
    }
    if (sent.error.code === "offset_mismatch") {
      const progress = await api("MED-02.progress", { params: { upload_id: upload.id } });
      if (!progress.ok) return retry();
      offset = progress.data.received_bytes;
      continue;
    }
    if (sent.error.code === "upload_completed") break;
    return sent.status === 0 || sent.status >= 500 ? retry() : { kind: "refused", code: sent.error.code };
  }
  const done = await api("MED-03", { params: { upload_id: upload.id }, body: {}, idempotency_key: input.complete_key });
  if (done.ok) return { kind: "saved", media: done.data.media };
  return done.status === 0 || done.status >= 500 ? retry() : { kind: "refused", code: done.error.code };
}
