"use client";

import { useT } from "../../../../../lib/i18n/client";
import type { AlertStatus, SecurityAlert } from "../../../../../lib/api/types";
import { SecurityView } from "../../../../(staff)/s/_views/SecurityView";
import {
  ALERTS_ACKNOWLEDGED,
  ALERTS_MORE,
  ALERTS_OPEN,
  ALERTS_RESOLVED,
  VERIFY_BROKEN,
  VERIFY_INTACT,
} from "./s12.fixtures";

/** Screen 49 (S-12) preview states. Each state is one screenshot. */
export const states = [
  "default",
  "not_run",
  "verifying",
  "chain_broken",
  "acknowledged",
  "resolved",
  "more",
  "update_sheet",
  "update_stale",
  "export_range",
  "loading",
  "empty",
  "error",
  "forbidden",
  "not_ready",
] as const;

export function Preview({ state }: { state: string }) {
  const t = useT();

  const filter: AlertStatus = state === "acknowledged" ? "acknowledged" : state === "resolved" ? "resolved" : "open";
  const alerts: SecurityAlert[] =
    state === "empty" || state === "loading" || state === "error" || state === "forbidden" || state === "not_ready"
      ? []
      : state === "acknowledged"
        ? ALERTS_ACKNOWLEDGED
        : state === "resolved"
          ? ALERTS_RESOLVED
          : state === "more"
            ? ALERTS_MORE
            : ALERTS_OPEN;

  const error =
    state === "error" ? t("staff.networkError") : state === "forbidden" ? t("staff.forbidden") : state === "not_ready" ? t("staff.endpointNotReady") : null;

  return (
    <SecurityView
      alerts={alerts}
      verification={state === "not_run" || state === "loading" ? null : state === "chain_broken" ? VERIFY_BROKEN : VERIFY_INTACT}
      loading={state === "loading"}
      verifying={state === "verifying"}
      error={error}
      statusFilter={filter}
      onStatusFilterChange={() => {}}
      hasMore={state === "more"}
      onLoadMore={() => {}}
      onRetry={() => {}}
      onVerifyChain={() => {}}
      onUpdateAlert={async () => (state === "update_stale" ? { ok: false, message: t("s12.staleVersion") } : { ok: true })}
      onExportAudit={async () => ({ ok: true })}
      initialUpdateProblem={state === "update_stale" ? t("s12.staleVersion") : undefined}
      initialEditing={state === "update_sheet" || state === "update_stale" ? "al-open-1" : undefined}
      initialExport={
        state === "export_range"
          ? { from: "2026-08-01", to: "2026-12-05", notice: { tone: "danger", text: t("s12.exportRange") } }
          : { from: "2026-11-05", to: "2026-12-05" }
      }
    />
  );
}
