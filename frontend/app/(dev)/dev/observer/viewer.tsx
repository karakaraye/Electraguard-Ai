"use client";

/*
 * Development-only state viewer: /dev/observer?screen=o05&state=error[&lang=ha][&theme=dark].
 * Renders the real screen views with fixture props, one state per page, so each
 * state can be screenshotted without a backend.
 */

import Link from "next/link";
import { useSearchParams } from "next/navigation";
import { useEffect, type ReactElement } from "react";
import { setLocale, useLocale, useT } from "../../../../lib/i18n/client";
import { isLocale } from "../../../../lib/i18n/config";
import { setThemePreference } from "../../../../ui";
import { HomeView, type HomeViewProps } from "../../../(observer)/o/_views/HomeView";
import {
  CategoryView,
  CheckView,
  DangerView,
  DescribeView,
  EmergencyView,
  EvidenceView,
  WhenView,
  WhereView,
  type CheckViewProps,
  type DescribeViewProps,
  type EvidenceViewProps,
  type WhereViewProps,
} from "../../../(observer)/o/_views/IncidentViews";
import { PendingView, ReceiptView, type ReceiptViewProps } from "../../../(observer)/o/_views/ReceiptView";
import { ChooseView, LanguageView, NoticeView, RevokedView, SetPinView, SignInView, type SignInViewProps } from "../../../(observer)/o/_views/StartViews";
import {
  FIXTURE_AREAS,
  FIXTURE_CODE,
  FIXTURE_LONG_TEXT,
  FIXTURE_NAME_TEXT,
  FIXTURE_OCCURRED_AT,
  FIXTURE_PLACE,
  FIXTURE_PREVIEW,
  FIXTURE_RECEIPT,
  FIXTURE_RECEIVED_AT,
  FIXTURE_STATES,
  FIXTURE_TEXT,
} from "./fixtures";

const noop = () => undefined;

type Translate = ReturnType<typeof useT>;

/* Attachment names come from the message files (o10.itemName), in the language on screen. */
const nm = (t: Translate, kind: "photo" | "video" | "audio", n: number) => t("o10.itemName", { kind, n });
const shell = { onBack: noop, onDiscard: noop };

function signIn(extra: Partial<SignInViewProps>): ReactElement {
  return (
    <SignInView code={FIXTURE_CODE} pin="" onCode={noop} onCodeBlur={noop} onPin={noop} onSubmit={noop} onBack={noop} sending={false} error={null} {...extra} />
  );
}

const homeBase: HomeViewProps = {
  code: FIXTURE_CODE,
  offline: false,
  networkBack: false,
  queuedCount: 0,
  waitingCodeCount: 0,
  intakePaused: false,
  unsentCount: 0,
  needsAttentionCount: 0,
  questionCount: 0,
  pinSaved: false,
  draftKept: false,
  draft: null,
  rows: [],
  onReport: noop,
  onContinue: noop,
  onSendNow: noop,
  onFix: noop,
  onSendWaiting: noop,
  onDeleteWaiting: noop,
};

const homeRows: HomeViewProps["rows"] = [
  { href: "#1", category: "queues_crowding", place: "Kantudu", at: FIXTURE_OCCURRED_AT, status: "on-phone" },
  { href: "#2", category: "intimidation_violence", place: "Kantudu", at: FIXTURE_OCCURRED_AT, reference: FIXTURE_RECEIPT, status: "received" },
  { href: "#3", category: "late_materials", place: "Gwammaja", at: FIXTURE_OCCURRED_AT, reference: "EG-9M2C-7TQA", status: "question" },
];

function where(extra: Partial<WhereViewProps>, picker: Partial<WhereViewProps["picker"]> = {}): ReactElement {
  return (
    <WhereView
      {...shell}
      summary={null}
      error={false}
      onContinue={noop}
      {...extra}
      picker={{
        states: FIXTURE_STATES,
        areas: FIXTURE_AREAS,
        status: { kind: "ready" },
        value: { state_code: null, lga_code: null, ward_code: null, polling_unit_code: null, unknown_unit: false },
        onChange: noop,
        onRetry: noop,
        ...picker,
      }}
    />
  );
}

