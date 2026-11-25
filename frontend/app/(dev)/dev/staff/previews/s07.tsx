"use client";

import { useT } from "../../../../../lib/i18n/client";
import type { SnapshotRecord } from "../../../../../lib/api/types";
import { PublishView, type PublishNotice, type PublishSeed } from "../../../../(staff)/s/_views/PublishView";
import { DISCARDED, DRAFT, DRAFT_SMALL, HISTORY, HISTORY_LONG, PUBLISHED, SUPERSEDED } from "./s07.fixtures";

/** Screen 44 (S-07) preview states. Each state is one screenshot. */
export const states = [
  "default",
  "preview_ready",
  "cutoff_too_recent",
  "suppressed",
  "confirm_sheet",
  "confirm_stale",
  "discard_sheet",
  "published",
  "superseded",
  "discarded",
  "auto_release_on",
  "auto_release_unknown",
  "schedule_sheet",
  "history",
  "loading",
  "empty",
  "error",
  "forbidden",
  "not_ready",
] as const;

export function Preview({ state }: { state: string }) {
  const t = useT();

  let snapshots: SnapshotRecord[] = HISTORY;
  let selectedId: string | null = DRAFT.id;
  let hourly: boolean | null = false;
  let notice: PublishNotice | null = null;
  let seed: PublishSeed | null = null;
  let error: string | null = null;
  let hasMore = false;

  switch (state) {
    case "preview_ready":
      notice = { tone: "ok", text: t("s07.notice.generated") };
      break;
    case "cutoff_too_recent":
      seed = { cutoff: "2099-01-01T09:00" };
      break;
    case "suppressed":
      snapshots = [DRAFT_SMALL, ...HISTORY.slice(1)];
      selectedId = DRAFT_SMALL.id;
      break;
    case "confirm_sheet":
      seed = { dialog: "publish" };
      break;
    case "confirm_stale":
      seed = { dialog: "publish", sheetMessage: t("s07.errors.stale") };
      break;
    case "discard_sheet":
      seed = { dialog: "discard" };
      break;
    case "published":
      snapshots = [{ ...PUBLISHED, version: 2 }, ...HISTORY.slice(2)];
      selectedId = PUBLISHED.id;
      notice = { tone: "ok", text: t("s07.notice.published") };
      break;
    case "superseded":
      selectedId = SUPERSEDED.id;
      break;
    case "discarded":
      selectedId = DISCARDED.id;
      notice = { tone: "ok", text: t("s07.notice.discarded") };
      break;
    case "auto_release_on":
      hourly = true;
      notice = { tone: "ok", text: t("s07.notice.scheduleOn") };
      break;
    case "auto_release_unknown":
      hourly = null;
      break;
    case "schedule_sheet":
      seed = { dialog: "schedule" };
      break;
    case "history":
      snapshots = HISTORY_LONG;
      hasMore = true;
      break;
    case "loading":
      snapshots = [];
      selectedId = null;
      break;
    case "empty":
      snapshots = [];
      selectedId = null;
      break;
    case "error":
      snapshots = [];
      selectedId = null;
      error = t("staff.networkError");
      break;
    case "forbidden":
      snapshots = [];
      selectedId = null;
      error = t("staff.forbidden");
      break;
    case "not_ready":
      snapshots = [];
      selectedId = null;
      error = t("staff.endpointNotReady");
      break;
  }

  return (
    <PublishView
      snapshots={snapshots}
      selectedId={selectedId}
      hourly={hourly}
      loading={state === "loading"}
      error={error}
      notice={notice}
      hasMore={hasMore}
      seed={seed}
      onSelect={() => {}}
      onGenerate={async () => ({ ok: true })}
      onApprove={async () => ({ ok: true })}
      onDiscard={async () => ({ ok: true })}
      onSetHourly={async () => ({ ok: true })}
      onLoadMore={() => {}}
      onRetry={() => {}}
    />
  );
}
