"use client";

import { useT } from "../../../../../lib/i18n/client";
import { RumourView } from "../../../../(staff)/s/_views/RumourView";
import { FIXTURE_CLAIM } from "../fixtures";

/** Screen 43 (S-06) preview states. Each state is one screenshot. */
export const states = ["default", "loading", "empty", "error"] as const;

export function Preview({ state }: { state: string }) {
  const t = useT();
  void t;
  return (
          <RumourView
            claims={state === "empty" ? [] : [FIXTURE_CLAIM]}
            selectedClaim={state === "empty" ? null : FIXTURE_CLAIM}
            matches={null}
            loading={state === "loading"}
            error={state === "error" ? "Failed to load rumours" : null}
            currentUserName="F. Musa"
          />
        );
}
