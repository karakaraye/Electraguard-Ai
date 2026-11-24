/**
 * In-memory mirror of the outbox and the received index, written through to
 * IndexedDB, with a subscribe() for React (useSyncExternalStore).
 */

import { uuidv4 } from "../api/client";
import type { IncidentCreateRequest } from "../api/types";
import { atomically, getAll, idbAvailable, put } from "../drafts/db";
import type { IncidentDraft } from "../drafts";
import type { OutboxItem, OutboxMedia, OutboxSnapshot, PauseReason, ReceivedEntry } from "./types";

/** Phone limits (plan 4.6, contract 1.7). */
export const MAX_QUEUED_REPORTS = 20;
export const MAX_QUEUED_MEDIA_BYTES = 150 * 1000 * 1000;

let snapshot: OutboxSnapshot = { loaded: false, items: [], received: [], draftIds: [], paused: null };
const listeners = new Set<() => void>();

function emit() {
  for (const listener of listeners) listener();
}

export function subscribe(listener: () => void): () => void {
  listeners.add(listener);
  return () => listeners.delete(listener);
}

export function getSnapshot(): OutboxSnapshot {
  return snapshot;
}

const serverSnapshot: OutboxSnapshot = { loaded: false, items: [], received: [], draftIds: [], paused: null };
export function getServerSnapshot(): OutboxSnapshot {
  return serverSnapshot;
}

function set(next: Partial<OutboxSnapshot>) {
  snapshot = { ...snapshot, ...next };
  emit();
}

let loading: Promise<void> | null = null;

/** Read everything from IndexedDB. Items left in `sending` by an app kill become `unconfirmed` (R1). */
export function loadOutbox(): Promise<void> {
  if (!idbAvailable()) {
    set({ loaded: true });
    return Promise.resolve();
  }
  if (!loading) {
    loading = (async () => {
      const [items, received, drafts] = await Promise.all([
        getAll<OutboxItem>("outbox"),
        getAll<ReceivedEntry>("received"),
        getAll<IncidentDraft>("drafts"),
      ]);
      const repaired: OutboxItem[] = [];
      for (const item of items) {
        let changed = false;
        if (item.state === "sending") {
          item.state = "unconfirmed";
          item.next_at = 0;
          changed = true;
        }
        for (const media of item.media) {
          if (media.state === "uploading") {
            media.state = "waiting";
            media.next_at = 0;
            changed = true;
          }
        }
        if (changed) await put("outbox", item);
        repaired.push(item);
      }
      repaired.sort((a, b) => a.created_at - b.created_at);
      set({ loaded: true, items: repaired, received, draftIds: drafts.map((draft) => draft.id) });
    })().finally(() => {
      loading = null;
    });
  }
  return loading;
}

export async function refreshDraftIds(): Promise<void> {
  if (!idbAvailable()) return;
  const drafts = await getAll<IncidentDraft>("drafts");
  set({ draftIds: drafts.map((draft) => draft.id) });
}

export function setPaused(paused: PauseReason) {
  if (snapshot.paused !== paused) set({ paused });
}

/** Write one item and update the mirror. */
export async function saveItem(item: OutboxItem): Promise<void> {
  const items = snapshot.items.some((existing) => existing.id === item.id)
    ? snapshot.items.map((existing) => (existing.id === item.id ? item : existing))
    : [...snapshot.items, item];
  set({ items });
  await put("outbox", item);
}

/** Progress-only change: update the mirror now, write to the phone too (offset resume). */
export async function saveMedia(item: OutboxItem, media: OutboxMedia): Promise<void> {
  const next = { ...item, media: item.media.map((m) => (m.client_media_id === media.client_media_id ? media : m)) };
  await saveItem(next);
}

export async function saveReceived(entry: ReceivedEntry): Promise<void> {
  set({ received: [...snapshot.received.filter((existing) => existing.id !== entry.id), entry] });
  await put("received", entry);
}

export function itemsFor(owner: string): OutboxItem[] {
  return snapshot.items.filter((item) => item.owner === owner);
}

