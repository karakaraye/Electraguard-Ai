/**
 * The sync loop (contract 1.7, README R4). One loop per tab (Web Locks keep it
 * to one tab where supported). Order: oldest report first; for each report the
 * text (REP-01, or REP-05 for a citizen), then each attachment in resumable
 * chunks (MED-01 → MED-02 → MED-03). Media wait until the report has its id.
 * Retries use the same Idempotency-Key with back-off 2 s, 4 s, 8 s ... 5 min,
 * ±20 % jitter, and run at once on the `online` event or "Send now".
 */

import { api, apiWithTimeout, retryPlan, uuidv4 } from "../api/client";
import type { ReportCreateResponse, WithdrawnStub } from "../api/types";
import { del, getBlob } from "../drafts/db";
import {
  getSnapshot,
  markWaitingCode,
  saveItem,
  saveMedia,
  saveReceived,
  setPaused,
} from "./store";
import type { OutboxItem, OutboxMedia } from "./types";

/** After this many failed tries of one attachment (server errors), it shows "Not sent" with Try again. */
const MEDIA_AUTO_TRIES = 3;

type SyncOptions = {
  /** Owners whose items this loop may send (the signed-in code, and "citizen"). */
  owners: () => string[];
};

let options: SyncOptions | null = null;
let timer: number | undefined;
let running = false;
let again = false;

function online(): boolean {
  return typeof navigator === "undefined" || navigator.onLine !== false;
}

/** Start (or re-point) the loop. Safe to call many times. */
export function startSync(next: SyncOptions) {
  options = next;
  if (typeof window !== "undefined" && !(window as Window & { __egSync?: boolean }).__egSync) {
    (window as Window & { __egSync?: boolean }).__egSync = true;
    window.addEventListener("online", () => kick());
  }
  kick();
}

export function stopSync() {
  options = null;
  window.clearTimeout(timer);
}

/** Try now: the online event, "Send now", "Try again", or a new item. */
export function kick() {
  if (!options) return;
  window.clearTimeout(timer);
  if (running) {
    again = true;
    return;
  }
  void runWithLock();
}

async function runWithLock() {
  const locks = (navigator as Navigator & { locks?: LockManager }).locks;
  if (locks?.request) {
    await locks.request("eg-outbox-sync", { ifAvailable: true }, async (lock) => {
      if (lock) await run();
      else schedule(5_000);
    });
  } else {
    await run();
  }
}

function schedule(delayMs: number) {
  window.clearTimeout(timer);
  timer = window.setTimeout(() => kick(), Math.max(250, delayMs));
}

/** Clear the back-off of everything (the user asked to send now). */
export async function sendNow() {
  for (const item of getSnapshot().items) {
    if (item.state === "queued" || item.state === "unconfirmed") await saveItem({ ...item, next_at: 0 });
    for (const media of item.media) {
      if (media.state === "waiting" || media.state === "failed") {
        await saveMedia(currentItem(item.id) ?? item, { ...media, state: "waiting", next_at: 0, attempts: 0 });
      }
    }
  }
  kick();
}

/**
 * AUTH-07 says intake is open again (R5): reports waiting out a pause try now
 * instead of sitting out the rest of the 600 s Retry-After.
 */
export async function resumeAfterIntakePause() {
  let changed = false;
  for (const item of getSnapshot().items) {
    if (item.state === "queued" && item.wait_reason === "intake_paused" && item.next_at > Date.now()) {
      await saveItem({ ...item, next_at: 0 });
      changed = true;
    }
  }
  if (changed) kick();
}

function currentItem(id: string): OutboxItem | undefined {
  return getSnapshot().items.find((item) => item.id === id);
}

async function run() {
  if (!options) return;
  running = true;
  try {
    do {
      again = false;
      await pass();
    } while (again && options);
  } finally {
    running = false;
  }
  scheduleNext();
}

