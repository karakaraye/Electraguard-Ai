/** Server and phone states → StatusBadge states and message keys (README R1, contract 2.1). */

import type { Outcome, ReportStatus as ServerStatus } from "../../../../lib/api/types";
import type { OutboxState } from "../../../../lib/outbox";
import type { ReportStatus } from "../../../../ui";

export const SERVER_BADGE: Record<ServerStatus, ReportStatus> = {
  received: "received",
  in_review: "in-review",
  question: "question",
  closed: "closed",
  withdrawn: "withdrawn",
};

export const OUTBOX_BADGE: Record<OutboxState, ReportStatus> = {
  queued: "on-phone",
  sending: "sending",
  unconfirmed: "not-confirmed",
  needs_attention: "needs-attention",
  waiting_code: "waiting-code",
  received: "received",
};

/** Plain explanation under the large badge on O-14. */
export const SERVER_HINT: Record<ServerStatus, string> = {
  received: "common.status.receivedHint",
  in_review: "o14.hint.inReview",
  question: "o14.hint.question",
  closed: "o14.closedNote",
  withdrawn: "o14.withdraw.done",
};

/** REP-03 / REP-06 outcome → common.outcome.* */
export const OUTCOME_KEY: Record<string, string> = {
  corroborated: "common.outcome.confirmed",
  insufficient_evidence: "common.outcome.notEnough",
  out_of_scope: "common.outcome.outside",
  Corroborated: "common.outcome.confirmed",
  "Insufficient Evidence": "common.outcome.notEnough",
  "Insufficient evidence": "common.outcome.notEnough",
  "Out of Scope": "common.outcome.outside",
  "Out of scope": "common.outcome.outside",
};

/** Minutes to wait from a Retry-After header (at least 1). */
export function minutesFrom(seconds: number | null, fallback = 60): number {
  return Math.max(1, Math.ceil((seconds ?? fallback) / 60));
}
