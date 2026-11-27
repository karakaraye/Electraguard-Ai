"use client";

import { useState, type ReactNode } from "react";
import type { CaseDetail, CaseMedia, Category, Message, Outcome, ResultSheetFlag, Urgency } from "../../../../lib/api/types";
import { useLocale, useT } from "../../../../lib/i18n/client";
import { Banner, Button, SegmentedControl, Skeleton, StatusBadge, StatusShape, SuggestionCard, TextArea, Timeline, type ReportStatus as BadgeStatus } from "../../../../ui";
import { formatBytes, formatWatDateTime } from "../../../../ui/format";
import { CameraIcon, CheckIcon, EyeIcon, MessageIcon, RetryIcon } from "../../../../ui/icons";
import { CATEGORY_ROWS } from "../../../(public)/_lib/public";
import styles from "./CaseView.module.css";

const CATEGORY_KEY = Object.fromEntries(CATEGORY_ROWS.map((row) => [row.value, row.key])) as Record<Category, string>;
const URGENCIES: Urgency[] = ["urgent", "high", "normal", "low"];
const OUTCOMES: Outcome[] = ["corroborated", "insufficient_evidence", "out_of_scope"];
const TEXT_MAX = 2000;
const REASON_MAX = 500;

const LANGUAGE_NAMES: Record<string, string> = { ha: "Hausa", yo: "Yorùbá", ig: "Igbo", pcm: "Naijá", en: "English" };

const FLAG_KEYS: Record<string, string> = {
  accredited_exceeds_registered: "s03.resultSheet.accreditedExceeds",
  votes_plus_rejected_differs: "s03.resultSheet.sumDiffers",
  round_numbers: "s03.resultSheet.roundNumbers",
  identical_to_other_unit: "s03.resultSheet.identical",
  possible_digit_swap: "s03.resultSheet.digitSwap",
  // The names the server sends today.
  count_mismatch: "s03.resultSheet.sumDiffers",
  likely_digit_swap: "s03.resultSheet.digitSwap",
  identical_sheet: "s03.resultSheet.identical",
};

/** What the server said when an action could not be saved. */
export type CaseConflict = "stale_version" | "invalid_transition" | "closure_evidence_changed" | "validation" | "network";

export type UnblurResult = { url: string } | { error: "unavailable" | "network" };

export interface CaseViewProps {
  caseData: CaseDetail | null;
  loading: boolean;
  error: string | null;
  /** The observer conversation (MSG-01). Null while it loads or when it cannot be read. */
  messages?: Message[] | null;
  conflict?: CaseConflict | null;
  /** Which action is being saved, to show its button as busy. */
  busy?: "start" | "ask" | "close" | "message" | "suggestion" | "duplicate" | "redaction" | null;
  onReload?: () => void;
  onStartReview?: () => void;
  onAskQuestion?: (question: string) => void;
  onCloseCase?: (outcome: Outcome, rationale: string, expectedMediaIds: string[]) => void;
  onAcceptSuggestion?: (type: "category" | "urgency") => void;
  onCorrectSuggestion?: (type: "category" | "urgency", value: string) => void;
  onDuplicateDecision?: (otherId: string, decision: "link" | "keep_separate") => void;
  onSaveRedaction?: (spans: Array<{ start: number; end: number }>) => void;
  onSendMessage?: (body: string) => void;
  /** Fetches the unblurred original with a reason the server records in the audit. */
  onViewUnblurred?: (mediaId: string, reason: string) => Promise<UnblurResult>;
  "data-testid"?: string;
}

function badgeStatus(status: CaseDetail["status"]): BadgeStatus {
  return (status === "in_review" ? "in-review" : status) as BadgeStatus;
}

