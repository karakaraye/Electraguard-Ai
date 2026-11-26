"use client";

/*
 * Development-only: fixture states for O-13 to O-20, C-01 and P-01 in the state
 * viewer (/dev/observer?screen=o14&state=question). Synthetic values only.
 */

import type { ReactElement } from "react";
import type { DiscussionSummary, Post } from "../../../../lib/api/types";
import type { useT } from "../../../../lib/i18n/client";
import { AskView, type AskViewProps } from "../../../(observer)/o/_views/AskView";
import { ChecklistListView, StageFormView, type StageFormViewProps } from "../../../(observer)/o/_views/ChecklistViews";
import { CitizenReceiptView, StatusView, type CitizenReceiptViewProps, type StatusViewProps } from "../../../(observer)/o/_views/CitizenViews";
import { DiscussionListView, ThreadView, type ThreadViewProps } from "../../../(observer)/o/_views/DiscussionViews";
import { MessagesView, MyReportsView, type ListRow, type MyReportsViewProps } from "../../../(observer)/o/_views/ListViews";
import { ReportDetailView, type ReportDetailViewProps } from "../../../(observer)/o/_views/ReportDetailView";
import { ResultSheetView, type ResultSheetViewProps } from "../../../(observer)/o/_views/ResultSheetView";
import { SettingsView, type SettingsViewProps } from "../../../(observer)/o/_views/SettingsView";
import { CheckinView } from "../../../(observer)/o/_views/CheckinView";
import { NOTICE_LOGISTICS, NOTICE_NOW, NOTICE_SAFETY } from "./notices.fixtures";
import { FIXTURE_CODE, FIXTURE_OCCURRED_AT, FIXTURE_PLACE, FIXTURE_RECEIPT, FIXTURE_RECEIVED_AT, FIXTURE_TEXT } from "./fixtures";

type Translate = ReturnType<typeof useT>;
const noop = () => undefined;

/* ---------- O-13 / O-17 ---------- */

const rows: ListRow[] = [
  { key: "q", href: "#", kind: "incident", category: "late_materials", place: "Gwammaja Open Space", at: FIXTURE_OCCURRED_AT, reference: "EG-9M2C-7TQA", status: "question", preview: "Which materials were missing when the unit opened? Were ballot papers there?", previewAt: "2026-12-05T09:02:00+01:00" },
  { key: "p", href: "#", kind: "incident", category: "queues_crowding", place: FIXTURE_PLACE, at: FIXTURE_OCCURRED_AT, status: "on-phone" },
  { key: "c", href: "#", kind: "checklist", category: null, stage: "opening", place: "Kantudu Primary School I", at: FIXTURE_OCCURRED_AT, reference: "EG-2K8D-4XRA", status: "received" },
  { key: "r", href: "#", kind: "incident", category: "intimidation_violence", place: "Kantudu Primary School I", at: FIXTURE_OCCURRED_AT, reference: FIXTURE_RECEIPT, status: "in-review", note: "1 new message", preview: "Thank you. Is everyone safe now? You can send a photo if it is safe to take one.", previewAt: "2026-12-05T08:57:00+01:00", unread: 1 },
  { key: "s", href: "#", kind: "result_sheet", category: null, place: "Kantudu Primary School I", at: FIXTURE_RECEIVED_AT, reference: "EG-7PQ3-H2MB", status: "received" },
];

const reportsBase: MyReportsViewProps = {
  offline: false,
  queuedCount: 1,
  filter: "all",
  onFilter: noop,
  counts: { all: 5, needsYou: 2, onPhone: 1 },
  rows,
  load: "ok",
  stale: false,
  updatedAt: Date.parse("2026-12-05T10:02:00+01:00"),
  hasMore: false,
  loadingMore: false,
  onMore: noop,
  onRetry: noop,
  onReport: noop,
  onBack: noop,
};

/* ---------- O-14 ---------- */