/** Items the observer still has to think about (not yet received). */
export function unsentFor(owner: string): OutboxItem[] {
  return itemsFor(owner).filter((item) => item.state !== "received");
}

export class QueueFullError extends Error {
  constructor() {
    super("queue_full");
  }
}
export class StorageFullError extends Error {
  constructor() {
    super("storage_full");
  }
}

/** Media bytes waiting on this phone (all owners). */
export function queuedMediaBytes(): number {
  let total = 0;
  for (const item of snapshot.items) {
    for (const media of item.media) if (media.state !== "saved" && media.state !== "rejected") total += media.size_bytes;
  }
  return total;
}

/** Turn the draft into the REP-01 / REP-05 body. Fields are already wire values. */
export function draftToBody(draft: IncidentDraft): IncidentCreateRequest {
  const body: IncidentCreateRequest = {
    kind: "incident",
    language: draft.language,
    occurred_at: draft.occurred_at ?? new Date(draft.created_at).toISOString(),
    place: draft.place.polling_unit_code
      ? { polling_unit_code: draft.place.polling_unit_code, ...(draft.place.ward_code ? { ward_code: draft.place.ward_code } : {}) }
      : { polling_unit_code: null, ward_code: draft.place.ward_code ?? undefined },
    category_observer: draft.category_observer ?? "not_sure",
    danger_now: Boolean(draft.danger_now),
    firsthand: Boolean(draft.firsthand),
    description: draft.description.trim(),
  };
  if (draft.category_observer === "access_barrier" && draft.access_barrier_details.length) {
    body.access_barrier_details = draft.access_barrier_details;
  }
  if (draft.input_method) body.input_method = draft.input_method;
  if (draft.from_checklist_question) {
    body.from_checklist_question = draft.from_checklist_question;
    body.related_report_id = draft.related_report_id ?? null;
  }
  return body;
}

/**
 * Send (O-11): move the draft into the outbox in one transaction, so an app kill
 * between "tap" and "request" cannot lose it. The Idempotency-Key is the draft id.
 */
export async function enqueueDraft(draft: IncidentDraft, deviceSavedAt: string): Promise<OutboxItem> {
  const existing = snapshot.items.find((item) => item.id === draft.id);
  if (existing) return existing;
  if (unsentFor(draft.owner).length >= MAX_QUEUED_REPORTS) throw new QueueFullError();
  const mediaBytes = draft.media.reduce((sum, media) => sum + media.size_bytes, 0);
  if (queuedMediaBytes() + mediaBytes > MAX_QUEUED_MEDIA_BYTES) throw new StorageFullError();

  const item: OutboxItem = {
    id: draft.id,
    owner: draft.owner,
    channel: draft.mode,
    created_at: Date.now(),
    device_saved_at: deviceSavedAt,
    body: draftToBody(draft),
    ...(draft.receipt_secret ? { receipt_secret: draft.receipt_secret } : {}),
    state: "queued",
    wait_reason: null,
    attempts: 0,
    next_at: 0,
    last_error: null,
    server: null,
    media: draft.media.map((media) => ({
      ...media,
      start_key: uuidv4(),
      complete_key: uuidv4(),
      upload_id: null,
      received_bytes: 0,
      chunk_bytes: 262_144,
      state: "waiting",
      error_code: null,
      media_id: null,
      attempts: 0,
      next_at: 0,
      hash_retry: false,
      server_status: null,
    })),
    summary: {
      category_observer: draft.category_observer,
      place_label: draft.place.label,
      ward_name: draft.place.ward_name,
      ward_code: draft.place.ward_code,
      occurred_at: draft.occurred_at,
    },
  };
  await atomically(["drafts", "outbox"], (tx) => {
    tx.objectStore("drafts").delete(draft.owner);
    tx.objectStore("outbox").put(item);
  });
  set({ items: [...snapshot.items, item], draftIds: snapshot.draftIds.filter((id) => id !== draft.id) });
  return item;
}

/**
 * Put a "Needs your attention" item back into the draft so the observer can fix
 * it; the same key is kept (a 4xx stores nothing on the server, contract 1.5.8).
 */
