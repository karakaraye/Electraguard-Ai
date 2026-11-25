"use client";

import { useT } from "../../../../../lib/i18n/client";
import { DiscussionModView } from "../../../../(staff)/s/_views/DiscussionModView";
import { FIXTURE_FLAG } from "../fixtures";

/** Screen 45 (S-08) preview states. Each state is one screenshot. */
export const states = ["default", "loading", "empty", "error"] as const;

export function Preview({ state }: { state: string }) {
  const t = useT();
  void t;
  return (
          <DiscussionModView
            flags={state === "empty" ? [] : [FIXTURE_FLAG]}
            loading={state === "loading"}
            error={state === "error" ? "Failed to load flagged posts" : null}
          />
        );
}