/** S-03 case review: the report on the left, help in the middle, the decision on the right. */
export function CaseView({
  caseData,
  loading,
  error,
  messages,
  conflict,
  busy,
  onReload,
  onStartReview,
  onAskQuestion,
  onCloseCase,
  onAcceptSuggestion,
  onCorrectSuggestion,
  onDuplicateDecision,
  onSaveRedaction,
  onSendMessage,
  onViewUnblurred,
  "data-testid": testId = "case-view",
}: CaseViewProps) {
  const t = useT();
  const { locale } = useLocale();

  if (error) {
    return (
      <div className={styles.container} data-testid={testId}>
        <Banner
          tone="danger"
          title={error}
          critical
          action={onReload ? <Button variant="secondary" icon={<RetryIcon />} onClick={onReload}>{t("staff.retry")}</Button> : undefined}
        />
      </div>
    );
  }

  if (loading || !caseData) {
    return (
      <div className={styles.container} data-testid={testId} role="status" aria-busy="true" aria-label={t("staff.loading")}>
        <div className={styles.loadingGrid}>
          <Skeleton lines={6} height={20} delay={0} />
          <Skeleton lines={4} height={20} delay={0} />
          <Skeleton lines={5} height={20} delay={0} />
        </div>
      </div>
    );
  }

  const c = caseData;
  const when = (value: string | null) => (value ? formatWatDateTime(value, locale) : t("s03.details.unknown"));
  const yesNo = (value: boolean | null) => (value === null ? t("s03.details.unknown") : value ? t("s03.details.yes") : t("s03.details.no"));
  const place = c.area
    ? [c.area.polling_unit_name, c.area.ward_name, c.area.lga_name, c.area.state_name].filter(Boolean).join(", ")
    : (c.legacy_location ?? t("s03.details.unknown"));
  const reporter =
    c.reporter.type === "observer" ? t("s03.reporter.observer", { code: c.reporter.label })
      : c.reporter.type === "citizen" ? t("s03.reporter.citizen", { code: c.reporter.label })
        : c.reporter.type === "sms" ? t("s03.reporter.sms")
          : t("s03.reporter.ussd");
  const skewMinutes = c.times.clock_skew_seconds ? Math.round(Math.abs(c.times.clock_skew_seconds) / 60) : 0;

  return (
    <div className={styles.container} data-testid={testId}>
      <header className={styles.header}>
        <div className={styles.headMain}>
          <p className={styles.reporter}>{reporter}</p>
        </div>
        <div className={styles.headBadges}>
          <StatusBadge status={badgeStatus(c.status)} size="lg" morph />
          {c.simulated ? <span className={styles.simulated}>{t("s03.simulated")}</span> : null}
        </div>
      </header>

      {conflict ? <ConflictBanner conflict={conflict} onReload={onReload} /> : null}

      <div className={styles.columns}>
        {/* ---------- Left: the report ---------- */}
        <section className={styles.column} aria-labelledby="s03-report">
          <h2 id="s03-report" className={styles.columnTitle}>{t("s03.columns.report")}</h2>

          <ReportText caseData={c} busy={busy === "redaction"} onSaveRedaction={onSaveRedaction} />

          <div className={styles.card}>
            <h3 className={styles.cardTitle}>{t("s03.details.title")}</h3>
            <dl className={styles.facts}>
              <Fact label={t("s03.details.categoryGiven")}>{c.category_observer ? t(CATEGORY_KEY[c.category_observer]) : t("s03.details.unknown")}</Fact>
              <Fact label={t("s03.details.dangerNow")}>
                {c.danger_now ? <span className={styles.danger}><StatusShape tone="danger" size={14} />{t("s03.details.yes")}</span> : yesNo(c.danger_now)}
              </Fact>
              <Fact label={t("s03.details.seenFirsthand")}>{yesNo(c.firsthand)}</Fact>
              <Fact label={t("s03.details.place")}>{place}</Fact>
              <Fact label={t("s03.details.occurred")}><span className="eg-tnum">{when(c.times.occurred_at)}</span></Fact>
              <Fact label={t("s03.details.saved")}><span className="eg-tnum">{when(c.times.device_saved_at)}</span></Fact>
              <Fact label={t("s03.details.received")}><span className="eg-tnum">{when(c.times.received_at)}</span></Fact>
              <Fact label={t("s02.filters.channel")}>{t(`s02.channel.${c.channel}`)}</Fact>
            </dl>
            {skewMinutes >= 2 ? <p className={styles.note}>{t("s03.details.skewWarn", { minutes: skewMinutes })}</p> : null}
          </div>

          <div className={styles.card}>
            <h3 className={styles.cardTitle}>{t("s03.evidence.title")}</h3>
            {c.media.length === 0 && c.pending_uploads.length === 0 ? (
              <p className={styles.muted}>{t("s03.evidence.noEvidence")}</p>
            ) : (
              <ul className={styles.evidenceList}>
                {c.media.map((media) => (
                  <EvidenceItem key={media.id} media={media} onViewUnblurred={onViewUnblurred} />
                ))}
                {c.pending_uploads.map((upload) => (
                  <li key={upload.id} className={styles.pending}>
                    <StatusShape tone="wait" size={14} />
                    <span className="eg-tnum">
                      {t("s03.evidence.pendingUpload", { received: formatBytes(upload.received_bytes ?? 0, locale), total: formatBytes(upload.size_bytes, locale) })}
                    </span>
                  </li>
                ))}
              </ul>
            )}
          </div>
        </section>

        {/* ---------- Middle: help ---------- */}
        <section className={styles.column} aria-labelledby="s03-help">
          <h2 id="s03-help" className={styles.columnTitle}>{t("s03.columns.help")}</h2>
          <Suggestions caseData={c} busy={busy === "suggestion"} onAccept={onAcceptSuggestion} onCorrect={onCorrectSuggestion} />

          {c.name_check.possible_names ? (
            <p className={styles.attnNote}><StatusShape tone="attn" size={14} />{t("s03.suggestions.names")}</p>
          ) : null}

          {c.duplicates.length > 0 ? <Duplicates caseData={c} busy={busy === "duplicate"} onDecide={onDuplicateDecision} /> : null}

          {c.kind === "result_sheet" || c.result_sheet_flags.length > 0 ? <ResultSheetFlags flags={c.result_sheet_flags} /> : null}
        </section>

        {/* ---------- Right: the decision ---------- */}
        <section className={styles.column} aria-labelledby="s03-decision">
          <h2 id="s03-decision" className={styles.columnTitle}>{t("s03.columns.decision")}</h2>
          <Decision caseData={c} busy={busy ?? null} onStart={onStartReview} onAsk={onAskQuestion} onClose={onCloseCase} />
          <Conversation messages={messages} busy={busy === "message"} onSend={onSendMessage} />
          <div className={styles.card}>
            <h3 className={styles.cardTitle}>{t("s03.history.title")}</h3>
            <Timeline
              events={c.history.events.map((event) => ({
                id: event.id,
                actor: event.actor_label,
                at: event.created_at,
                change: humanise(event.action),
                detail: Object.keys(event.change).length
                  ? Object.entries(event.change)
                      .filter(([, val]) => val !== null && val !== "")
                      .map(([key, val]) => `${humanise(key)}: ${changeValue(val)}`)
                      .join(" · ") || undefined
                  : undefined,
              }))}
              // The server sends null when it has not checked this case's chain: never show that as tampering.
              chain={c.history.chain_intact === true ? "intact" : c.history.chain_intact === false ? "broken" : "unknown"}
            />
          </div>
        </section>
      </div>
    </div>
  );
}