const detailBase: ReportDetailViewProps = {
  offline: false,
  load: "ok",
  source: "server",
  receiptCode: FIXTURE_RECEIPT,
  status: "received",
  statusHintKey: "common.status.receivedHint",
  kind: "incident",
  category: "intimidation_violence",
  place: FIXTURE_PLACE,
  observedAt: FIXTURE_OCCURRED_AT,
  receivedAt: FIXTURE_RECEIVED_AT,
  description: FIXTURE_TEXT,
  attachments: [],
  canAddMedia: true,
  adding: false,
  onAdd: noop,
  onRemoveAttachment: noop,
  attachmentBlocked: false,
  question: null,
  reply: "",
  onReply: noop,
  replyState: null,
  replyError: null,
  onSendReply: noop,
  onSendAsMessage: noop,
  conversation: "ok",
  messages: [],
  canMessage: true,
  writesRefused: false,
  draft: "",
  onDraft: noop,
  messageState: null,
  messageError: null,
  onSendMessage: noop,
  onAttach: noop,
  attaching: false,
  attachedName: null,
  canWithdraw: true,
  withdraw: null,
  onWithdraw: noop,
  onConfirmWithdraw: noop,
  onCancelWithdraw: noop,
  canSendNow: false,
  onSendNow: noop,
  deleteConfirm: false,
  onDelete: noop,
  onConfirmDelete: noop,
  onCancelDelete: noop,
  banner: null,
  onRetry: noop,
  onBack: noop,
};

const attachments = (t: Translate): ReportDetailViewProps["attachments"] => [
  { id: "m1", kind: "photo", name: t("o10.itemName", { kind: "photo", n: 1 }), sizeBytes: 812_000, state: "saved", removable: true, viewUrl: "#" },
  { id: "m2", kind: "audio", name: t("o10.itemName", { kind: "audio", n: 2 }), sizeBytes: 412_000, state: "saved", removable: true, reasonKey: "o14.media.processing" },
];

const conversation: ReportDetailViewProps["messages"] = [
  { id: "1", kind: "system", mine: false, authorLabel: "", body: "Review started", at: "2026-12-05T10:20:00+01:00" },
  { id: "2", kind: "formal_question", mine: false, authorLabel: "Reviewer", body: "How many young men were at the gate, and did anyone carry a weapon?", at: "2026-12-05T10:31:00+01:00", questionState: "answered" },
  { id: "3", kind: "reply", mine: true, authorLabel: "You", body: "About six. I did not see any weapon.", at: "2026-12-05T10:40:00+01:00" },
  { id: "4", kind: "message", mine: false, authorLabel: "Reviewer", body: "Thank you. Two other observers reported the same gate.", at: "2026-12-05T11:02:00+01:00" },
  { id: "5", kind: "message", mine: true, authorLabel: "You", body: "They left after the police came at 11.", at: "2026-12-05T11:05:00+01:00", queued: true },
];

/* ---------- O-15 / O-16 ---------- */

const stageBase: StageFormViewProps = {
  offline: false,
  stage: "opening",
  answers: {},
  onAnswer: noop,
  onMaterials: noop,
  unitLabel: FIXTURE_PLACE,
  needUnit: false,
  arrivalTime: "07:40",
  onArrivalTime: noop,
  timeError: null,
  errors: {},
  status: null,
  unanswered: null,
  onSend: noop,
  onSendAnyway: noop,
  onGoBack: noop,
  onReportThis: noop,
  onCheckSheet: noop,
  onBack: noop,
};

const sheetFields = (t: Translate) => [
  { id: "registered", label: t("o16.numbers.registered") },
  { id: "accredited", label: t("o16.numbers.accredited") },
  ...["A", "B", "C", "D", "E"].map((label) => ({ id: `votes.${label}`, label: t("o16.numbers.party", { label }) })),
  { id: "rejected", label: t("o16.numbers.rejected") },
];

