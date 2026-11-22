/**
 * The typed fetch wrapper for every contract (docs/design/api-contracts.md).
 *
 * - One function, `api(op, input)`, implements `ApiCall` from contracts.ts.
 * - CSRF (1.2): unsafe methods carry `X-CSRFToken` from AUTH-01. The token is
 *   fetched once per page load, dropped after AUTH-02 / AUTH-03 / AUTH-06 (the
 *   server rotates it), and fetched again once when a call returns
 *   `403 csrf_failed`.
 * - Idempotency (1.5): every unsafe request carries `Idempotency-Key`. Callers
 *   pass the key that was made when the item entered the outbox; a key is made
 *   here only when none is given (the server ignores it where not required).
 * - One error shape (1.4): every failure resolves (never throws) to
 *   `{ ok: false, status, error: { code, message, fields? }, retry_after_seconds }`;
 *   no response at all is `status: 0, code: "network_error"`.
 * - Retry (1.7): `retryDelay()` gives the contract back-off (2 s, 4 s, 8 s ...
 *   capped at 5 min, ±20 % jitter) and `retryPlan()` classifies a result. Writes
 *   are retried by the outbox with the same key, never silently here.
 */

import { API_BASE, OPERATIONS, type OperationSpec, type ApiCall, type ApiResult, type CallInput, type OperationId, type ResponseOf } from "./contracts";
import type { ErrorCode } from "./types";

const UNSAFE = new Set(["POST", "PUT", "PATCH", "DELETE"]);
/** Operations that send the phone clock (1.3). */
const DEVICE_TIME_OPS = new Set<OperationId>(["REP-01", "REP-05", "MSG-02"]);
/** Operations after which Django rotates the CSRF token (1.2). */
const ROTATES_CSRF = new Set<OperationId>(["AUTH-02", "AUTH-03", "AUTH-04", "AUTH-05.verify", "AUTH-05.enrol_confirm", "AUTH-06"]);

/** 20 s covers one request on a slow 2G link (O-11 "Not confirmed" after 20 s). */
export const DEFAULT_TIMEOUT_MS = 20_000;

/* ---------- Events the shell listens to (R5) ---------- */

export type ApiEvent = { type: "not_authenticated" | "code_revoked" | "network_error" | "network_ok"; op: OperationId };
const listeners = new Set<(event: ApiEvent) => void>();

/** Subscribe to session and network signals seen on any call. */
export function onApiEvent(listener: (event: ApiEvent) => void): () => void {
  listeners.add(listener);
  return () => listeners.delete(listener);
}

function emit(event: ApiEvent) {
  for (const listener of listeners) listener(event);
}

/* ---------- Helpers ---------- */

export function uuidv4(): string {
  if (typeof crypto !== "undefined" && typeof crypto.randomUUID === "function") return crypto.randomUUID();
  const bytes = new Uint8Array(16);
  crypto.getRandomValues(bytes);
  bytes[6] = (bytes[6] & 0x0f) | 0x40;
  bytes[8] = (bytes[8] & 0x3f) | 0x80;
  const hex = Array.from(bytes, (b) => b.toString(16).padStart(2, "0")).join("");
  return `${hex.slice(0, 8)}-${hex.slice(8, 12)}-${hex.slice(12, 16)}-${hex.slice(16, 20)}-${hex.slice(20)}`;
}

/** ISO 8601 with the phone's own offset, e.g. "2026-12-05T09:14:31+01:00". */
export function isoWithOffset(date: Date = new Date()): string {
  const pad = (n: number) => String(Math.trunc(Math.abs(n))).padStart(2, "0");
  const offset = -date.getTimezoneOffset();
  const sign = offset >= 0 ? "+" : "-";
  return (
    `${date.getFullYear()}-${pad(date.getMonth() + 1)}-${pad(date.getDate())}` +
    `T${pad(date.getHours())}:${pad(date.getMinutes())}:${pad(date.getSeconds())}` +
    `${sign}${pad(offset / 60)}:${pad(offset % 60)}`
  );
}

function currentLanguage(): string {
  try {
    return window.localStorage.getItem("eg.locale") ?? "en";
  } catch {
    return "en";
  }
}