/** Audit actions arrive as codes ("suggestion_accepted"); show them as words. */
/** Codes ("in_review") read as words; anything else (emails, references) is shown exactly as sent. */
function changeValue(val: unknown): string {
  if (typeof val === "string") return /^[a-z][a-z_]*$/.test(val) ? humanise(val) : val;
  if (typeof val === "number" || typeof val === "boolean") return String(val);
  return JSON.stringify(val);
}

function humanise(code: string): string {
  const words = code.replace(/_/g, " ").trim();
  return words.charAt(0).toUpperCase() + words.slice(1);
}

function Fact({ label, children }: { label: string; children: ReactNode }) {
  return (
    <div>
      <dt>{label}</dt>
      <dd>{children}</dd>
    </div>
  );
}

function ConflictBanner({ conflict, onReload }: { conflict: CaseConflict; onReload?: () => void }) {
  const t = useT();
  const title =
    conflict === "stale_version" ? t("s03.errors.stale")
      : conflict === "invalid_transition" ? t("s03.errors.invalid")
        : conflict === "closure_evidence_changed" ? t("s03.errors.evidence")
          : conflict === "validation" ? t("s03.errors.validation")
            : t("staff.networkError");
  const reload = conflict !== "validation" && onReload;
  return (
    <Banner
      tone={conflict === "validation" ? "attn" : "danger"}
      title={title}
      critical
      action={reload ? <Button variant="secondary" icon={<RetryIcon />} onClick={onReload}>{t("s03.errors.reload")}</Button> : undefined}
      data-testid="s03-conflict"
    />
  );
}

/* ---------- The report text, translation and redaction ---------- */