function scheduleNext() {
  if (!options) return;
  const snapshot = getSnapshot();
  if (snapshot.paused) return;
  const owners = options.owners();
  let soonest = Infinity;
  for (const item of snapshot.items) {
    if (!owners.includes(item.owner)) continue;
    if (item.state === "queued" || item.state === "unconfirmed") soonest = Math.min(soonest, item.next_at);
    if (item.state === "received" && item.server && !item.server.withdrawn) {
      for (const media of item.media) if (media.state === "waiting") soonest = Math.min(soonest, media.next_at);
    }
  }
  if (soonest !== Infinity) schedule(soonest - Date.now());
}

async function pass() {
  if (!options || !online()) return;
  const owners = options.owners();
  const snapshot = getSnapshot();
  const now = Date.now();
  for (const item of snapshot.items) {
    if (getSnapshot().paused) return;
    if (!owners.includes(item.owner)) continue;
    if ((item.state === "queued" || item.state === "unconfirmed") && item.next_at <= now) {
      await sendReport(item);
    }
    const latest = currentItem(item.id);
    if (latest && latest.state === "received" && latest.server && !latest.server.withdrawn) {
      for (const media of latest.media) {
        if (getSnapshot().paused || !online()) return;
        if (media.state === "waiting" && media.next_at <= Date.now()) await sendMedia(latest.id, media.client_media_id);
      }
    }
  }
}

/* ---------- Report ---------- */

async function sendReport(start: OutboxItem) {
  if (!start.body) return;
  const item: OutboxItem = { ...start, state: "sending" };
  await saveItem(item);
  const body = { ...start.body, device_saved_at: start.device_saved_at };
  const result =
    start.channel === "citizen"
      ? await api("REP-05", { body: { ...body, receipt_secret: start.receipt_secret ?? "" }, idempotency_key: start.id })
      : await api("REP-01", { body, idempotency_key: start.id });
  const plan = retryPlan(result, start.attempts);

  if (plan.kind === "done" && result.ok) {
    const data = result.data as ReportCreateResponse | WithdrawnStub;
    const withdrawn = data.status === "withdrawn";
    const server = {
      id: data.id,
      receipt_code: data.receipt_code,
      received_at: data.received_at,
      withdrawn,
      max_items: "media_upload" in data ? data.media_upload.max_items : 6,
      max_total_bytes: "media_upload" in data ? data.media_upload.max_total_bytes : 62_914_560,
    };
    // R8: the report text leaves the phone now. Media stay until each MED-03 succeeds.
    await saveItem({ ...item, state: "received", body: null, server, attempts: 0, last_error: null, wait_reason: null });
    await saveReceived({
      id: data.id,
      owner: start.owner,
      client_id: start.id,
      receipt_code: data.receipt_code,
      category_observer: start.summary.category_observer,
      ward_code: start.summary.ward_code,
      ward_name: start.summary.ward_name,
      status: withdrawn ? "withdrawn" : "received",
      received_at: data.received_at,
      occurred_at: start.summary.occurred_at,
      ...(start.receipt_secret ? { receipt_secret: start.receipt_secret } : {}),
    });
    if (withdrawn) await dropBlobs(item);
    return;
  }

  if (plan.kind === "retry") {
    const leftThePhone = result.status !== 0 || (!result.ok && result.error.message === "timeout") || online();
    await saveItem({
      ...item,
      state: plan.reason === "intake_paused" ? "queued" : leftThePhone ? "unconfirmed" : "queued",
      wait_reason: plan.reason,
      attempts: start.attempts + 1,
      next_at: Date.now() + plan.delayMs,
    });
    return;
  }
  if (plan.kind === "auth") {
    await saveItem({ ...item, state: start.attempts > 0 ? "unconfirmed" : "queued", wait_reason: "auth", next_at: 0 });
    setPaused("auth");
    return;
  }
  if (plan.kind === "revoked") {
    await saveItem({ ...item, state: "queued" });
    await markWaitingCode(start.owner);
    setPaused("revoked");
    return;
  }
  // Refused for good (409 key reused, 400, 413, 415, 422): stop and keep the content.
  const fields = !result.ok ? (result.error as { fields?: NonNullable<OutboxItem["last_error"]>["fields"] }).fields : undefined;
  await saveItem({
    ...item,
    state: "needs_attention",
    wait_reason: null,
    last_error: { code: plan.kind === "stop" ? plan.code : "bad_request", ...(fields ? { fields } : {}) },
  });
}