function buildPath(template: string, params: Record<string, string> | undefined): string {
  return template.replace(/\{(\w+)\}/g, (_, name: string) => {
    const value = params?.[name];
    if (value === undefined) throw new Error(`Missing path parameter "${name}" for ${template}`);
    return encodeURIComponent(value);
  });
}

function buildQuery(query: object | undefined): string {
  if (!query) return "";
  const search = new URLSearchParams();
  for (const [key, value] of Object.entries(query)) {
    if (value === undefined || value === null || value === "") continue;
    search.set(key, String(value));
  }
  const text = search.toString();
  return text ? `?${text}` : "";
}

function parseRetryAfter(value: string | null): number | null {
  if (!value) return null;
  const seconds = Number(value);
  if (Number.isFinite(seconds)) return Math.max(0, seconds);
  const date = Date.parse(value);
  return Number.isNaN(date) ? null : Math.max(0, Math.round((date - Date.now()) / 1000));
}

/* ---------- CSRF (AUTH-01) ---------- */

let csrfToken: string | null = null;
let csrfRequest: Promise<string | null> | null = null;

async function getCsrf(force = false): Promise<string | null> {
  if (force) csrfToken = null;
  if (csrfToken) return csrfToken;
  if (!csrfRequest) {
    csrfRequest = (async () => {
      const result = await send("AUTH-01", {} as CallInput<"AUTH-01">, false);
      csrfRequest = null;
      if (result.ok) csrfToken = result.data.csrf_token;
      return csrfToken;
    })();
  }
  return csrfRequest;
}

/** Forget the token (after sign-in or sign-out). The next write fetches a new one. */
export function resetCsrf() {
  csrfToken = null;
}

/* ---------- The call ---------- */

type AnyInput = {
  params?: Record<string, string>;
  body?: unknown;
  query?: object;
  idempotency_key?: string;
  receipt_secret?: string;
  headers?: Record<string, string>;
  signal?: AbortSignal;
  timeout_ms?: number;
};

async function send<Op extends OperationId>(op: Op, rawInput: CallInput<Op>, withCsrf: boolean): Promise<ApiResult<ResponseOf<Op>>> {
  const spec = OPERATIONS[op] as OperationSpec;
  const input = rawInput as AnyInput;
  const url = API_BASE + buildPath(spec.path, input.params) + buildQuery(input.query);
  const headers = new Headers({ Accept: "application/json", "Accept-Language": currentLanguage() });
  const unsafe = UNSAFE.has(spec.method);

  if (unsafe && withCsrf) {
    const token = await getCsrf();
    if (token) headers.set("X-CSRFToken", token);
  }
  if (unsafe && op !== "MED-02.send" && !op.startsWith("MED-05") && !op.startsWith("AUTH-")) {
    headers.set("Idempotency-Key", input.idempotency_key ?? uuidv4());
  }
  if (DEVICE_TIME_OPS.has(op)) headers.set("X-Device-Time", isoWithOffset());
  if (input.receipt_secret) headers.set("X-Receipt-Secret", input.receipt_secret);
  for (const [key, value] of Object.entries(input.headers ?? {})) headers.set(key, value);

  let body: BodyInit | undefined;
  if (input.body !== undefined) {
    if (spec.body === "octet-stream") {
      headers.set("Content-Type", "application/offset+octet-stream");
      body = input.body as Blob;
    } else if (spec.body === "multipart") {
      const form = new FormData();
      for (const [key, value] of Object.entries(input.body as Record<string, unknown>)) {
        if (value === undefined || value === null) continue;
        form.set(key, value instanceof Blob ? value : String(value));
      }
      body = form;
    } else {
      headers.set("Content-Type", "application/json; charset=utf-8");
      body = JSON.stringify(input.body);
    }
  } else if (unsafe && spec.body === "json") {
    headers.set("Content-Type", "application/json; charset=utf-8");
    body = "{}";
  }

  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort("timeout"), input.timeout_ms ?? DEFAULT_TIMEOUT_MS);
  const abortFromCaller = () => controller.abort(input.signal?.reason);
  input.signal?.addEventListener("abort", abortFromCaller, { once: true });

  let response: Response;
  try {
    response = await fetch(url, {
      method: spec.method,
      headers,
      body,
      credentials: "same-origin",
      cache: "no-store",
      signal: controller.signal,
    });
  } catch (error) {
    emit({ type: "network_error", op });
    const message = controller.signal.aborted && controller.signal.reason === "timeout" ? "timeout" : String((error as Error)?.message ?? error);
    return { ok: false, status: 0, error: { code: "network_error", message }, retry_after_seconds: null };
  } finally {
    clearTimeout(timeout);
    input.signal?.removeEventListener("abort", abortFromCaller);
  }
  emit({ type: "network_ok", op });

  const etag = response.headers.get("ETag");
  if (response.status === 204 || response.status === 304) {
    return { ok: true, status: response.status, data: undefined as unknown as ResponseOf<Op>, replayed: false, etag };
  }

  let payload: unknown = null;
  const type = response.headers.get("Content-Type") ?? "";
  try {
    payload = type.includes("json") ? await response.json() : await response.blob();
  } catch {
    payload = null;
  }

  if (response.ok) {
    if (ROTATES_CSRF.has(op)) resetCsrf();
    return {
      ok: true,
      status: response.status,
      data: payload as ResponseOf<Op>,
      replayed: response.headers.get("Idempotent-Replayed") === "true",
      etag,
    };
  }

  const error = (payload as { error?: { code?: string; message?: string; fields?: unknown } } | null)?.error;
  const code = (error?.code ??
    (response.status >= 500 ? "service_unavailable" : response.status === 404 ? "not_found" : "bad_request")) as ErrorCode;
  if (code === "not_authenticated") emit({ type: "not_authenticated", op });
  if (code === "code_revoked") emit({ type: "code_revoked", op });
  return {
    ok: false,
    status: response.status,
    error: {
      code,
      message: error?.message ?? response.statusText,
      ...(error?.fields ? { fields: error.fields as Record<string, never> } : {}),
    },
    retry_after_seconds: parseRetryAfter(response.headers.get("Retry-After")),
  };
}