function ReportText({
  caseData,
  busy,
  onSaveRedaction,
}: {
  caseData: CaseDetail;
  busy: boolean;
  onSaveRedaction?: (spans: Array<{ start: number; end: number }>) => void;
}) {
  const t = useT();
  const original = caseData.original.description ?? "";
  const shown = caseData.original.redacted_description ?? original;
  const translation = caseData.translation;
  const [view, setView] = useState<"original" | "english">("original");
  const [redacting, setRedacting] = useState(false);
  const [spans, setSpans] = useState(caseData.original.redactions);
  const [selection, setSelection] = useState<{ start: number; end: number; text: string } | null>(null);
  const language = caseData.language ? (LANGUAGE_NAMES[caseData.language] ?? caseData.language) : null;
  const canRedact = caseData.allowed_actions.includes("redact") && Boolean(original);

  function captureSelection() {
    const sel = window.getSelection();
    const text = sel && !sel.isCollapsed ? sel.toString().trim() : "";
    if (text.length < 2) return;
    const start = original.indexOf(text);
    if (start !== -1) setSelection({ start, end: start + text.length, text });
  }

  function hideSelection() {
    if (!selection) return;
    if (!spans.some((s) => s.start === selection.start && s.end === selection.end)) setSpans([...spans, { start: selection.start, end: selection.end }]);
    setSelection(null);
    window.getSelection()?.removeAllRanges();
  }

  function marked(): ReactNode[] {
    const sorted = [...spans].sort((a, b) => a.start - b.start);
    const parts: ReactNode[] = [];
    let at = 0;
    sorted.forEach((span, i) => {
      if (span.start > at) parts.push(<span key={`t${at}`}>{original.slice(at, span.start)}</span>);
      parts.push(
        <mark key={`m${i}`} className={styles.hidden}>
          <span>{t("s03.redaction.hidden")}</span>
          <button
            type="button"
            className={styles.unhide}
            onClick={() => setSpans(spans.filter((s) => s !== span))}
            aria-label={`${t("s03.redaction.undo")}: ${original.slice(span.start, span.end)}`}
          >
            ×
          </button>
        </mark>,
      );
      at = Math.max(at, span.end);
    });
    if (at < original.length) parts.push(<span key={`t${at}`}>{original.slice(at)}</span>);
    return parts;
  }

  return (
    <div className={styles.card}>
      <div className={styles.cardHead}>
        <h3 className={styles.cardTitle}>{t("s03.originalText")}</h3>
        {language ? <span className={styles.muted}>{t("s03.language", { lang: language })}</span> : null}
      </div>

      {translation.status === "ready" && translation.text && !redacting ? (
        <>
          <SegmentedControl
            label={t("s03.translation")}
            value={view}
            onChange={(value) => setView(value as "original" | "english")}
            options={[
              { value: "original", label: t("s03.translationView.original") },
              { value: "english", label: t("s03.translationView.english") },
            ]}
            data-testid="s03-translation-toggle"
          />
          {view === "english" ? <p className={styles.machine}><StatusShape tone="info" size={14} />{t("s03.translation")}</p> : null}
        </>
      ) : null}

      {redacting ? (
        <div className={styles.redactBox}>
          <p className={styles.muted}>{t("s03.redaction.hint")}</p>
          <div className={styles.text} onMouseUp={captureSelection} onTouchEnd={captureSelection} data-testid="s03-redact-text">
            {marked()}
          </div>
          {selection ? (
            <div className={styles.selectionRow}>
              <span>{t("s03.redaction.selected", { text: selection.text })}</span>
              <Button variant="secondary" onClick={hideSelection}>{t("s03.redaction.hideThisName")}</Button>
            </div>
          ) : null}
          <p className={`${styles.muted} eg-tnum`}>{t("s03.redaction.count", { count: spans.length })}</p>
          <div className={styles.row}>
            <Button
              variant="primary"
              loading={busy}
              onClick={() => {
                onSaveRedaction?.(spans);
                setRedacting(false);
              }}
            >
              {t("s03.redaction.save")}
            </Button>
            <Button
              variant="quiet"
              onClick={() => {
                setSpans(caseData.original.redactions);
                setSelection(null);
                setRedacting(false);
              }}
            >
              {t("staff.cancel")}
            </Button>
          </div>
        </div>
      ) : (
        <>
          <p className={styles.text} lang={view === "original" ? (caseData.language ?? undefined) : "en"} data-testid="s03-text">
            {view === "english" && translation.text ? translation.text : shown || t("s03.details.unknown")}
          </p>
          {translation.status === "pending" ? <p className={styles.muted}>{t("s03.translationView.pending")}</p> : null}
          {translation.status === "failed" ? <p className={styles.muted}>{t("s03.translationView.failed")}</p> : null}
          {canRedact ? (
            <div>
              <Button variant="quiet" icon={<EyeIcon />} onClick={() => setRedacting(true)} data-testid="s03-redact">
                {t("s03.redaction.mode")}
              </Button>
            </div>
          ) : null}
        </>
      )}
    </div>
  );
}

/* ---------- Evidence ---------- */