const sheetBase = (t: Translate): ResultSheetViewProps => ({
  offline: false,
  view: "photo",
  photoUrl: null,
  notice: null,
  needUnit: false,
  unitLabel: FIXTURE_PLACE,
  onPhoto: noop,
  onSkip: noop,
  onContinue: noop,
  fields: sheetFields(t),
  values: {},
  onValue: noop,
  onTouch: noop,
  suggested: {},
  errors: {},
  confirmed: false,
  onConfirm: noop,
  confirmError: false,
  status: null,
  photoOpen: false,
  onOpenPhoto: noop,
  onClosePhoto: noop,
  onSend: noop,
  onBack: noop,
});

const SHEET_PHOTO =
  "data:image/svg+xml;utf8," +
  encodeURIComponent(
    '<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 300 200"><rect width="300" height="200" fill="#ededea"/><rect x="20" y="16" width="260" height="168" fill="#fff" stroke="#5f5f63"/>' +
      Array.from({ length: 8 }, (_, i) => `<rect x="36" y="${36 + i * 17}" width="${120 + (i % 3) * 20}" height="6" fill="#9d9d99"/><rect x="220" y="${36 + i * 17}" width="40" height="6" fill="#3a3a3d"/>`).join("") +
      "</svg>",
  );

/* ---------- O-18 ---------- */

const ward = { state_code: "KN", state_name: "Kano", lga_code: "KN-04", lga_name: "Dala", ward_code: "KN-04-07", ward_name: "Kantudu" };
const discussions: DiscussionSummary[] = [
  { id: "d1", title: "Late materials in Kantudu ward", area: ward, status: "open", membership: "invited", member_count: 4, unread_posts: 0, last_post_at: null, closes_at: "2026-12-06T18:00:00+01:00" },
  { id: "d2", title: "Accreditation devices failing in Dala", area: { ...ward, ward_code: null, ward_name: null }, status: "open", membership: "member", member_count: 9, unread_posts: 3, last_post_at: FIXTURE_RECEIVED_AT, closes_at: "2026-12-06T18:00:00+01:00" },
];
const posts: Post[] = [
  { id: "p1", author_label: "Moderator", is_me: false, body: "Share what you see with devices in your ward. No names and no exact places, please.", state: "visible", created_at: "2026-12-05T08:10:00+01:00" },
  { id: "p2", author_label: "OBS-3M9Q4T", is_me: false, body: "Devices in Kantudu are working again since 9.", state: "visible", created_at: "2026-12-05T09:12:00+01:00" },
  { id: "p3", author_label: "OBS-8RD2KC", is_me: false, body: null, state: "hidden", created_at: "2026-12-05T09:20:00+01:00" },
  { id: "p4", author_label: FIXTURE_CODE, is_me: true, body: "Gwammaja still waiting for a second device.", state: "visible", created_at: "2026-12-05T09:31:00+01:00" },
];
const threadBase: ThreadViewProps = {
  offline: false,
  load: "ok",
  title: "Accreditation devices failing in Dala",
  topic: "Devices",
  area: "Dala",
  closesAt: "2026-12-06T18:00:00+01:00",
  closed: false,
  invited: false,
  posts,
  hasMore: false,
  onMore: noop,
  draft: "",
  onDraft: noop,
  draftError: null,
  nameWarning: false,
  onKeep: noop,
  posting: false,
  onPost: noop,
  flagPost: null,
  onFlag: noop,
  onFlagReason: noop,
  onCloseFlag: noop,
  flagged: false,
  leave: null,
  onLeave: noop,
  onConfirmLeave: noop,
  onCancelLeave: noop,
  onRetry: noop,
  onBack: noop,
};

/* ---------- O-19 / O-20 ---------- */

const askBase: AskViewProps = {
  offline: false,
  question: "",
  onQuestion: noop,
  dictationLang: "en-NG",
  onDictated: noop,
  state: null,
  answer: null,
  retryMinutes: 1,
  guides: [],
  onAsk: noop,
  onBack: noop,
};

