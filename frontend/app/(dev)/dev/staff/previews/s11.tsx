"use client";

import { useT } from "../../../../../lib/i18n/client";
import { AdminSettingsView } from "../../../../(staff)/s/_views/AdminSettingsView";
import { FIXTURE_SETTINGS } from "../fixtures";

/** Screen 48 (S-11) preview states. Each state is one screenshot. */
export const states = ["default", "loading", "empty", "error"] as const;

export function Preview({ state }: { state: string }) {
  const t = useT();
  void t;
  return (
          <AdminSettingsView
            settings={state === "empty" ? null : FIXTURE_SETTINGS}
            loading={state === "loading"}
            error={state === "error" ? "Failed to load settings" : null}
          />
        );
}