function EvidenceItem({ media, onViewUnblurred }: { media: CaseMedia; onViewUnblurred?: CaseViewProps["onViewUnblurred"] }) {
  const t = useT();
  const [asking, setAsking] = useState(false);
  const [reason, setReason] = useState("");
  const [state, setState] = useState<{ url?: string; error?: string; loading?: boolean }>({});
  const [thumbFailed, setThumbFailed] = useState(false);
  const visual = media.kind === "photo" || media.kind === "video";
  const src = (variant: string) => `/api/v1/media/${media.id}/content?variant=${variant}`;

  async function view() {
    if (!onViewUnblurred || !reason.trim()) return;
    setState({ loading: true });
    const result = await onViewUnblurred(media.id, reason.trim());
    if ("url" in result) {
      setState({ url: result.url });
      setAsking(false);
    } else {
      setState({ error: result.error === "unavailable" ? t("s03.evidence.unblurUnavailable") : t("staff.networkError") });
    }
  }

  const checks: Array<{ ok: boolean; yes: string; no: string }> = [
    { ok: media.integrity_verified, yes: t("s03.evidence.sha256"), no: t("s03.evidence.sha256No") },
    { ok: media.exif_removed, yes: t("s03.evidence.exifRemoved"), no: t("s03.evidence.exifNo") },
  ];
  if (visual) checks.push({ ok: media.blurred, yes: t("s03.evidence.blurred"), no: t("s03.evidence.blurredNo") });

  return (
    <li className={styles.evidence}>
      <div className={styles.media}>
        {state.url && media.kind === "photo" ? (
          /* eslint-disable-next-line @next/next/no-img-element */
          <img src={state.url} alt={t("s03.evidence.unblurredAlt")} />
        ) : media.kind === "photo" && thumbFailed ? (
          <div className={styles.mediaFallback} role="img" aria-label={t("s03.evidence.kind.photo")}>
            <CameraIcon size={28} />
          </div>
        ) : media.kind === "photo" ? (
          /* eslint-disable-next-line @next/next/no-img-element */
          <img src={src("thumb")} alt={t("s03.evidence.kind.photo")} loading="lazy"
            onError={() => setThumbFailed(true)}
            ref={(el) => {
              /* The load may have failed before React attached onError (server-rendered page). */
              if (el && el.complete && el.naturalWidth === 0) queueMicrotask(() => setThumbFailed(true));
            }}
          />
        ) : media.kind === "video" ? (
          <video src={state.url ?? src("display")} poster={src("poster")} controls preload="none" aria-label={t("s03.evidence.kind.video")} />
        ) : (
          <audio src={src("display")} controls preload="none" aria-label={t("s03.evidence.kind.audio")} />
        )}
      </div>
      <div className={styles.evidenceBody}>
        <p className={styles.evidenceKind}>{t(`s03.evidence.kind.${media.kind}`)}</p>
        <ul className={styles.checks}>
          {checks.map((check) => (
            <li key={check.yes} data-ok={check.ok ? "" : undefined}>
              {check.ok ? <CheckIcon size={16} /> : <StatusShape tone="attn" size={14} />}
              <span>{check.ok ? check.yes : check.no}</span>
            </li>
          ))}
        </ul>
        {media.transcript ? (
          <div className={styles.transcript}>
            <p className={styles.evidenceKind}>{t("s03.evidence.transcript")}</p>
            <p>{media.transcript.text}</p>
          </div>
        ) : null}
        {state.url ? <p className={styles.attnNote}><StatusShape tone="attn" size={14} />{t("s03.evidence.unblurShown")}</p> : null}
        {visual && onViewUnblurred && !state.url ? (
          asking ? (
            <div className={styles.unblur}>
              <TextArea
                id={`unblur-${media.id}`}
                label={t("s03.evidence.unblurReason")}
                hint={t("s03.evidence.unblurHint")}
                maxLength={REASON_MAX}
                rows={2}
                value={reason}
                onChange={(e) => setReason(e.target.value)}
              />
              {state.error ? <p className={styles.errorText} role="alert">{state.error}</p> : null}
              <div className={styles.row}>
                <Button variant="secondary" onClick={() => void view()} disabled={!reason.trim()} loading={state.loading}>
                  {t("s03.evidence.unblurConfirm")}
                </Button>
                <Button variant="quiet" onClick={() => setAsking(false)}>{t("staff.cancel")}</Button>
              </div>
            </div>
          ) : (
            <Button variant="quiet" icon={<EyeIcon />} onClick={() => setAsking(true)} data-testid={`s03-unblur-${media.id}`}>
              {t("s03.evidence.unblur")}
            </Button>
          )
        ) : null}
      </div>
    </li>
  );
}

/** The server sends plain sentences; drop anything that looks like an internal code (snake_case or no spaces). */
function isPlainReason(reason: string): boolean {
  return /\s/.test(reason.trim()) && !/^[a-z0-9]+(_[a-z0-9]+)+$/.test(reason.trim());
}

/* ---------- Suggestions: always labelled, never decided in one click ---------- */

function Suggestions({
  caseData,
  busy,
  onAccept,
  onCorrect,
}: {
  caseData: CaseDetail;
  busy: boolean;
  onAccept?: (type: "category" | "urgency") => void;
  onCorrect?: (type: "category" | "urgency", value: string) => void;
}) {
  const t = useT();
  const s = caseData.suggestions;
  const label = (type: "category" | "urgency", value: string | null) =>
    !value ? "" : type === "category" ? t(CATEGORY_KEY[value as Category]) : t(`s02.urgency.${value}`);

  return (
    <div className={`${styles.stack} ${styles.suggestionHost}`}>
      <p className={styles.muted}>{t("s03.suggestions.notice")}</p>
      {s.status === "pending" ? <p className={styles.card}>{t("s03.suggestions.pending")}</p> : null}
      {s.status === "failed" ? <p className={styles.card}>{t("s03.suggestions.failed")}</p> : null}
      {s.status === "ready" && s.abstained ? <p className={styles.card} data-testid="s03-abstained">{t("s03.suggestions.abstained")}</p> : null}
      {s.status === "ready" && !s.abstained
        ? (["category", "urgency"] as const).map((type) => {
            const suggestion = s[type];
            if (!suggestion.value) return null;
            return (
              <SuggestionItem
                key={type}
                type={type}
                field={type === "category" ? t("s02.columns.category") : t("s02.columns.urgency")}
                value={label(type, suggestion.value)}
                confidence={suggestion.confidence ?? "low"}
                reasons={suggestion.reasons.filter(isPlainReason)}
                decision={suggestion.decision}
                corrected={label(type, suggestion.corrected_value)}
                options={
                  type === "category"
                    ? CATEGORY_ROWS.filter((row) => row.value !== "not_sure").map((row) => ({ value: row.value, label: t(row.key) }))
                    : URGENCIES.map((level) => ({ value: level, label: t(`s02.urgency.${level}`) }))
                }
                current={suggestion.value}
                busy={busy}
                onAccept={() => onAccept?.(type)}
                onCorrect={(value) => onCorrect?.(type, value)}
              />
            );
          })
        : null}
    </div>
  );
}