async function dropBlobs(item: OutboxItem) {
  for (const media of item.media) await del("blobs", media.blob_key).catch(() => undefined);
}

/* ---------- Media: MED-01 → MED-02 chunks → MED-03 ---------- */

const REJECT_CODES = new Set([
  "payload_too_large",
  "unsupported_media_type",
  "media_limit_reached",
  "report_closed",
  "report_withdrawn",
  "validation_failed",
  "media_unreadable",
  "not_found",
  "idempotency_key_reused",
  "bad_request",
]);

async function updateMedia(itemId: string, mediaId: string, patch: Partial<OutboxMedia>): Promise<OutboxMedia | null> {
  const item = currentItem(itemId);
  const media = item?.media.find((m) => m.client_media_id === mediaId);
  if (!item || !media) return null;
  const next = { ...media, ...patch };
  await saveMedia(item, next);
  return next;
}

async function failMedia(itemId: string, media: OutboxMedia, result: Parameters<typeof retryPlan>[0]) {
  const plan = retryPlan(result, media.attempts);
  const item = currentItem(itemId);
  if (plan.kind === "auth") {
    setPaused("auth");
    await updateMedia(itemId, media.client_media_id, { state: "waiting", next_at: 0 });
    return;
  }
  if (plan.kind === "revoked") {
    if (item) await markWaitingCode(item.owner);
    setPaused("revoked");
    return;
  }
  if (plan.kind === "retry") {
    const attempts = media.attempts + 1;
    const network = plan.reason === "network";
    await updateMedia(itemId, media.client_media_id, {
      state: !network && attempts >= MEDIA_AUTO_TRIES ? "failed" : "waiting",
      attempts,
      next_at: Date.now() + plan.delayMs,
    });
    return;
  }
  const code = !result.ok ? result.error.code : "bad_request";
  await updateMedia(itemId, media.client_media_id, {
    state: REJECT_CODES.has(code) ? "rejected" : "failed",
    error_code: code,
  });
}

async function markSaved(itemId: string, mediaId: string, serverMediaId: string, status: OutboxMedia["server_status"]) {
  const saved = await updateMedia(itemId, mediaId, {
    state: "saved",
    media_id: serverMediaId,
    server_status: status,
    upload_id: null,
    error_code: null,
  });
  // R8: the file leaves the phone once the server has it.
  if (saved) await del("blobs", saved.blob_key).catch(() => undefined);
}