/** Call any contract operation. Never throws for HTTP or network failures. */
export const api: ApiCall = async (op, input) => {
  const first = await send(op, input, true);
  if (!first.ok && first.status === 403 && first.error.code === "csrf_failed") {
    await getCsrf(true);
    return send(op, input, true);
  }
  return first;
};

/** `api` with a per-call timeout (ms). */
export function apiWithTimeout<Op extends OperationId>(op: Op, input: CallInput<Op>, timeoutMs: number) {
  return api(op, { ...(input as object), timeout_ms: timeoutMs } as unknown as CallInput<Op>);
}

/* ---------- Retry policy (contract 1.7, README R4) ---------- */

export const RETRY_BASE_MS = 2_000;
export const RETRY_CAP_MS = 5 * 60_000;

/** Back-off before attempt `attempt + 1`: 2 s, 4 s, 8 s ... capped at 5 min, ±20 % jitter. */
export function retryDelay(attempt: number, random: () => number = Math.random): number {
  const base = Math.min(RETRY_CAP_MS, RETRY_BASE_MS * 2 ** Math.max(0, attempt));
  const jitter = 1 + (random() * 0.4 - 0.2);
  return Math.round(base * jitter);
}

export type RetryPlan =
  /** Sent and confirmed. */
  | { kind: "done" }
  /** Keep the item; try again after `delayMs` with the same key. */
  | { kind: "retry"; delayMs: number; reason: "network" | "server" | "busy" | "intake_paused" }
  /** Session expired: pause everything and ask for the PIN. */
  | { kind: "auth" }
  /** Code revoked: pause and wait for a new code. */
  | { kind: "revoked" }
  /** Refused for good: stop this item and show "Needs your attention". */
  | { kind: "stop"; code: string };