function SuggestionItem({
  type,
  field,
  value,
  confidence,
  reasons,
  decision,
  corrected,
  options,
  current,
  busy,
  onAccept,
  onCorrect,
}: {
  type: "category" | "urgency";
  field: string;
  value: string;
  confidence: "high" | "medium" | "low";
  reasons: string[];
  decision: "accepted" | "corrected" | null;
  corrected: string;
  options: Array<{ value: string; label: string }>;
  current: string;
  busy: boolean;
  onAccept: () => void;
  onCorrect: (value: string) => void;
}) {
  const t = useT();
  const [mode, setMode] = useState<"idle" | "confirm" | "change">("idle");
  const [choice, setChoice] = useState(current);
  return (
    <div className={styles.stack}>
      <SuggestionCard
        field={field}
        value={value}
        confidence={confidence}
        reasons={reasons}
        state={decision === "accepted" ? "accepted" : decision === "corrected" ? "corrected" : "pending"}
        correctedValue={corrected || undefined}
        saving={busy}
        onAccept={() => setMode("confirm")}
        onCorrect={() => setMode("change")}
        data-testid={`s03-suggestion-${type}`}
      />
      {decision === null && mode === "confirm" ? (
        <div className={styles.confirm} data-testid={`s03-confirm-${type}`}>
          <p>{t("s03.suggestions.confirmAccept", { field: field.toLowerCase(), value })}</p>
          <div className={styles.row}>
            <Button
              variant="primary"
              loading={busy}
              onClick={() => {
                onAccept();
                setMode("idle");
              }}
            >
              {t("staff.confirm")}
            </Button>
            <Button variant="quiet" onClick={() => setMode("idle")}>{t("staff.cancel")}</Button>
          </div>
        </div>
      ) : null}
      {decision === null && mode === "change" ? (
        <div className={styles.confirm}>
          <label className={styles.selectLabel}>
            <span>{t("s03.suggestions.correctLabel")}</span>
            <select value={choice} onChange={(e) => setChoice(e.target.value)}>
              {options.map((option) => (
                <option key={option.value} value={option.value}>{option.label}</option>
              ))}
            </select>
          </label>
          <div className={styles.row}>
            <Button
              variant="primary"
              loading={busy}
              disabled={choice === current}
              onClick={() => {
                onCorrect(choice);
                setMode("idle");
              }}
            >
              {t("s03.suggestions.saveCorrection")}
            </Button>
            <Button variant="quiet" onClick={() => setMode("idle")}>{t("staff.cancel")}</Button>
          </div>
        </div>
      ) : null}
    </div>
  );
}

/* ---------- Duplicates side by side ---------- */