const settingsBase: SettingsViewProps = {
  offline: false,
  code: FIXTURE_CODE,
  version: "1.0.0",
  unsentCount: 0,
  mediaLabel: "0 KB",
  signedOutNotice: false,
  languageOpen: false,
  onLanguage: noop,
  pinOpen: false,
  onPinOpen: noop,
  pin: { current: "", next: "", confirm: "" },
  onPin: noop,
  pinError: null,
  pinState: null,
  onSavePin: noop,
  onSendNow: noop,
  sheet: null,
  busy: null,
  onSignOut: noop,
  onConfirmSignOut: noop,
  onClear: noop,
  onConfirmClear: noop,
  onCloseSheet: noop,
  onBack: noop,
};

/* ---------- C-01 / P-01 ---------- */

const citizenBase: CitizenReceiptViewProps = {
  offline: false,
  code: FIXTURE_RECEIPT,
  receivedAt: FIXTURE_RECEIVED_AT,
  justSent: true,
  keep: true,
  onKeep: noop,
  shortCode: "20384",
  shortCodeIsTest: true,
  items: [],
  onRetry: noop,
  onCheckStatus: noop,
  onAnother: noop,
  onBack: noop,
};

const statusBase: StatusViewProps = {
  offline: false,
  code: "",
  onCode: noop,
  onCheck: noop,
  checking: false,
  error: null,
  retryMinutes: 1,
  saved: [],
  onCheckSaved: noop,
  onRemoveSaved: noop,
  result: null,
  hasSecret: false,
  question: null,
  reply: "",
  onReply: noop,
  replyState: null,
  replyError: null,
  onSendReply: noop,
  withdraw: null,
  onWithdraw: noop,
  onConfirmWithdraw: noop,
  onCancelWithdraw: noop,
  banner: null,
  shortCode: "20384",
  onBack: noop,
};

const found = { receipt_code: FIXTURE_RECEIPT, status: "received" as const, outcome: null, has_open_question: false, received_on: "2026-12-05", updated_on: "2026-12-05" };

