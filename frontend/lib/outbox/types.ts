import type { Category, IncidentCreateRequest, MediaStatus, ReportStatus } from "../api/types";
import type { DraftMedia } from "../drafts";

/**
 * Outbox item states (contract 2.1 client states, README R1):
 * queued = `on_device`, sending, unconfirmed = `not_confirmed`,
 * needs_attention, waiting_code (code revoked), received (server confirmed).
 */
export type OutboxState = "queued" | "sending" | "unconfirmed" | "needs_attention" | "waiting_code" | "received";

/** Why a queued or unconfirmed item is waiting. */
export type WaitReason = "network" | "server" | "busy" | "intake_paused" | "auth" | null;

export type MediaState = "waiting" | "uploading" | "saved" | "failed" | "missing" | "rejected";

export type OutboxMedia = DraftMedia & {
  /** Idempotency-Key for MED-01; replaced only when the session expired (G15). */
  start_key: string;
  /** Idempotency-Key for MED-03. */
  complete_key: string;
  upload_id: string | null;
  received_bytes: number;
  chunk_bytes: number;
  state: MediaState;
  error_code: string | null;
  media_id: string | null;
  attempts: number;
  next_at: number;
  /** A hash mismatch was already resent once. */
  hash_retry: boolean;
  /** REP-03 media status after MED-03. */
  server_status: MediaStatus | null;
};

export type ServerReceipt = {
  id: string;
  receipt_code: string;
  received_at: string;
  withdrawn: boolean;
  max_items: number;
  max_total_bytes: number;
};

export type OutboxSummary = {
  category_observer: Category | null;
  place_label: string | null;
  ward_name: string | null;
  ward_code: string | null;
  occurred_at: string | null;
};

export type OutboxItem = {
  /** The report's Idempotency-Key (the draft id). */
  id: string;
  owner: string;
  channel: "observer" | "citizen";
  created_at: number;
  device_saved_at: string;
  /** The request body. Set to null once the server confirmed it (R8). */
  body: IncidentCreateRequest | null;
  receipt_secret?: string;
  state: OutboxState;
  wait_reason: WaitReason;
  attempts: number;
  next_at: number;
  last_error: { code: string; fields?: Record<string, { code: string; limit?: number }> } | null;
  server: ServerReceipt | null;
  media: OutboxMedia[];
  summary: OutboxSummary;
};

/** Minimal on-phone index of a received report (contract amendment G9). No text, no media. */
export type ReceivedEntry = {
  /** Server id. */
  id: string;
  owner: string;
  client_id: string;
  receipt_code: string;
  category_observer: Category | null;
  ward_code: string | null;
  ward_name: string | null;
  status: ReportStatus;
  received_at: string;
  occurred_at: string | null;
  /** Citizen only, kept while "Keep this code on this phone" is on. */
  receipt_secret?: string;
};

export type PauseReason = "auth" | "revoked" | null;

export type OutboxSnapshot = {
  loaded: boolean;
  items: OutboxItem[];
  received: ReceivedEntry[];
  draftIds: string[];
  paused: PauseReason;
};

/** One honest state per report, for every screen (useReportState). */
export type ReportViewState =
  | "draft"
  | "on_phone"
  | "sending"
  | "not_confirmed"
  | "needs_attention"
  | "waiting_code"
  | "received"
  | "in_review"
  | "question"
  | "closed"
  | "withdrawn"
  | "unknown";