function Duplicates({
  caseData,
  busy,
  onDecide,
}: {
  caseData: CaseDetail;
  busy: boolean;
  onDecide?: (otherId: string, decision: "link" | "keep_separate") => void;
}) {
  const t = useT();
  const { locale } = useLocale();
  const [confirming, setConfirming] = useState<string | null>(null);
  const summary = (category: Category | null, ward: string | null, at: string | null, channel: string) => (
    <dl className={styles.dupFacts}>
      <div><dt>{t("s02.columns.category")}</dt><dd>{category ? t(CATEGORY_KEY[category]) : t("s03.details.unknown")}</dd></div>
      <div><dt>{t("s03.details.place")}</dt><dd>{ward ?? t("s03.details.unknown")}</dd></div>
      <div><dt>{t("s03.details.occurred")}</dt><dd className="eg-tnum">{at ? formatWatDateTime(at, locale) : t("s03.details.unknown")}</dd></div>
      <div><dt>{t("s02.filters.channel")}</dt><dd>{t(`s02.channel.${channel}`)}</dd></div>
    </dl>
  );

  return (
    <div className={styles.card}>
      <h3 className={styles.cardTitle}>{t("s03.duplicates.title")}</h3>
      <p className={styles.muted}>{t("s03.duplicates.notice")}</p>
      {caseData.duplicates.map((dup) => (
        <div key={dup.report_id} className={styles.dup} data-testid={`s03-dup-${dup.report_id}`}>
          <div className={styles.dupPair}>
            <div className={styles.dupSide}>
              <p className={styles.evidenceKind}>{t("s03.duplicates.thisCase")}</p>
              <p className={`${styles.dupRef} eg-tnum`}>{caseData.receipt_code}</p>
              {summary(caseData.category_observer, caseData.area?.ward_name ?? null, caseData.times.occurred_at, caseData.channel)}
            </div>
            <div className={styles.dupSide}>
              <p className={styles.evidenceKind}>{t("s03.duplicates.similarity", { percent: Math.round(dup.score * 100) })}</p>
              <p className={`${styles.dupRef} eg-tnum`}>{dup.receipt_code ?? "—"}</p>
              {dup.accessible ? summary(dup.summary.category, dup.summary.ward_name, dup.summary.occurred_at, dup.summary.channel) : <p className={styles.muted}>{t("s03.duplicates.inaccessible")}</p>}
            </div>
          </div>
          {dup.decision === "pending" ? (
            confirming === dup.report_id ? (
              <div className={styles.row}>
                <Button
                  variant="primary"
                  loading={busy}
                  onClick={() => {
                    onDecide?.(dup.report_id, "link");
                    setConfirming(null);
                  }}
                >
                  {t("s03.duplicates.confirmLink")}
                </Button>
                <Button variant="quiet" onClick={() => setConfirming(null)}>{t("staff.cancel")}</Button>
              </div>
            ) : (
              <div className={styles.row}>
                <Button variant="secondary" onClick={() => setConfirming(dup.report_id)}>{t("s03.duplicates.link")}</Button>
                <Button variant="quiet" loading={busy} onClick={() => onDecide?.(dup.report_id, "keep_separate")}>{t("s03.duplicates.keepSeparate")}</Button>
              </div>
            )
          ) : (
            <p className={styles.decided} role="status">
              <CheckIcon size={16} />
              {dup.decision === "linked" ? t("s03.duplicates.linked") : t("s03.duplicates.keptSeparate")}
            </p>
          )}
        </div>
      ))}
    </div>
  );
}

/* ---------- Result sheet flags ---------- */

function ResultSheetFlags({ flags }: { flags: ResultSheetFlag[] }) {
  const t = useT();
  return (
    <div className={styles.sheet} data-testid="s03-result-sheet">
      <h3 className={styles.cardTitle}>{t("s03.resultSheet.title")}</h3>
      <p className={styles.disclaimer}>{t("s03.resultSheet.disclaimer")}</p>
      {flags.length === 0 ? (
        <p className={styles.muted}>{t("s03.resultSheet.noFlags")}</p>
      ) : (
        <ul className={styles.flagList}>
          {flags.map((flag) => {
            // The server sends a code and a plain explanation; older fixtures send a type and numbers.
            const loose = flag as Partial<ResultSheetFlag> & { code?: string; explanation?: string };
            const code = loose.code ?? loose.type ?? "";
            const detail = loose.values
              ? Object.entries(loose.values).map(([key, val]) => `${key.replace(/_/g, " ")}: ${val}`).join(" · ")
              : loose.explanation ?? "";
            return (
              <li key={code}>
                <p className={styles.flagTitle}><StatusShape tone="attn" size={14} />{t(FLAG_KEYS[code] ?? "s03.resultSheet.flags")}</p>
                <p className={`${styles.muted} eg-tnum`}>{detail}</p>
              </li>
            );
          })}
        </ul>
      )}
      {flags.length ? <p className={styles.muted}>{t("s03.resultSheet.benignCauses")}</p> : null}
    </div>
  );
}

/* ---------- Decision: start, ask, close ---------- */