const unitValue = { state_code: "KN", lga_code: "KN-04", ward_code: "KN-04-07", polling_unit_code: "KN-04-07-012", unknown_unit: false };

function when(value: Parameters<typeof WhenView>[0]["value"], extra: Partial<Parameters<typeof WhenView>[0]> = {}): ReactElement {
  return (
    <WhenView
      {...shell}
      value={value}
      onChange={noop}
      showErrors={false}
      now={Date.parse("2026-12-05T10:00:00+01:00")}
      minDate="2026-11-05"
      oldSheet={false}
      onConfirmOld={noop}
      onChangeDate={noop}
      onContinue={noop}
      {...extra}
    />
  );
}

function describe(extra: Partial<DescribeViewProps>): ReactElement {
  return (
    <DescribeView
      {...shell}
      text=""
      onText={noop}
      firsthand={null}
      onFirsthand={noop}
      textError={null}
      sourceError={false}
      nameWarning={false}
      onNameKeep={noop}
      dictationLang="en-NG"
      onDictated={noop}
      onContinue={noop}
      {...extra}
    />
  );
}

const recorderIdle = { elapsedMs: null, start: async () => undefined, stop: noop };
const evidenceItems = (t: Translate): EvidenceViewProps["items"] => [
  { id: "a", kind: "photo", name: nm(t, "photo", 1), sizeBytes: 812_000, previewUrl: FIXTURE_PREVIEW, blur: false, processing: false },
  { id: "b", kind: "video", name: nm(t, "video", 2), sizeBytes: 8_123_456, previewUrl: null, blur: true, processing: false },
  { id: "c", kind: "audio", name: nm(t, "audio", 3), sizeBytes: 412_000, previewUrl: null, blur: false, processing: false },
];

function evidence(extra: Partial<EvidenceViewProps>): ReactElement {
  return (
    <EvidenceView
      {...shell}
      items={[]}
      recorder={recorderIdle}
      onPick={noop}
      onBlur={noop}
      onRetake={noop}
      onRemove={noop}
      notices={[]}
      limitReached={false}
      estimate={(bytes) => (bytes * 8) / 1_000_000}
      onContinue={noop}
      {...extra}
    />
  );
}

function check(t: Translate, extra: Partial<CheckViewProps>): ReactElement {
  return (
    <CheckView
      {...shell}
      category="intimidation_violence"
      access={[]}
      danger={false}
      place={FIXTURE_PLACE}
      occurredAt={FIXTURE_OCCURRED_AT}
      justNow={false}
      description={FIXTURE_TEXT}
      firsthand
      media={[
        { id: "a", kind: "photo", previewUrl: FIXTURE_PREVIEW, name: nm(t, "photo", 1) },
        { id: "c", kind: "audio", previewUrl: null, name: nm(t, "audio", 2) },
      ]}
      errors={{}}
      status={null}
      onEdit={noop}
      onSend={noop}
      onHome={noop}
      {...extra}
    />
  );
}

function receipt(extra: Partial<ReceiptViewProps>): ReactElement {
  return (
    <ReceiptView
      code={FIXTURE_RECEIPT}
      receivedAt={FIXTURE_RECEIVED_AT}
      justSent={false}
      citizen={false}
      items={[]}
      removeBlocked={false}
      offline={false}
      onRetry={noop}
      onRemove={noop}
      onChooseAgain={noop}
      onAnother={noop}
      onHome={noop}
      {...extra}
    />
  );
}

const uploads = (t: Translate): ReceiptViewProps["items"] => [
  { id: "a", kind: "photo", name: nm(t, "photo", 1), sizeBytes: 812_000, state: "saved", progress: 1, removable: true },
  { id: "b", kind: "video", name: nm(t, "video", 2), sizeBytes: 8_123_456, state: "uploading", progress: 0.42, removable: false },
  { id: "c", kind: "audio", name: nm(t, "audio", 3), sizeBytes: 412_000, state: "waiting", progress: 0, removable: true },
];