/** Classify a result per contract 1.7. `attempt` counts previous failed tries. */
export function retryPlan(result: ApiResult<unknown>, attempt: number): RetryPlan {
  if (result.ok) return { kind: "done" };
  const after = result.retry_after_seconds;
  const code = result.error.code;
  if (result.status === 0) return { kind: "retry", delayMs: retryDelay(attempt), reason: "network" };
  if (code === "not_authenticated") return { kind: "auth" };
  if (code === "code_revoked") return { kind: "revoked" };
  if (code === "intake_paused") return { kind: "retry", delayMs: (after ?? 600) * 1000, reason: "intake_paused" };
  if (code === "request_in_progress" || code === "rate_limited") {
    return { kind: "retry", delayMs: Math.max(1, after ?? 2) * 1000, reason: "busy" };
  }
  if (result.status >= 500) {
    return { kind: "retry", delayMs: after !== null ? after * 1000 : retryDelay(attempt), reason: "server" };
  }
  return { kind: "stop", code };
}

/**
 * For safe reads (GET) only: retry network and 5xx failures with the contract
 * back-off, at most `maxAttempts` times. Writes go through the outbox instead.
 */
export async function getWithRetry<Op extends OperationId>(op: Op, input: CallInput<Op>, maxAttempts = 3): Promise<ApiResult<ResponseOf<Op>>> {
  if (OPERATIONS[op].method !== "GET") throw new Error(`getWithRetry is for GET operations, not ${op}`);
  let attempt = 0;
  for (;;) {
    const result = await api(op, input);
    const plan = retryPlan(result, attempt);
    attempt += 1;
    if (plan.kind !== "retry" || attempt >= maxAttempts) return result;
    await new Promise((resolve) => setTimeout(resolve, Math.min(plan.delayMs, 30_000)));
  }
}

/**
 * Stream a JSON GET and report real progress. `onProgress(received, total)` gets
 * `total = null` when the body is compressed (the browser does not expose the
 * compressed byte count), so the screen never shows an invented percentage.
 */
export async function downloadJson<Op extends OperationId>(
  op: Op,
  input: CallInput<Op>,
  onProgress: (received: number, total: number | null) => void,
): Promise<ApiResult<ResponseOf<Op>>> {
  const spec = OPERATIONS[op];
  if (spec.method !== "GET") throw new Error(`downloadJson is for GET operations, not ${op}`);
  const raw = input as AnyInput;
  const url = API_BASE + buildPath(spec.path, raw.params) + buildQuery(raw.query);
  const headers = new Headers({ Accept: "application/json", "Accept-Language": currentLanguage(), ...(raw.headers ?? {}) });
  let response: Response;
  try {
    response = await fetch(url, { headers, credentials: "same-origin", signal: raw.signal });
  } catch (error) {
    emit({ type: "network_error", op });
    return { ok: false, status: 0, error: { code: "network_error", message: String((error as Error)?.message ?? error) }, retry_after_seconds: null };
  }
  emit({ type: "network_ok", op });
  if (response.status === 304) return { ok: true, status: 304, data: undefined as unknown as ResponseOf<Op>, replayed: false, etag: response.headers.get("ETag") };
  if (!response.ok || !response.body) {
    let error: { code?: string; message?: string } | undefined;
    try {
      error = ((await response.json()) as { error?: typeof error }).error;
    } catch {
      error = undefined;
    }
    return {
      ok: false,
      status: response.status,
      error: { code: (error?.code ?? (response.status >= 500 ? "service_unavailable" : "not_found")) as ErrorCode, message: error?.message ?? response.statusText },
      retry_after_seconds: parseRetryAfter(response.headers.get("Retry-After")),
    };
  }
  const encoded = Boolean(response.headers.get("Content-Encoding"));
  const length = Number(response.headers.get("Content-Length"));
  const total = !encoded && Number.isFinite(length) && length > 0 ? length : null;
  const reader = response.body.getReader();
  const parts: Uint8Array[] = [];
  let received = 0;
  onProgress(0, total);
  for (;;) {
    const { done, value } = await reader.read();
    if (done) break;
    parts.push(value);
    received += value.byteLength;
    onProgress(received, total);
  }
  const text = new TextDecoder().decode(await new Blob(parts as BlobPart[]).arrayBuffer());
  return { ok: true, status: response.status, data: JSON.parse(text) as ResponseOf<Op>, replayed: false, etag: response.headers.get("ETag") };
}