async function sendMedia(itemId: string, mediaId: string) {
  const item = currentItem(itemId);
  let media = item?.media.find((m) => m.client_media_id === mediaId);
  if (!item || !item.server || !media) return;
  const blob = await getBlob(media.blob_key);
  if (!blob) {
    await updateMedia(itemId, mediaId, { state: "missing" });
    return;
  }
  const secret = item.channel === "citizen" ? item.receipt_secret : undefined;

  // 1. Start (or resume) the session. A replay with the same key returns current progress.
  if (!media.upload_id) {
    const start = await api("MED-01", {
      params: { report_id: item.server.id },
      body: {
        kind: media.kind,
        purpose: "evidence",
        content_type: media.content_type,
        size_bytes: media.size_bytes,
        sha256: media.sha256,
        duration_ms: media.duration_ms,
        ...(media.kind === "audio" ? {} : { blur_faces: media.blur_faces }),
        client_media_id: media.client_media_id,
      },
      idempotency_key: media.start_key,
      receipt_secret: secret,
    });
    if (!start.ok) {
      if (start.error.code === "upload_expired") {
        await updateMedia(itemId, mediaId, { start_key: uuidv4(), upload_id: null, received_bytes: 0, next_at: 0 });
        again = true;
        return;
      }
      await failMedia(itemId, media, start);
      return;
    }
    if (start.data.media) {
      await markSaved(itemId, mediaId, start.data.media.id, start.data.media.status);
      return;
    }
    media = (await updateMedia(itemId, mediaId, {
      upload_id: start.data.upload.id,
      received_bytes: start.data.upload.received_bytes,
      chunk_bytes: start.data.upload.chunk_bytes,
    }))!;
  }

  // 2. Chunks from the server's offset (never from zero after a drop).
  for (;;) {
    while (media.received_bytes < media.size_bytes) {
      if (!online() || getSnapshot().paused) {
        await updateMedia(itemId, mediaId, { state: "waiting" });
        return;
      }
      media = (await updateMedia(itemId, mediaId, { state: "uploading" }))!;
      const offset = media.received_bytes;
      const chunk = blob.slice(offset, Math.min(offset + media.chunk_bytes, media.size_bytes));
      const sent = await apiWithTimeout(
        "MED-02.send",
        { params: { upload_id: media.upload_id! }, body: chunk, headers: { "Upload-Offset": String(offset) }, receipt_secret: secret },
        60_000,
      );
      if (sent.ok) {
        media = (await updateMedia(itemId, mediaId, { received_bytes: sent.data.received_bytes, attempts: 0 }))!;
        continue;
      }
      const code = sent.error.code;
      if (code === "offset_mismatch" || code === "hash_mismatch") {
        const progress = await api("MED-02.progress", { params: { upload_id: media.upload_id! }, receipt_secret: secret });
        if (progress.ok) {
          media = (await updateMedia(itemId, mediaId, { received_bytes: progress.data.received_bytes }))!;
          continue;
        }
        await failMedia(itemId, media, progress);
        return;
      }
      if (code === "upload_expired") {
        // G15: a new session (and a new key) for the same client_media_id.
        await updateMedia(itemId, mediaId, { start_key: uuidv4(), upload_id: null, received_bytes: 0, state: "waiting", next_at: 0 });
        again = true;
        return;
      }
      if (code === "upload_completed") break;
      await failMedia(itemId, media, sent);
      return;
    }

    // 3. Complete. Saved from here: the bytes are safe and verified.
    const done = await api("MED-03", { params: { upload_id: media.upload_id! }, body: {}, idempotency_key: media.complete_key, receipt_secret: secret });
    if (done.ok) {
      await markSaved(itemId, mediaId, done.data.media.id, done.data.media.status);
      return;
    }
    if (done.error.code === "offset_mismatch") {
      const progress: Awaited<ReturnType<typeof api<"MED-02.progress">>> = await api("MED-02.progress", { params: { upload_id: media.upload_id! }, receipt_secret: secret });
      if (!progress.ok) {
        await failMedia(itemId, media, progress);
        return;
      }
      media = (await updateMedia(itemId, mediaId, { received_bytes: progress.data.received_bytes }))!;
      continue;
    }
    if (done.error.code === "hash_mismatch" && !media.hash_retry) {
      // The server reset the session to 0: resend once, automatically.
      media = (await updateMedia(itemId, mediaId, { hash_retry: true, received_bytes: 0, complete_key: uuidv4() }))!;
      continue;
    }
    if (done.error.code === "upload_expired") {
      await updateMedia(itemId, mediaId, { start_key: uuidv4(), upload_id: null, received_bytes: 0, state: "waiting", next_at: 0 });
      again = true;
      return;
    }
    await failMedia(itemId, media, done);
    return;
  }
}

/** "Try again" on one attachment. */
export async function retryMedia(itemId: string, mediaId: string) {
  await updateMedia(itemId, mediaId, { state: "waiting", attempts: 0, next_at: 0, error_code: null });
  kick();
}
