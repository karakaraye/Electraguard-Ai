"use client";

import { useT } from "../../../../../lib/i18n/client";
import { AdminCodesView } from "../../../../(staff)/s/_views/AdminCodesView";
import { FIXTURE_BATCHES } from "../fixtures";

/** Screen 46 (S-09) preview states. Each state is one screenshot. */
export const states = ["default", "loading", "empty", "error"] as const;

export function Preview({ state }: { state: string }) {
  const t = useT();
  void t;
  return (
          <AdminCodesView
            batches={state === "empty" ? [] : FIXTURE_BATCHES}
            codes={[]}
            activeCards={null}
            loading={state === "loading"}
            error={state === "error" ? "Failed to load code batches" : null}
          />
        );
}
