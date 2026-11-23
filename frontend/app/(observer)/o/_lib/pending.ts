"use client";

/**
 * Writes that are not incident reports, kept on the phone until the server
 * confirms them: checklist stages and result-sheet checks (REP-01), messages and
 * formal-question replies (MSG-02), and discussion posts (DIS-03.post).
 *
 * The shared outbox (lib/outbox) only carries incident reports today; this small
 * queue follows the same rules (README R1, R4, contract 1.5 and 1.7) until the
 * outbox takes these kinds too:
 * - the Idempotency-Key is made once, when the item enters the queue, and every
 *   retry reuses it, so the server never stores a write twice;
 * - one item at a time, oldest first; retries back off with the contract policy
 *   and wait for Retry-After on 409 request_in_progress, 429 and 503;
 * - a refusal for good (4xx) stops the item as "needs attention" and keeps its text;
 * - items belong to the observer code that made them (shared phones, R2);
 * - text leaves the phone as soon as the server confirms it (R8).
 */

import { useSyncExternalStore } from "react";
import { api, retryPlan, uuidv4 } from "../../../../lib/api/client";
import type { ApiResult } from "../../../../lib/api/contracts";
import type {
  ChecklistCreateRequest,
  CreatePostRequest,
  PostMessageRequest,
  PostMessageResponse,
  Post,
  ReportCreateResponse,
  ResultSheetCreateRequest,
} from "../../../../lib/api/types";
import { del, getBlob } from "../../../../lib/drafts/db";
import { markStageReceived, markStageWaiting } from "./checklist";
import { uploadPhoto } from "./upload";

export type PendingKind = "checklist" | "result_sheet" | "message" | "post";
export type PendingState = "queued" | "sending" | "unconfirmed" | "needs_attention";

type Base = {
  key: string;
  owner: string;
  created_at: number;
  state: PendingState;
  attempts: number;
  next_at: number;
  wait: "network" | "server" | "busy" | "intake_paused" | "auth" | null;
  error_code: string | null;
  fields: Record<string, { code: string; limit?: number }> | null;
};

export type PendingItem =
  | (Base & { kind: "checklist"; stage: string; day: string; body: ChecklistCreateRequest })
  | (Base & {
      kind: "result_sheet";
      day: string;
      body: ResultSheetCreateRequest;
      /** The sheet photo in the phone's blob store when RS-01 did not attach it (ocr_id null). */
      photo: { blob_key: string; content_type: string; size_bytes: number; sha256: string; upload_key: string; complete_key: string } | null;
      report_id: string | null;
    })
  | (Base & { kind: "message"; report_id: string; body: PostMessageRequest })
  | (Base & { kind: "post"; discussion_id: string; body: CreatePostRequest });

const KEY = "eg.pending";

type Snapshot = { items: PendingItem[] };
let snapshot: Snapshot | null = null;
const listeners = new Set<() => void>();
const empty: Snapshot = { items: [] };

function read(): Snapshot {
  if (snapshot) return snapshot;
  try {
    const raw = window.localStorage.getItem(KEY);
    const items = raw ? (JSON.parse(raw) as PendingItem[]) : [];
    // An app kill while sending: the item is "not confirmed" and resends with the same key.
    snapshot = { items: items.map((item) => (item.state === "sending" ? { ...item, state: "unconfirmed", next_at: 0 } : item)) };
  } catch {
    snapshot = { items: [] };
  }
  return snapshot;
}

function write(items: PendingItem[]) {
  snapshot = { items };
  try {
    window.localStorage.setItem(KEY, JSON.stringify(items));
  } catch {
    // Storage blocked: the queue lives for this visit only.
  }
  for (const listener of listeners) listener();
}

function patch(key: string, change: Partial<PendingItem>) {
  write(read().items.map((item) => (item.key === key ? ({ ...item, ...change } as PendingItem) : item)));
}

