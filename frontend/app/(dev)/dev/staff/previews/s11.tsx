"use client";

import { useT } from "../../../../../lib/i18n/client";
import { AdminSettingsView, type SettingsSeed } from "../../../../(staff)/s/_views/AdminSettingsView";
import { FIXTURE_SETTINGS } from "../fixtures";

/** Screen 48 (S-11) preview states. Each state is one screenshot. */
export const states = [
  "default",
  "pause_sheet",
  "paused",
  "resume_sheet",
  "retention_confirm",
  "retention_no_count",
  "parties_locked",
  "saved",
  "stale",
  "loading",
  "empty",
  "error",
] as const;

const SEEDS: Record<string, SettingsSeed> = {
  pause_sheet: { dialog: "pause" },
  resume_sheet: { dialog: "resume" },
  // The server's 409 names the number of records a shorter retention deletes.
  retention_confirm: { dialog: "retention", retentionDays: "90", records: 1284 },
  // When the server gives no number, the sheet says so rather than guessing.
  retention_no_count: { dialog: "retention", retentionDays: "90", records: null },
  parties_locked: { partiesLocked: true },
  saved: { saved: "schedule" },
};

export function Preview({ state }: { state: string }) {
  const t = useT();
  const paused = state === "paused" || state === "resume_sheet";
  return (
    <AdminSettingsView
      settings={state === "empty" ? null : { ...FIXTURE_SETTINGS, intake_paused: paused }}
      loading={state === "loading"}
      error={state === "error" ? t("staff.networkError") : null}
      notice={state === "stale" ? t("s11.errors.stale") : null}
      seed={SEEDS[state] ?? null}
    />
  );
}