export const MORE_SCREENS: Record<string, Record<string, (t: Translate) => ReactElement>> = {
  o13: {
    filled: () => <MyReportsView {...reportsBase} />,
    "needs-you": () => <MyReportsView {...reportsBase} filter="needsYou" rows={rows.filter((r) => r.status === "question" || r.note)} />,
    offline: () => <MyReportsView {...reportsBase} offline load="offline" rows={rows.slice(1, 3)} updatedAt={null} />,
    error: () => <MyReportsView {...reportsBase} load="error" rows={rows.slice(1, 2)} counts={{ all: 1, needsYou: 0, onPhone: 1 }} />,
    loading: () => <MyReportsView {...reportsBase} load="loading" rows={[]} updatedAt={null} />,
    empty: () => <MyReportsView {...reportsBase} rows={[]} counts={{ all: 0, needsYou: 0, onPhone: 0 }} />,
  },
  o14: {
    received: (t) => <ReportDetailView {...detailBase} attachments={attachments(t)} />,
    question: () => (
      <ReportDetailView
        {...detailBase}
        status="question"
        statusHintKey="o14.hint.question"
        canWithdraw={false}
        question={{ id: "q", body: "Did the presiding officer see the young men at the gate? Please say what time you left.", askedAt: "2026-12-05T10:31:00+01:00" }}
        messages={conversation.slice(0, 1)}
      />
    ),
    "in-review": (t) => <ReportDetailView {...detailBase} status="in-review" statusHintKey="o14.hint.inReview" canWithdraw={false} attachments={attachments(t).map((a) => ({ ...a, removable: false }))} messages={conversation} />,
    closed: () => <ReportDetailView {...detailBase} status="closed" statusHintKey="o14.closedNote" outcomeKey="common.outcome.confirmed" canWithdraw={false} canMessage={false} canAddMedia={false} messages={conversation.slice(0, 4)} />,
    "withdraw-sheet": () => <ReportDetailView {...detailBase} withdraw="confirm" />,
    "too-late": () => <ReportDetailView {...detailBase} status="in-review" statusHintKey="o14.hint.inReview" canWithdraw={false} banner={{ tone: "attn", key: "o14.withdraw.tooLate" }} />,
    withdrawn: () => <ReportDetailView {...detailBase} source="withdrawn" status="withdrawn" withdrawnAt="2026-12-05T09:40:00+01:00" />,
    "on-phone": () => <ReportDetailView {...detailBase} source="local" receiptCode={null} status="on-phone" statusHintKey="common.status.onPhoneHint" receivedAt={null} canSendNow canWithdraw={false} offline />,
    offline: () => <ReportDetailView {...detailBase} offline description={null} conversation="offline" canAddMedia={false} />,
    loading: () => <ReportDetailView {...detailBase} load="loading" receiptCode={null} />,
    "not-found": () => <ReportDetailView {...detailBase} load="not_found" receiptCode={null} />,
  },
  o15: {
    list: () => (
      <ChecklistListView
        offline={false}
        onBack={noop}
        now={new Date("2026-12-05T10:20:00+01:00")}
        unitLabel="Kantudu Primary School I, Kantudu, Dala"
        stages={[
          { slug: "arrival", state: "received", receivedAt: "2026-12-05T07:42:00+01:00", href: "#" },
          { slug: "opening", state: "onPhone", href: "#" },
          { slug: "accreditation", state: "draft", href: "#" },
          { slug: "voting", state: "notStarted", href: "#" },
          { slug: "closing", state: "notStarted", href: "#" },
          { slug: "results", state: "notStarted", href: "#" },
        ]}
      />
    ),
    "list-not-started": () => (
      <ChecklistListView
        offline={false}
        onBack={noop}
        now={new Date("2026-12-05T06:50:00+01:00")}
        stages={(["arrival", "opening", "accreditation", "voting", "closing", "results"] as const).map((slug) => ({ slug, state: "notStarted" as const, href: "#" }))}
      />
    ),
    "list-all-done": () => (
      <ChecklistListView
        offline={false}
        onBack={noop}
        now={new Date("2026-12-05T16:40:00+01:00")}
        unitLabel="Kantudu Primary School I, Kantudu, Dala"
        stages={(["arrival", "opening", "accreditation", "voting", "closing", "results"] as const).map((slug, i) => ({ slug, state: "received" as const, receivedAt: `2026-12-05T${String(7 + i * 2).padStart(2, "0")}:42:00+01:00`, href: "#" }))}
      />
    ),
    opening: () => <StageFormView {...stageBase} answers={{ opened_on_time: "yes", materials_all_present: "no", materials_missing: ["result_sheets", "indelible_ink"] }} />,
    voting: () => <StageFormView {...stageBase} stage="voting" answers={{ secrecy_kept: "yes", disruption: "yes", inducement_seen: "not_seen" }} />,
    "need-unit": () => <StageFormView {...stageBase} stage="accreditation" unitLabel={null} needUnit />,
    unanswered: () => <StageFormView {...stageBase} stage="closing" answers={{ closed_on_time: "yes" }} unanswered={2} />,
    "saved-offline": () => <StageFormView {...stageBase} stage="results" offline answers={{ sheet_posted: "yes" }} status="savedOffline" />,
  },
  o16: {
    photo: (t) => <ResultSheetView {...sheetBase(t)} />,
    reading: (t) => <ResultSheetView {...sheetBase(t)} photoUrl={SHEET_PHOTO} notice="reading" />,
    suggested: (t) => (
      <ResultSheetView
        {...sheetBase(t)}
        view="numbers"
        photoUrl={SHEET_PHOTO}
        values={{ registered: "812", accredited: "403", "votes.A": "151", "votes.B": "138", "votes.C": "61", "votes.D": "24", "votes.E": "9", rejected: "11" }}
        suggested={{ registered: 0.94, accredited: 0.91, "votes.A": 0.88, "votes.B": 0.62, "votes.C": 0.9, "votes.D": 0.93, rejected: 0.71 }}
      />
    ),
    errors: (t) => <ResultSheetView {...sheetBase(t)} view="numbers" notice="offline" values={{ registered: "812", accredited: "4o3" }} errors={{ accredited: t("o16.numbers.notNumber"), "votes.A": t("o16.numbers.required") }} confirmError />,
  },
  o17: {
    filled: () => <MessagesView offline={false} rows={[rows[0], rows[3]]} load="ok" stale={false} onRetry={noop} onBack={noop} />,
    preview: () => (
      <MessagesView
        offline={false}
        rows={[rows[0], { ...rows[3], preview: "Thank you. Two other observers reported the same gate.", previewAt: "2026-12-05T11:02:00+01:00", unread: 1 }]}
        load="ok"
        stale={false}
        onRetry={noop}
        onBack={noop}
      />
    ),
    notices: () => (
      <MessagesView
        offline={false}
        rows={[{ ...rows[3], preview: "Which materials were missing when the unit opened?", previewAt: "2026-12-05T09:02:00+01:00" }]}
        load="ok"
        stale={false}
        onRetry={noop}
        onBack={noop}
        notices={[NOTICE_SAFETY, NOTICE_LOGISTICS]}
        now={NOTICE_NOW}
      />
    ),
    "notices-only": () => <MessagesView offline={false} rows={[]} load="ok" stale={false} onRetry={noop} onBack={noop} notices={[NOTICE_LOGISTICS]} now={NOTICE_NOW} />,
    loading: () => <MessagesView offline={false} rows={[]} load="loading" stale={false} onRetry={noop} onBack={noop} />,
    empty: () => <MessagesView offline={false} rows={[]} load="ok" stale={false} onRetry={noop} onBack={noop} />,
    offline: () => <MessagesView offline rows={[]} load="offline" stale={false} onRetry={noop} onBack={noop} />,
    unavailable: () => <MessagesView offline={false} rows={[]} load="unavailable" stale={false} onRetry={noop} onBack={noop} />,
  },
  o21: {
    answering: () => <CheckinView notice={NOTICE_LOGISTICS} loading={false} offline={false} unit={FIXTURE_PLACE} waiting={0} now={NOTICE_NOW} onSave={noop} onBack={noop} />,
    offline: () => <CheckinView notice={NOTICE_LOGISTICS} loading={false} offline unit={FIXTURE_PLACE} waiting={0} now={NOTICE_NOW} onSave={noop} onBack={noop} />,
    "saved-offline": () => (
      <CheckinView
        notice={{ ...NOTICE_LOGISTICS, answer: { choice: "not_seen", at: "2026-12-05T09:46:00+01:00", state: "on_phone" } }}
        loading={false}
        offline
        unit={FIXTURE_PLACE}
        waiting={1}
        now={NOTICE_NOW}
        onSave={noop}
        onBack={noop}
      />
    ),
    sent: () => (
      <CheckinView
        notice={{ ...NOTICE_LOGISTICS, answer: { choice: "yes", at: "2026-12-05T09:46:00+01:00", state: "sent" } }}
        loading={false}
        offline={false}
        unit={FIXTURE_PLACE}
        waiting={0}
        now={NOTICE_NOW}
        onSave={noop}
        onBack={noop}
      />
    ),
    "not-counted": () => (
      <CheckinView
        notice={{ ...NOTICE_LOGISTICS, answer: { choice: "no", at: "2026-12-05T10:20:00+01:00", state: "expired" } }}
        loading={false}
        offline={false}
        unit={FIXTURE_PLACE}
        waiting={0}
        now={NOTICE_NOW}
        onSave={noop}
        onBack={noop}
      />
    ),
    safety: () => <CheckinView notice={NOTICE_SAFETY} loading={false} offline={false} unit={null} waiting={0} now={NOTICE_NOW} onSave={noop} onBack={noop} />,
    closed: () => <CheckinView notice={NOTICE_LOGISTICS} loading={false} offline={false} unit={FIXTURE_PLACE} waiting={0} now={Date.parse("2026-12-05T11:00:00+01:00")} onSave={noop} onBack={noop} />,
    gone: () => <CheckinView notice={null} loading={false} offline={false} unit={null} waiting={0} onSave={noop} onBack={noop} />,
  },
  o18: {
    list: () => <DiscussionListView offline={false} load="ok" items={discussions} busy={null} notice={null} onAnswer={noop} onRetry={noop} onBack={noop} />,
    empty: () => <DiscussionListView offline={false} load="ok" items={[]} busy={null} notice={null} onAnswer={noop} onRetry={noop} onBack={noop} />,
    thread: () => <ThreadView {...threadBase} />,
    "name-warning": () => <ThreadView {...threadBase} draft="Call Musa on 0803 555 0101 about the device." nameWarning />,
    closed: () => <ThreadView {...threadBase} closed />,
    flag: () => <ThreadView {...threadBase} flagPost={posts[1]} />,
  },
  o19: {
    first: () => <AskView {...askBase} />,
    answer: () => (
      <AskView
        {...askBase}
        question="What should I do if the polling unit opens late?"
        state="answer"
        answer={{
          status: "answered",
          language: "en",
          fallback_language_used: false,
          passages: [
            {
              text: "If the polling unit has not opened 30 minutes after the official time, record the time it opens, note which materials or officials were missing, and send a report under Late or missing materials. Do not leave the unit to look for officials.",
              score: 0.82,
              source: { document_id: "observer-guide", title: "Observer field guide", section: "4.2 Late opening", version: "2026.3", language: "en", url: "/guide/opening-late#if-late" },
            },
          ],
        }}
      />
    ),
    "no-answer": () => <AskView {...askBase} question="Who will win?" state="answer" answer={{ status: "abstained", language: "en", fallback_language_used: false, passages: [] }} />,
    offline: () => <AskView {...askBase} offline />,
    asking: () => <AskView {...askBase} question="What should I do if the polling unit opens late?" state="asking" />,
  },
  o20: {
    first: () => <SettingsView {...settingsBase} unsentCount={2} mediaLabel="3.4 MB" />,
    pin: () => <SettingsView {...settingsBase} pinOpen pin={{ current: "482913", next: "123456", confirm: "123456" }} pinError={{ field: "next", message: "That PIN is too easy to guess. Try different numbers." }} />,
    "clear-sheet": () => <SettingsView {...settingsBase} unsentCount={1} sheet="clear" />,
  },
  c01: {
    success: () => <CitizenReceiptView {...citizenBase} />,
    uploading: (t) => (
      <CitizenReceiptView
        {...citizenBase}
        justSent={false}
        items={[
          { id: "a", kind: "photo", name: t("o10.itemName", { kind: "photo", n: 1 }), sizeBytes: 812_000, state: "saved", progress: 1, removable: false },
          { id: "b", kind: "audio", name: t("o10.itemName", { kind: "audio", n: 2 }), sizeBytes: 412_000, state: "uploading", progress: 0.4, removable: false },
        ]}
      />
    ),
    "keep-off": () => <CitizenReceiptView {...citizenBase} justSent={false} keep={false} />,
  },
  p01: {
    first: () => <StatusView {...statusBase} saved={[FIXTURE_RECEIPT]} />,
    found: () => <StatusView {...statusBase} code={FIXTURE_RECEIPT} result={found} hasSecret saved={[FIXTURE_RECEIPT]} />,
    question: () => (
      <StatusView {...statusBase} code={FIXTURE_RECEIPT} result={{ ...found, status: "question", has_open_question: true }} hasSecret question={{ id: "q", body: "Which polling unit was this? Please give the ward name." }} />
    ),
    "no-secret": () => <StatusView {...statusBase} code={FIXTURE_RECEIPT} result={{ ...found, status: "question", has_open_question: true }} />,
    closed: () => <StatusView {...statusBase} code={FIXTURE_RECEIPT} result={{ ...found, status: "closed", outcome: "corroborated", updated_on: "2026-12-06" }} />,
    "not-found": () => <StatusView {...statusBase} code="EG-4H7Q-92KE" error="not_found" />,
    format: () => <StatusView {...statusBase} code="EG-4H7Q" error="format" />,
  },
};