export const SCREENS: Record<string, Record<string, (t: Translate) => ReactElement>> = {
  o01: {
    first: () => <LanguageView selected={null} onChoose={noop} />,
    selected: () => <LanguageView selected="ha" onChoose={noop} />,
    offline: () => <LanguageView selected={null} onChoose={noop} offline />,
  },
  o02: {
    first: () => <NoticeView onBack={noop} onContinue={noop} />,
    offline: () => <NoticeView onBack={noop} onContinue={noop} offline />,
  },
  "o03-choose": { first: () => <ChooseView onBack={noop} onObserver={noop} onCitizen={noop} onCheckStatus={noop} /> },
  "o03-signin": {
    empty: () => signIn({ code: "" }),
    "code-format": () => signIn({ code: "OBS-7K2P9E", error: { field: "code", key: "o03.signIn.codeFormat" } }),
    "pin-format": () => signIn({ pin: "1234", error: { field: "pin", key: "o03.signIn.pinFormat" } }),
    offline: () => signIn({ pin: "123987", offline: true, error: { field: "form", key: "o03.signIn.offline" } }),
    sending: () => signIn({ pin: "123987", sending: true }),
    wrong: () => signIn({ error: { field: "pin", key: "o03.signIn.wrong" } }),
    locked: () => signIn({ locked: true, error: { field: "form", key: "common.error.tooManyTries", minutes: 15, until: Date.parse("2026-12-05T10:15:00+01:00") } }),
    revoked: () => signIn({ error: { field: "code", key: "o03.signIn.revoked" } }),
    server: () => signIn({ pin: "123987", error: { field: "form", key: "common.error.server" } }),
  },
  "o03-setpin": {
    first: () => <SetPinView first="" second="" onFirst={noop} onSecond={noop} onSubmit={noop} onBack={noop} sending={false} error={null} />,
    mismatch: () => <SetPinView first="482913" second="482914" onFirst={noop} onSecond={noop} onSubmit={noop} onBack={noop} sending={false} error={{ field: "second", key: "o03.setPin.mismatch" }} />,
    "too-simple": () => <SetPinView first="123456" second="123456" onFirst={noop} onSecond={noop} onSubmit={noop} onBack={noop} sending={false} error={{ field: "first", key: "o03.setPin.tooSimple" }} />,
    sending: () => <SetPinView first="482913" second="482913" onFirst={noop} onSecond={noop} onSubmit={noop} onBack={noop} sending error={null} />,
  },
  "o03-revoked": {
    unsent: () => <RevokedView unsentCount={2} onSignInNew={noop} onClear={noop} />,
    none: () => <RevokedView unsentCount={0} onSignInNew={noop} onClear={noop} />,
  },
  o04: {
    new: () => <HomeView {...homeBase} />,
    filled: () => <HomeView {...homeBase} draft={{ category: "access_barrier", startedAt: Date.parse(FIXTURE_OCCURRED_AT) }} unsentCount={1} queuedCount={1} questionCount={1} rows={homeRows} />,
    offline: () => <HomeView {...homeBase} offline unsentCount={2} queuedCount={2} rows={homeRows} />,
    "intake-paused": () => <HomeView {...homeBase} intakePaused rows={homeRows} />,
    "waiting-code": () => <HomeView {...homeBase} waitingCodeCount={2} needsAttentionCount={1} rows={homeRows} />,
    "network-back": () => <HomeView {...homeBase} networkBack pinSaved rows={homeRows} />,
  },
  o05: {
    first: () => <CategoryView {...shell} value={null} access={[]} error={false} onChange={noop} onAccess={noop} onContinue={noop} />,
    error: () => <CategoryView {...shell} value={null} access={[]} error onChange={noop} onAccess={noop} onContinue={noop} />,
    access: () => <CategoryView {...shell} value="access_barrier" access={["steps_no_ramp", "no_assistance"]} error={false} onChange={noop} onAccess={noop} onContinue={noop} />,
    offline: () => <CategoryView {...shell} offline value="queues_crowding" access={[]} error={false} onChange={noop} onAccess={noop} onContinue={noop} />,
  },
  o06: {
    first: () => <DangerView {...shell} value={null} onAnswer={noop} />,
    yes: () => <DangerView {...shell} value onAnswer={noop} />,
    emergency: () => <EmergencyView {...shell} onContinue={noop} onLater={noop} />,
  },
  o07: {
    empty: () => where({}),
    selected: () => where({ summary: FIXTURE_PLACE }, { value: unitValue }),
    "ward-only": () => where({ summary: "Kantudu, Dala" }, { value: { ...unitValue, polling_unit_code: null, unknown_unit: true } }),
    error: () => where({ error: true }),
    downloading: () => where({}, { areas: {}, value: { ...unitValue, lga_code: null, ward_code: null, polling_unit_code: null, state_code: "LA" }, status: { kind: "downloading", percent: 42 } }),
    "list-missing": () => where({ offline: true }, { areas: {}, value: { state_code: "LA", lga_code: null, ward_code: null, polling_unit_code: null, unknown_unit: false }, status: { kind: "missing" } }),
    "server-error": () => where({}, { areas: {}, value: { state_code: "LA", lga_code: null, ward_code: null, polling_unit_code: null, unknown_unit: false }, status: { kind: "error" } }),
    "no-index": () => where({ offline: true }, { states: null, areas: {} }),
  },
  o08: {
    "just-now": () => when({ mode: "now" }),
    "earlier-today": () => when({ mode: "today", time: "08:40" }),
    "another-day": () => when({ mode: "day", date: "2026-12-03", time: "14:10" }),
    future: () => when({ mode: "today", time: "11:30" }, { showErrors: true }),
    empty: () => when({ mode: "day" }, { showErrors: true }),
    old: () => when({ mode: "day", date: "2026-11-20", time: "10:00" }, { oldSheet: true }),
  },
  o09: {
    empty: () => describe({}),
    filled: () => describe({ text: FIXTURE_TEXT, firsthand: true }),
    listening: () => describe({ text: FIXTURE_TEXT, dictationState: "listening" }),
    note: () => describe({ dictationState: "note" }),
    unavailable: () => describe({ dictationState: "unavailable" }),
    denied: () => describe({ dictationState: "denied" }),
    "too-short": () => describe({ text: "Long queue", firsthand: true, textError: { key: "o09.tooShort", min: 20 } }),
    "too-long": () => describe({ text: FIXTURE_LONG_TEXT.repeat(2).slice(0, 2050), firsthand: true, textError: { key: "o09.tooLong", max: 2000 } }),
    "name-warning": () => describe({ text: FIXTURE_NAME_TEXT, firsthand: false, nameWarning: true }),
    "source-error": () => describe({ text: FIXTURE_TEXT, sourceError: true }),
  },
  o10: {
    empty: () => evidence({}),
    items: (t) => evidence({ items: evidenceItems(t) }),
    recording: () => evidence({ recorder: { ...recorderIdle, elapsedMs: 47_000 } }),
    processing: (t) => evidence({ items: [{ ...evidenceItems(t)[0], processing: true }] }),
    limit: (t) => evidence({ items: [...evidenceItems(t), ...evidenceItems(t).map((i) => ({ ...i, id: `${i.id}2` }))], limitReached: true, notices: [{ key: "o10.limitItems", vars: { max: 6 }, tone: "attn" }] }),
    "too-big": () => evidence({ notices: [{ key: "o10.tooBig", vars: { max: "2 MB" }, tone: "attn" }] }),
    "too-long": () => evidence({ notices: [{ key: "o10.videoTooLong", tone: "attn" }] }),
    "mic-denied": () => evidence({ notices: [{ key: "o10.micDenied", tone: "attn" }] }),
    offline: (t) => evidence({ offline: true, items: evidenceItems(t).slice(0, 1), estimate: () => null }),
  },
  o11: {
    first: (t) => check(t, {}),
    "long-text": (t) => check(t, { description: FIXTURE_LONG_TEXT, danger: true, justNow: true }),
    access: (t) => check(t, { category: "access_barrier", access: ["steps_no_ramp", "no_sign_language"], media: [] }),
    sending: (t) => check(t, { status: "sending" }),
    "saved-offline": (t) => check(t, { status: "savedOffline", offline: true }),
    "not-confirmed": (t) => check(t, { status: "notConfirmed" }),
    "intake-paused": (t) => check(t, { status: "intakePaused" }),
    "queue-full": (t) => check(t, { status: "queueFull" }),
    server: (t) => check(t, { status: "server" }),
    "needs-attention": (t) => check(t, { status: "needsAttention", errors: { when: "That time has not happened yet. Choose an earlier time.", where: "Choose a polling unit, or choose a ward and tap \"I don't know the polling unit\"." } }),
    incomplete: (t) => check(t, { firsthand: null, danger: null, errors: { danger: "Choose Yes or No.", source: "Choose how you know." } }),
  },
  o12: {
    "no-attachments": () => receipt({ justSent: true }),
    uploading: (t) => receipt({ items: uploads(t) }),
    failed: (t) =>
      receipt({
        items: [
          { ...uploads(t)[0] },
          { id: "b", kind: "video", name: nm(t, "video", 2), sizeBytes: 8_123_456, state: "failed", progress: 0, reasonKey: "o10.videoTooLong", removable: true },
          { id: "c", kind: "audio", name: nm(t, "audio", 3), sizeBytes: 412_000, state: "missing", progress: 0, removable: true },
          { id: "d", kind: "photo", name: nm(t, "photo", 4), sizeBytes: 3_100_000, state: "failed", progress: 0, reasonKey: "o10.tooBig", reasonVars: { max: "2 MB" }, removable: true },
        ],
      }),
    "all-saved": (t) => receipt({ items: uploads(t).map((u) => ({ ...u, state: "saved" as const, progress: 1 })) }),
    offline: (t) => receipt({ offline: true, items: uploads(t).map((u) => (u.state === "uploading" ? { ...u, state: "waiting" as const } : u)) }),
    citizen: () => receipt({ citizen: true, justSent: true }),
  },
  pending: {
    "on-phone": () => <PendingView state="on_phone" category="queues_crowding" place={FIXTURE_PLACE} occurredAt={FIXTURE_OCCURRED_AT} offline onHome={noop} />,
    "not-confirmed": () => <PendingView state="not_confirmed" category="intimidation_violence" place={FIXTURE_PLACE} occurredAt={FIXTURE_OCCURRED_AT} offline={false} onHome={noop} />,
    "needs-attention": () => <PendingView state="needs_attention" category="late_materials" place={FIXTURE_PLACE} occurredAt={FIXTURE_OCCURRED_AT} offline={false} onHome={noop} />,
    unknown: () => <PendingView state="unknown" offline={false} onHome={noop} />,
  },
};