function Decision({
  caseData,
  busy,
  onStart,
  onAsk,
  onClose,
}: {
  caseData: CaseDetail;
  busy: CaseViewProps["busy"];
  onStart?: () => void;
  onAsk?: (question: string) => void;
  onClose?: (outcome: Outcome, rationale: string, expectedMediaIds: string[]) => void;
}) {
  const t = useT();
  const { locale } = useLocale();
  const [question, setQuestion] = useState("");
  const [outcome, setOutcome] = useState<Outcome | null>(null);
  const [rationale, setRationale] = useState("");
  const [considered, setConsidered] = useState(false);
  const allowed = caseData.allowed_actions;
  const files = caseData.media.length;
  const q = caseData.open_question;

  return (
    <div className={styles.stack}>
      <div className={styles.card}>
        <h3 className={styles.cardTitle}>{t("s03.decision.status")}</h3>
        {caseData.outcome ? <p className={styles.outcomeLine}>{t("s03.decision.outcome", { outcome: t(`s03.actions.outcome.${caseData.outcome}`) })}</p> : null}
        {q ? (
          <div className={styles.openQuestion}>
            <p className={styles.evidenceKind}>{t("s03.decision.openQuestion")}</p>
            <p>{q.body}</p>
            <p className={`${styles.muted} eg-tnum`}>{t("s03.decision.askedAt", { time: formatWatDateTime(q.asked_at, locale) })}</p>
          </div>
        ) : null}
        {allowed.includes("start") ? (
          <Button variant="primary" onClick={onStart} loading={busy === "start"} data-testid="s03-start">
            {t("s03.actions.startReview")}
          </Button>
        ) : null}
        {!allowed.includes("start") && !allowed.includes("ask") && !allowed.includes("close") ? (
          <p className={styles.muted}>{t("s03.decision.nothing")}</p>
        ) : null}
      </div>

      {allowed.includes("ask") ? (
        <form
          className={styles.card}
          onSubmit={(e) => {
            e.preventDefault();
            if (!question.trim()) return;
            onAsk?.(question.trim());
            setQuestion("");
          }}
        >
          <h3 className={styles.cardTitle}>{t("s03.actions.askQuestion")}</h3>
          <TextArea
            id="s03-question"
            label={t("s03.actions.questionLabel")}
            hint={t("s03.actions.questionHint")}
            maxLength={TEXT_MAX}
            rows={3}
            value={question}
            onChange={(e) => setQuestion(e.target.value)}
          />
          <div>
            <Button type="submit" variant="secondary" disabled={!question.trim()} loading={busy === "ask"} data-testid="s03-ask">
              {t("s03.actions.submitQuestion")}
            </Button>
          </div>
        </form>
      ) : null}

      {allowed.includes("close") ? (
        <form
          className={styles.card}
          onSubmit={(e) => {
            e.preventDefault();
            if (!outcome || !rationale.trim() || !considered) return;
            onClose?.(outcome, rationale.trim(), caseData.media.map((m) => m.id));
          }}
        >
          <h3 className={styles.cardTitle}>{t("s03.actions.closeCase")}</h3>
          <fieldset className={styles.outcomes}>
            <legend>{t("s03.actions.outcomeLabel")}</legend>
            {OUTCOMES.map((value) => (
              <label key={value} className={styles.radio} data-on={outcome === value ? "" : undefined}>
                <input type="radio" name="s03-outcome" value={value} checked={outcome === value} onChange={() => setOutcome(value)} />
                <span>{t(`s03.actions.outcome.${value}`)}</span>
              </label>
            ))}
          </fieldset>
          <TextArea
            id="s03-rationale"
            label={t("s03.actions.rationaleLabel")}
            hint={t("s03.actions.rationaleHint")}
            maxLength={TEXT_MAX}
            rows={4}
            value={rationale}
            onChange={(e) => setRationale(e.target.value)}
          />
          <label className={styles.check}>
            <input type="checkbox" checked={considered} onChange={(e) => setConsidered(e.target.checked)} data-testid="s03-considered" />
            <span>{t("s03.actions.considered", { count: files })}</span>
          </label>
          <div>
            <Button type="submit" variant="primary" disabled={!outcome || !rationale.trim() || !considered} loading={busy === "close"} data-testid="s03-close">
              {t("s03.actions.submitClose")}
            </Button>
          </div>
        </form>
      ) : null}
    </div>
  );
}

/* ---------- Conversation with the reporter ---------- */

function Conversation({ messages, busy, onSend }: { messages?: Message[] | null; busy: boolean; onSend?: (body: string) => void }) {
  const t = useT();
  const { locale } = useLocale();
  const [body, setBody] = useState("");
  return (
    <div className={styles.card}>
      <h3 className={styles.cardTitle}><MessageIcon size={18} />{t("s03.conversation.title")}</h3>
      {messages === undefined ? null : messages === null ? (
        <p className={styles.muted}>{t("staff.loading")}</p>
      ) : messages.length === 0 ? (
        <p className={styles.muted}>{t("s03.conversation.noMessages")}</p>
      ) : (
        <ol className={styles.thread}>
          {messages.map((m) => (
            <li key={m.id} data-author={m.author === "reviewer" ? "reviewer" : m.author === "system" ? "system" : "reporter"}>
              <p className={styles.msgHead}>
                <span>{m.author_label}</span>
                <span className="eg-tnum">{formatWatDateTime(m.created_at, locale)}</span>
              </p>
              {m.kind === "formal_question" ? <p className={styles.formal}>{t("s03.conversation.formal")}</p> : null}
              <p className={styles.msgBody}>{m.body}</p>
            </li>
          ))}
        </ol>
      )}
      {onSend ? (
        <form
          className={styles.stack}
          onSubmit={(e) => {
            e.preventDefault();
            if (!body.trim()) return;
            onSend(body.trim());
            setBody("");
          }}
        >
          <TextArea
            id="s03-message"
            label={t("s03.conversation.label")}
            maxLength={TEXT_MAX}
            rows={2}
            value={body}
            onChange={(e) => setBody(e.target.value)}
          />
          <div>
            <Button type="submit" variant="secondary" disabled={!body.trim()} loading={busy} data-testid="s03-send">
              {t("s03.conversation.send")}
            </Button>
          </div>
        </form>
      ) : null}
    </div>
  );
}
