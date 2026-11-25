"use client";

import { useT } from "../../../../../lib/i18n/client";
import { AdminStaffView } from "../../../../(staff)/s/_views/AdminStaffView";
import { FIXTURE_STAFF_ACCOUNT } from "../fixtures";

/** Screen 47 (S-10) preview states. Each state is one screenshot. */
export const states = ["default", "loading", "empty", "error"] as const;

export function Preview({ state }: { state: string }) {
  const t = useT();
  void t;
  return (
          <AdminStaffView
            staffList={state === "empty" ? [] : [FIXTURE_STAFF_ACCOUNT]}
            loading={state === "loading"}
            error={state === "error" ? "Failed to load staff list" : null}
            inviteResult={null}
          />
        );
}