function remove(key: string) {
  write(read().items.filter((item) => item.key !== key));
}

export function usePending(): PendingItem[] {
  return useSyncExternalStore(
    (listener) => {
      listeners.add(listener);
      return () => listeners.delete(listener);
    },
    () => read(),
    () => empty,
  ).items;
}

export function pendingFor(owner: string): PendingItem[] {
  return read().items.filter((item) => item.owner === owner);
}

type NewItem = PendingItem extends infer T ? (T extends PendingItem ? Omit<T, keyof Base> & { owner: string } : never) : never;

/** Put a write in the queue with a fresh Idempotency-Key and try to send it now. */
export function enqueue(item: NewItem): PendingItem {
  const full = {
    ...item,
    key: uuidv4(),
    created_at: Date.now(),
    state: "queued",
    attempts: 0,
    next_at: 0,
    wait: null,
    error_code: null,
    fields: null,
  } as PendingItem;
  write([...read().items, full]);
  kickPending();
  return full;
}

/** "Delete" on a stuck item, or "Sign out and clear this phone". */
export async function dropPending(key: string) {
  const item = read().items.find((candidate) => candidate.key === key);
  if (item?.kind === "result_sheet" && item.photo) await del("blobs", item.photo.blob_key).catch(() => undefined);
  remove(key);
}

/** Retry a "needs attention" item after the observer changed it (same key: a 4xx stored nothing). */
export function retryPending(key: string, body?: PendingItem["body"]) {
  patch(key, { state: "queued", next_at: 0, attempts: 0, error_code: null, fields: null, ...(body ? { body } : {}) } as Partial<PendingItem>);
  kickPending();
}

/* ---------- Results the screens wait for ---------- */

type Done =
  | { kind: "message"; key: string; data: PostMessageResponse }
  | { kind: "post"; key: string; data: { post: Post } }
  | { kind: "report"; key: string; data: ReportCreateResponse };
const doneListeners = new Set<(done: Done) => void>();

/** Called once per confirmed write (for example to show "Answer sent"). */
export function onPendingDone(listener: (done: Done) => void): () => void {
  doneListeners.add(listener);
  return () => doneListeners.delete(listener);
}

function announce(done: Done) {
  for (const listener of doneListeners) listener(done);
}

/* ---------- The send loop ---------- */

let owners: () => string[] = () => [];
let running = false;
let timer: number | null = null;
let wired = false;

function online() {
  return typeof navigator === "undefined" || navigator.onLine;
}

/** Start (or keep) the loop for the signed-in code. Safe to call from every screen. */
export function startPending(getOwners: () => string[]) {
  owners = getOwners;
  if (!wired && typeof window !== "undefined") {
    wired = true;
    window.addEventListener("online", () => kickPending(true));
  }
  kickPending();
}

/** Try now. `force` also sends items that are waiting out a back-off. */
export function kickPending(force = false) {
  if (typeof window === "undefined") return;
  if (force) write(read().items.map((item) => (item.state === "queued" || item.state === "unconfirmed" ? { ...item, next_at: 0 } : item)));
  if (timer !== null) window.clearTimeout(timer);
  timer = null;
  if (!running) void run();
}

async function run() {
  running = true;
  try {
    for (;;) {
      if (!online()) break;
      const now = Date.now();
      const next = read().items.find(
        (item) => owners().includes(item.owner) && (item.state === "queued" || item.state === "unconfirmed") && item.next_at <= now && item.wait !== "auth",
      );
      if (!next) break;
      await send(next);
    }
  } finally {
    running = false;
  }
  const waiting = read().items.filter((item) => owners().includes(item.owner) && (item.state === "queued" || item.state === "unconfirmed") && item.wait !== "auth");
  if (waiting.length) {
    const soonest = Math.min(...waiting.map((item) => item.next_at));
    timer = window.setTimeout(() => void run(), Math.max(1_000, soonest - Date.now()));
  }
}

