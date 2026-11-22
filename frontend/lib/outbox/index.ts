"use client";

import { useEffect, useSyncExternalStore } from "react";
import { getServerSnapshot, getSnapshot, loadOutbox, subscribe } from "./store";
import type { MediaState, OutboxItem, OutboxSnapshot, ReceivedEntry, ReportViewState } from "./types";

export * from "./types";
export {
  adoptWaitingItems,
  enqueueDraft,
  markWaitingCode,
  MAX_QUEUED_MEDIA_BYTES,
  MAX_QUEUED_REPORTS,
  QueueFullError,
  queuedMediaBytes,
  refreshDraftIds,
  removeItems,
  resetMirror,
  returnToDraft,
  setPaused,
  StorageFullError,
  unsentFor,
  waitingCodeItems,
} from "./store";
export { kick, retryMedia, sendNow, startSync, stopSync } from "./sync";

/** The whole outbox mirror (loads it from the phone on first use). */
export function useOutbox(): OutboxSnapshot {
  const snapshot = useSyncExternalStore(subscribe, getSnapshot, getServerSnapshot);
  useEffect(() => {
    if (!getSnapshot().loaded) void loadOutbox();
  }, []);
  return snapshot;
}

export type ReportStateResult = {
  state: ReportViewState;
  item: OutboxItem | null;
  entry: ReceivedEntry | null;
  /** Per-attachment state for UploadItem rows. */
  media: Array<{ id: string; kind: OutboxItem["media"][number]["kind"]; name: string; size_bytes: number; state: MediaState; progress: number; error_code: string | null }>;
};

function viewState(item: OutboxItem | null, entry: ReceivedEntry | null, isDraft: boolean): ReportViewState {
  if (item) {
    switch (item.state) {
      case "queued":
        return "on_phone";
      case "sending":
        return "sending";
      case "unconfirmed":
        return "not_confirmed";
      case "needs_attention":
        return "needs_attention";
      case "waiting_code":
        return "waiting_code";
      case "received":
        if (item.server?.withdrawn) return "withdrawn";
        break;
    }
  }
  if (entry) {
    switch (entry.status) {
      case "in_review":
        return "in_review";
      case "question":
        return "question";
      case "closed":
        return "closed";
      case "withdrawn":
        return "withdrawn";
      default:
        return "received";
    }
  }
  if (item?.state === "received") return "received";
  return isDraft ? "draft" : "unknown";
}

/**
 * One honest state for a report, from one source (README R1). `ref` is the
 * client id (draft / Idempotency-Key) or the server id. "received" and later
 * appear only after REP-01 / REP-05 returned a receipt.
 */
export function useReportState(ref: string | null): ReportStateResult {
  const snapshot = useOutbox();
  return reportState(snapshot, ref);
}

export function reportState(snapshot: OutboxSnapshot, ref: string | null): ReportStateResult {
  if (!ref) return { state: "unknown", item: null, entry: null, media: [] };
  const item = snapshot.items.find((candidate) => candidate.id === ref || candidate.server?.id === ref) ?? null;
  const entry = snapshot.received.find((candidate) => candidate.id === ref || candidate.client_id === ref) ?? null;
  const isDraft = snapshot.draftIds.includes(ref);
  return {
    state: viewState(item, entry, isDraft),
    item,
    entry,
    media: (item?.media ?? []).map((media) => ({
      id: media.client_media_id,
      kind: media.kind,
      name: media.name,
      size_bytes: media.size_bytes,
      state: media.state,
      progress: media.size_bytes ? media.received_bytes / media.size_bytes : 0,
      error_code: media.error_code,
    })),
  };
}
