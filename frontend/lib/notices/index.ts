/**
 * Ward check-ins: the limits and the content check the coordinator sees before sending.
 * The server (`backend/notices/filtering.py`) is the authority and returns every reason it found;
 * this file marks the words it can recognise on the page (codes, phone numbers, emails, links) so the
 * coordinator sees where the problem is. Names and party terms are only known to the server, so those
 * reasons are listed without marks.
 */

import type { Language, NoticeQuestion, NoticeType } from "../api/types";

export const NOTICE_MAX = 280;
export const NOTICE_TYPES: NoticeType[] = ["logistics", "instruction", "safety"];
/** Minutes. The server accepts 15 to 1,440. */
export const NOTICE_EXPIRY: Array<{ minutes: number; key: string }> = [
  { minutes: 30, key: "notice.expiry.30" },
  { minutes: 60, key: "notice.expiry.60" },
  { minutes: 120, key: "notice.expiry.120" },
  { minutes: 360, key: "notice.expiry.360" },
  { minutes: 720, key: "notice.expiry.720" },
  { minutes: 1440, key: "notice.expiry.1440" },
];
export const DEFAULT_EXPIRY = 120;

export type BlockReason =
  | "contains_polling_unit_code"
  | "contains_phone_number"
  | "contains_email"
  | "contains_link"
  | "contains_personal_name"
  | "contains_political_term";

export const REASON_KEY: Record<BlockReason, string> = {
  contains_polling_unit_code: "notice.reason.pollingUnit",
  contains_phone_number: "notice.reason.phone",
  contains_email: "notice.reason.email",
  contains_link: "notice.reason.link",
  contains_personal_name: "notice.reason.name",
  contains_political_term: "notice.reason.political",
};

const PATTERNS: Array<[BlockReason, RegExp]> = [
  ["contains_polling_unit_code", /\b(?:SYN-)?[A-Z]{2,3}-[0-9]{2}-[0-9]{2}-[0-9]{3}\b/gi],
  [
    "contains_phone_number",
    /(?:\+234\s?[789][01]\d[-\s]?\d{3}[-\s]?\d{4}|\b0[789][01]\d[-\s]?\d{3}[-\s]?\d{4}\b|\b0[789][01]\d{8}\b)/g,
  ],
  ["contains_email", /\b[A-Za-z0-9._%+-]+@[A-Za-z0-9.-]+\.[A-Za-z]{2,}\b/g],
  ["contains_link", /(?:https?:\/\/\S+|www\.\S+|\b[a-zA-Z0-9-]+\.(?:com|org|gov|ng|net|io|edu|co)(?:\/\S*)?\b)/gi],
];

export type Mark = { start: number; end: number; reason: BlockReason };

/** Reasons and marked spans the page can find without the server. */
export function localCheck(text: string): { reasons: BlockReason[]; marks: Mark[] } {
  const marks: Mark[] = [];
  for (const [reason, pattern] of PATTERNS) {
    for (const match of text.matchAll(pattern)) {
      if (match.index === undefined || !match[0]) continue;
      marks.push({ start: match.index, end: match.index + match[0].length, reason });
    }
  }
  marks.sort((a, b) => a.start - b.start || b.end - a.end);
  // Overlapping marks (a phone number inside a longer match) keep the first one, so the text is cut once.
  const kept: Mark[] = [];
  for (const mark of marks) if (!kept.length || mark.start >= kept[kept.length - 1].end) kept.push(mark);
  const reasons = [...new Set(marks.map((m) => m.reason))];
  return { reasons, marks: kept };
}

/** The text cut into plain and marked pieces. */
export function segments(text: string, marks: Mark[]): Array<{ text: string; marked: boolean }> {
  const out: Array<{ text: string; marked: boolean }> = [];
  let at = 0;
  for (const mark of marks) {
    if (mark.start > at) out.push({ text: text.slice(at, mark.start), marked: false });
    out.push({ text: text.slice(mark.start, mark.end), marked: true });
    at = mark.end;
  }
  if (at < text.length) out.push({ text: text.slice(at), marked: false });
  return out;
}

const KNOWN: ReadonlySet<string> = new Set(Object.keys(REASON_KEY));
export function knownReasons(values: string[]): BlockReason[] {
  return values.filter((value): value is BlockReason => KNOWN.has(value));
}

/** A question's wording in the reader's language, English when it has no translation. */
export function questionText(question: Pick<NoticeQuestion, "id" | "text_by_lang"> | null, language: Language): string {
  if (!question) return "";
  return question.text_by_lang[language] ?? question.text_by_lang.en ?? question.id;
}

/** Notices and questions are the only English-only server text a screen may show; this keeps the choice in one place. */
export function noticeTitle(notice: { text: string; question: NoticeQuestion | null }, language: Language): string {
  return notice.question ? questionText(notice.question, language) : notice.text;
}
