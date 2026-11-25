"use client";

import { useT } from "../../../../../lib/i18n/client";
import { SecurityView } from "../../../../(staff)/s/_views/SecurityView";
import { FIXTURE_ALERT } from "../fixtures";

/** Screen 49 (S-12) preview states. Each state is one screenshot. */
export const states = ["default", "loading", "empty", "error"] as const;

export function Preview({ state }: { state: string }) {
  const t = useT();
  void t;
  return (
          <SecurityView
            alerts={state === "empty" ? [] : [FIXTURE_ALERT]}
            verification={{
              intact: true,
              events_checked: 18422,
              head: {
                hash: "b5d12a884f3e9c1b72a0d9e8c6f1a4e2b0c9d7e5f3a1b4c6d8e0f2a4b6c8d0e2",
                event_count: 18422,
                at: "2026-12-05T11:00:00+01:00",
              },
              first_broken_event_id: null,
              checked_at: "2026-12-05T11:02:00+01:00",
            }}
            loading={state === "loading"}
            verifying={false}
            error={state === "error" ? "Security verification failed" : null}
            statusFilter="all"
          />
        );
}