export async function returnToDraft(item: OutboxItem, draft: IncidentDraft): Promise<void> {
  await atomically(["drafts", "outbox"], (tx) => {
    tx.objectStore("outbox").delete(item.id);
    tx.objectStore("drafts").put(draft);
  });
  set({ items: snapshot.items.filter((existing) => existing.id !== item.id), draftIds: [...snapshot.draftIds, draft.id] });
}

/** Delete items that were never sent (revoked code, or "Delete" on a stuck item). */
export async function removeItems(ids: string[]): Promise<void> {
  const doomed = snapshot.items.filter((item) => ids.includes(item.id));
  await atomically(["outbox", "blobs"], (tx) => {
    for (const item of doomed) {
      tx.objectStore("outbox").delete(item.id);
      for (const media of item.media) tx.objectStore("blobs").delete(media.blob_key);
    }
  });
  set({ items: snapshot.items.filter((item) => !ids.includes(item.id)) });
}

/** After a new code signs in on this phone: items waiting for a code can send again (Q3 decision). */
export async function adoptWaitingItems(newOwner: string): Promise<void> {
  for (const item of snapshot.items) {
    if (item.state === "waiting_code") {
      await saveItem({ ...item, owner: newOwner, state: item.server ? "received" : "queued", next_at: 0, wait_reason: null });
    }
  }
}

/** Code revoked: every unsent item of that code waits for a new code (R5). */
export async function markWaitingCode(owner: string): Promise<void> {
  for (const item of itemsFor(owner)) {
    const pendingMedia = item.media.some((m) => m.state !== "saved" && m.state !== "rejected" && m.state !== "missing");
    if (item.state !== "received" || pendingMedia) await saveItem({ ...item, state: "waiting_code" });
  }
}

export function waitingCodeItems(): OutboxItem[] {
  return snapshot.items.filter((item) => item.state === "waiting_code");
}

/** Test and "clear this phone" support. */
export function resetMirror() {
  snapshot = { loaded: true, items: [], received: [], draftIds: [], paused: null };
  emit();
}

/** Remove one attachment from an outbox item (MED-05 already succeeded, or it never left the phone). */
export async function removeMedia(itemId: string, clientMediaId: string): Promise<void> {
  const item = snapshot.items.find((existing) => existing.id === itemId);
  const media = item?.media.find((m) => m.client_media_id === clientMediaId);
  if (!item || !media) return;
  await saveItem({ ...item, media: item.media.filter((m) => m.client_media_id !== clientMediaId) });
  await atomically(["blobs"], (tx) => {
    tx.objectStore("blobs").delete(media.blob_key);
    if (media.plain_blob_key) tx.objectStore("blobs").delete(media.plain_blob_key);
  });
}

/** "Choose the file again": a new, prepared file for the same attachment, with new keys and a new session. */
export async function replaceMediaFile(
  itemId: string,
  clientMediaId: string,
  file: { blob_key: string; content_type: string; size_bytes: number; sha256: string; duration_ms: number | null },
): Promise<void> {
  const item = snapshot.items.find((existing) => existing.id === itemId);
  if (!item) return;
  await saveItem({
    ...item,
    media: item.media.map((m) =>
      m.client_media_id === clientMediaId
        ? {
            ...m,
            ...file,
            start_key: uuidv4(),
            complete_key: uuidv4(),
            upload_id: null,
            received_bytes: 0,
            state: "waiting",
            error_code: null,
            attempts: 0,
            next_at: 0,
            hash_retry: false,
            server_status: null,
          }
        : m,
    ),
  });
}

/** REP-03 media status after MED-03 (processing → ready / failed). */
export async function setServerMediaStatus(itemId: string, mediaId: string, status: OutboxMedia["server_status"]): Promise<void> {
  const item = snapshot.items.find((existing) => existing.id === itemId);
  if (!item) return;
  const target = item.media.find((m) => m.media_id === mediaId);
  if (!target || target.server_status === status) return;
  await saveMedia(item, { ...target, server_status: status, state: status === "failed" ? "missing" : target.state });
}
