"use client";

import { useT } from "../../../../../lib/i18n/client";
import { PublishView } from "../../../../(staff)/s/_views/PublishView";
import { FIXTURE_SNAPSHOT_RECORD } from "../fixtures";

/** Screen 44 (S-07) preview states. Each state is one screenshot. */
export const states = ["default", "loading", "empty", "error"] as const;

export function Preview({ state }: { state: string }) {
  const t = useT();
  void t;
  return (
          <PublishView
            snapshots={state === "empty" ? [] : [FIXTURE_SNAPSHOT_RECORD]}
            selectedSnapshot={state === "empty" ? null : FIXTURE_SNAPSHOT_RECORD}
            hourlySchedule={true}
            loading={state === "loading"}
            error={state === "error" ? "Snapshot preview generation failed" : null}
          />
        );
}
