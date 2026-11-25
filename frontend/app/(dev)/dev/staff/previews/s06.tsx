"use client";

import { useT } from "../../../../../lib/i18n/client";
import { RumourView } from "../../../../(staff)/s/_views/RumourView";
import { S06_CLAIMS, S06_MATCHES, S06_NO_MATCHES, S06_USER } from "./s06.fixtures";

/** Screen 43 (S-06) preview states. Each state is one screenshot. */
export const states = [
  "default",
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

export function Preview({ state }: { state: string }) {
  const t = useT();
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
  return (
    <RumourView
      claims={state === "empty" ? [] : state === "filtered" ? S06_CLAIMS.filter((claim) => claim.status === "new") : S06_CLAIMS}
      selectedClaim={selected}
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