export function ObserverStateViewer() {
  const params = useSearchParams();
  const screen = params.get("screen");
  const state = params.get("state");
  const lang = params.get("lang");
  const theme = params.get("theme");
  const { locale, loading } = useLocale();
  const t = useT();

  useEffect(() => {
    if (lang && isLocale(lang) && lang !== locale) void setLocale(lang);
  }, [lang, locale]);

  useEffect(() => {
    setThemePreference(theme === "dark" ? "dark" : "light");
    document.documentElement.style.background = theme === "dark" ? "#111112" : "#ffffff";
  }, [theme]);

  if ((lang && lang !== locale) || loading) return null;

  const render = screen && state ? SCREENS[screen]?.[state] : undefined;
  if (render) return <div data-viewer-ready="true">{render(t)}</div>;

  return (
    <main style={{ maxWidth: "44rem", margin: "0 auto", padding: "24px 16px", font: "400 1rem/1.5 system-ui, sans-serif" }}>
      <h1 style={{ fontSize: "1.5rem" }}>Observer screen states (development only)</h1>
      {Object.entries(SCREENS).map(([id, states]) => (
        <section key={id}>
          <h2 style={{ fontSize: "1.125rem" }}>{id}</h2>
          <ul>
            {Object.keys(states).map((name) => (
              <li key={name}>
                <Link href={`/dev/observer?screen=${id}&state=${name}`}>{name}</Link>
              </li>
            ))}
          </ul>
        </section>
      ))}
    </main>
  );
}
