import type { Category, Outcome, ReportStatus } from "../../../lib/api/types";

/** The USSD service code the gateway answers (USSD-01, SIM-01). Fixed by the backend. */
export const USSD_SERVICE_CODE = "*347*88#";

/** Category wire value → message key (shared with O-05 tiles) and its SMS/USSD number. */
export const CATEGORY_ROWS: Array<{ value: Category; key: string; number: string }> = [
  { value: "late_materials", key: "o05.tile.materials", number: "1" },
  { value: "equipment_failure", key: "o05.tile.equipment", number: "2" },
  { value: "queues_crowding", key: "o05.tile.queues", number: "3" },
  { value: "intimidation_violence", key: "o05.tile.intimidation", number: "4" },
  { value: "access_barrier", key: "o05.tile.access", number: "5" },
  { value: "lack_of_information", key: "o05.tile.information", number: "6" },
  { value: "misinformation", key: "o05.tile.misinformation", number: "7" },
  { value: "vote_buying", key: "o05.tile.inducement", number: "8" },
  { value: "good_practice", key: "o05.tile.goodPractice", number: "9" },
  { value: "not_sure", key: "o05.tile.notSure", number: "0" },
];

export const OUTCOME_KEYS: Record<Outcome, string> = {
  corroborated: "common.outcome.confirmed",
  insufficient_evidence: "common.outcome.notEnough",
  out_of_scope: "common.outcome.outside",
};

export const STATUS_EXPLAIN_KEYS: Record<ReportStatus, string> = {
  received: "p01.explain.received",
  in_review: "p01.explain.inReview",
  question: "p01.explain.question",
  closed: "p01.explain.closed",
  withdrawn: "p01.explain.withdrawn",
};

const ALPHABET = "0123456789ABCDEFGHJKMNPQRSTVWXYZ";

/**
 * Receipt code normalisation (contract 1.1): upper-case, drop spaces and hyphens,
 * O→0, I→1, L→1, then "EG-XXXX-XXXX". Returns null when the shape or the check symbol
 * is wrong, so a typo is caught before any request.
 */
export function normaliseReceiptCode(input: string): string | null {
  let text = input.trim().toUpperCase().replace(/[\s\-_.]/g, "");
  if (text.startsWith("EG")) text = text.slice(2);
  text = text.replace(/O/g, "0").replace(/[IL]/g, "1");
  if (!/^[0-9A-HJKMNP-TV-Z]{8}$/.test(text)) return null;
  let sum = 0;
  for (let i = 0; i < 7; i++) sum += (i + 1) * ALPHABET.indexOf(text[i]);
  if (ALPHABET[sum % 31] !== text[7]) return null;
  return `EG-${text.slice(0, 4)}-${text.slice(4)}`;
}

/** Date-only strings ("2026-12-05") formatted as a West Africa Time calendar date. */
export function formatWatDate(value: string, tag: string): string {
  const date = /^\d{4}-\d{2}-\d{2}$/.test(value) ? new Date(`${value}T12:00:00+01:00`) : new Date(value);
  const supported = Intl.DateTimeFormat.supportedLocalesOf([tag]).length ? tag : "en-NG";
  return new Intl.DateTimeFormat(supported, { dateStyle: "long", timeZone: "Africa/Lagos" }).format(date);
}