/** After the PIN sheet signs in again: items paused for the session resume. */
export function resumeAfterSignIn() {
  write(read().items.map((item) => (item.wait === "auth" ? { ...item, wait: null, next_at: 0 } : item)));
  kickPending();
}

async function call(item: PendingItem): Promise<ApiResult<unknown>> {
  switch (item.kind) {
    case "checklist":
      return api("REP-01", { body: item.body, idempotency_key: item.key });
    case "result_sheet":
      return api("REP-01", { body: item.body, idempotency_key: item.key });
    case "message":
      return api("MSG-02", { params: { report_id: item.report_id }, body: item.body, idempotency_key: item.key });
    case "post":
      return api("DIS-03.post", { params: { id: item.discussion_id }, body: item.body, idempotency_key: item.key });
  }
}

async function send(item: PendingItem) {
  // A result sheet whose report is already received only has its photo left.
  if (item.kind === "result_sheet" && item.report_id) {
    await sendPhoto(item, item.report_id);
    return;
  }
  patch(item.key, { state: "sending" });
  const result = await call(item);
  const plan = retryPlan(result, item.attempts);

  if (plan.kind === "done" && result.ok) {
    if (item.kind === "message") {
      remove(item.key);
      announce({ kind: "message", key: item.key, data: result.data as PostMessageResponse });
    } else if (item.kind === "post") {
      remove(item.key);
      announce({ kind: "post", key: item.key, data: result.data as { post: Post } });
    } else {
      const data = result.data as ReportCreateResponse;
      if (item.kind === "checklist") {
        markStageReceived(item.owner, item.day, item.stage, data);
        remove(item.key);
      } else if (item.photo) {
        patch(item.key, { report_id: data.id, state: "queued", attempts: 0, next_at: 0, body: { ...item.body } } as Partial<PendingItem>);
        markStageReceived(item.owner, item.day, "sheet", data);
        await sendPhoto({ ...item, report_id: data.id }, data.id);
      } else {
        markStageReceived(item.owner, item.day, "sheet", data);
        remove(item.key);
      }
      announce({ kind: "report", key: item.key, data });
    }
    return;
  }

  if (plan.kind === "retry") {
    const leftThePhone = result.status !== 0 || online();
    patch(item.key, {
      state: plan.reason === "intake_paused" || !leftThePhone ? "queued" : "unconfirmed",
      wait: plan.reason,
      attempts: item.attempts + 1,
      next_at: Date.now() + plan.delayMs,
    });
    return;
  }
  if (plan.kind === "auth" || plan.kind === "revoked") {
    // The runtime opens the PIN sheet (or the revoked view) from the same API event.
    patch(item.key, { state: item.attempts > 0 ? "unconfirmed" : "queued", wait: "auth", next_at: 0 });
    return;
  }
  const fields = !result.ok ? ((result.error as { fields?: Base["fields"] }).fields ?? null) : null;
  patch(item.key, { state: "needs_attention", wait: null, error_code: plan.kind === "stop" ? plan.code : "bad_request", fields });
  if (item.kind === "checklist") markStageWaiting(item.owner, item.day, item.stage, "needs_attention");
}

async function sendPhoto(item: Extract<PendingItem, { kind: "result_sheet" }>, reportId: string) {
  const photo = item.photo;
  if (!photo) {
    remove(item.key);
    return;
  }
  const blob = await getBlob(photo.blob_key).catch(() => null);
  if (!blob) {
    remove(item.key);
    return;
  }
  const result = await uploadPhoto({ reportId, blob, ...photo });
  if (result.kind === "saved" || result.kind === "refused") {
    await del("blobs", photo.blob_key).catch(() => undefined);
    remove(item.key);
    return;
  }
  patch(item.key, { state: "queued", attempts: item.attempts + 1, next_at: Date.now() + result.delayMs, wait: "network" });
}
