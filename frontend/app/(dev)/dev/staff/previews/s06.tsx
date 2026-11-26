"use client";

import type { Claim } from "../../../../../lib/api/types";
import { useT } from "../../../../../lib/i18n/client";
import { RumourView } from "../../../../(staff)/s/_views/RumourView";
import { S06_CLAIMS, S06_MATCHES, S06_NO_MATCHES, S06_USER } from "./s06.fixtures";

/** Screen 43 (S-06) preview states. Each state is one screenshot. */
export const states = [
  "default",
  "public",
  "public-no-evidence",
  "same_person",
  "new_claim",
  "approved",
  "no_matches",
  "matches_loading",
  "action_error",
  "notice",
  "filtered",
  "loading",
  "empty",
  "error",
] as const;

const byId = (id: string) => S06_CLAIMS.find((claim) => claim.id === id) ?? S06_CLAIMS[0];

const ASKS: Record<string, { ask_count: number; ask_trend_1h: number }> = {
  c1: { ask_count: 46, ask_trend_1h: 12 },
  c2: { ask_count: 19, ask_trend_1h: 7 },
  c3: { ask_count: 11, ask_trend_1h: 0 },
  c4: { ask_count: 8, ask_trend_1h: 0 },
  c5: { ask_count: 6, ask_trend_1h: 2 },
};

export function Preview({ state }: { state: string }) {
  const t = useT();
  const isPublic = state.startsWith("public");
  const selected =
    state === "empty" || state === "loading" || state === "error"
      ? null
      : state === "new_claim"
        ? byId("c2")
        : state === "approved"
          ? byId("c5")
          : state === "filtered"
            ? byId("c2")
            : byId("c1");
  const withAsks = (claim: Claim): Claim =>
    isPublic ? { ...claim, source: "public", ...(ASKS[claim.id] ?? { ask_count: 0, ask_trend_1h: 0 }) } : claim;
  const list = (state === "empty" ? [] : state === "filtered" ? S06_CLAIMS.filter((claim) => claim.status === "new") : S06_CLAIMS).map(withAsks);
  const open = selected ? withAsks(selected) : null;
  const shown = isPublic ? [...list].sort((a, b) => (b.ask_count ?? 0) - (a.ask_count ?? 0)) : list;
  return (
    <RumourView
      claims={shown}
      sourceFilter={isPublic ? "public" : "all"}
      sort={isPublic ? "demand" : "recent"}
      onSourceFilter={() => {}}
      onSort={() => {}}
      selectedClaim={
        open && state === "public"
          ? {
              ...open,
              checkin_evidence: [
                { question: "Have results been posted publicly at your unit?", area: "KN-04", yes: 23, no: "fewer than 5", not_seen: 6, window: "6h" },
              ],
            }
          : open && state === "public-no-evidence"
            ? { ...open, checkin_evidence: [] }
            : open
      }
      matches={state === "no_matches" ? S06_NO_MATCHES : state === "matches_loading" ? null : S06_MATCHES}
      matchesLoading={state === "matches_loading"}
      loading={state === "loading"}
      error={state === "error" ? t("staff.networkError") : null}
      actionError={state === "action_error" ? t("s06.errors.samePerson") : null}
      notice={state === "notice" ? t("s06.notice.saved") : null}
      // The drafter of claim c1 is viewing it, so another coordinator must approve.
      currentUserName={state === "same_person" ? "Chinedu Okafor" : S06_USER}
      statusFilter={state === "filtered" ? "new" : "all"}
    />
  );
}
