"use client";

/**
 * S-05 Check-ins tab (operations room): write a ward or LGA check-in, see the content check read it,
 * approve a safety notice written by someone else, and read the answers per ward.
 * A view only: every call is a prop, so the development viewer can render it from fixtures.
 */

import Link from "next/link";
import { useId, useRef, useState } from "react";
import type { CoordinatorNotice, NoticeQuestion, NoticeResultsResponse, NoticeStatus, NoticeType } from "../../../../lib/api/types";
import { useLocale, useT } from "../../../../lib/i18n/client";
import {
  DEFAULT_EXPIRY,
  knownReasons,
  localCheck,
  NOTICE_EXPIRY,
  NOTICE_MAX,
  NOTICE_TYPES,
  noticeTitle,
  questionText,
  REASON_KEY,
  segments,
  type BlockReason,
} from "../../../../lib/notices";
import { Banner, Button, SegmentedControl, Select, Skeleton, StatusBadge, Tag, TextArea, useNow, type StatusTone } from "../../../../ui";
import { formatWatTime } from "../../../../ui/format";
import { AlertIcon } from "../../../../ui/icons";
import styles from "./CheckinsView.module.css";

export type Section<T> = { data: T | null; loading: boolean; error: string | null };

export type PlaceOption = { value: string; label: string };
export type Places = {
  lgas: PlaceOption[];
  wards: PlaceOption[];
  /** Code to name for wards, LGAs and polling units, so results read as names. */
  names: Record<string, string>;
};

export type ComposeValues = {
  scopeKind: "ward" | "lga";
  scopeCode: string;
  type: NoticeType;
  mode: "question" | "message";
  questionId: string;
  text: string;
  minutes: number;
};

export interface CheckinsViewProps {
  places: Places;
  questions: NoticeQuestion[];
  notices: Section<CoordinatorNotice[]>;
  selectedId: string | null;
  onSelect?: (id: string) => void;
  results: Section<NoticeResultsResponse>;
  /** The signed-in coordinator's name, to stop them approving their own notice. */
  currentUser: string;
  /** Reasons the server gave for the last refused send (names and party terms are only known there). */
  serverReasons?: string[];
  composeError?: string | null;
  message?: string | null;
  actionError?: string | null;
  now?: number;
  onSend?: (values: ComposeValues) => Promise<boolean> | boolean | void;
  onTextChange?: () => void;
  onApprove?: (id: string) => Promise<boolean> | boolean | void;
  onReject?: (id: string, note: string) => Promise<boolean> | boolean | void;
  onAskAgain?: (notice: CoordinatorNotice) => Promise<boolean> | boolean | void;
  "data-testid"?: string;
}

const STATUS_TONE: Record<NoticeStatus, StatusTone> = { sent: "ok", pending_approval: "attn", expired: "wait", withdrawn: "wait" };
const STATUS_KEY: Record<NoticeStatus, string> = {
  sent: "notice.status.sent",
  pending_approval: "notice.status.pending",
  expired: "notice.status.expired",
  withdrawn: "notice.status.withdrawn",
};
const REJECT_NOTE_MAX = 500;

/** How many units answered and how many were asked, summed over the wards in the results. */
export function totals(results: NoticeResultsResponse | null) {
  let yes = 0;
  let no = 0;
  let notSeen = 0;
  let missing = 0;
  for (const ward of Object.values(results?.wards ?? {})) {
    yes += ward.yes;
    no += ward.no;
    notSeen += ward.not_seen;
    missing += ward.unanswered_units.length;
  }
  const answered = yes + no + notSeen;
  return { yes, no, notSeen, answered, total: answered + missing };
}

export function CheckinsView(props: CheckinsViewProps) {
  const clock = useNow();
  const now = props.now ?? clock ?? 0;
  const { notices, selectedId, results, places, onSelect } = props;
  const t = useT();
  const { locale } = useLocale();
  const list = notices.data ?? [];
  const selected = list.find((item) => item.id === selectedId) ?? null;

  return (
    <div className={styles.layout} data-testid={props["data-testid"] ?? "checkins-view"}>
      <Compose {...props} />

      <div className={styles.right}>
        {props.message ? <Banner tone="ok" title={props.message} data-testid="ci-notice" /> : null}
        <section className={styles.card} aria-labelledby="ci-list">
          <h2 id="ci-list" className={styles.cardTitle}>{t("notice.list.title")}</h2>
          {notices.error ? (
            <p className={styles.error} role="alert">{notices.error}</p>
          ) : notices.loading && !notices.data ? (
            <Skeleton lines={3} height={56} delay={0} />
          ) : list.length === 0 ? (
            <p className={styles.muted} data-testid="ci-empty">{t("notice.list.empty")}</p>
          ) : (
            <ul className={styles.list}>
              {list.map((item) => {
                const expired = item.status === "sent" && Date.parse(item.expires_at) <= now;
                const status: NoticeStatus = expired ? "expired" : item.status;
                return (
                  <li key={item.id}>
                    <button
                      type="button"
                      className={styles.item}
                      data-selected={item.id === selectedId || undefined}
                      aria-current={item.id === selectedId ? "true" : undefined}
                      onClick={() => onSelect?.(item.id)}
                      data-testid={`ci-item-${item.id}`}
                    >
                      <span className={styles.itemTitle}>{noticeTitle(item, locale)}</span>
                      <span className={styles.itemStatus}>
                        <StatusBadge tone={STATUS_TONE[status]} label={t(STATUS_KEY[status])} />
                      </span>
                      <span className={styles.itemMeta}>
                        {item.type === "safety" ? <StatusBadge tone="danger" label={t("notice.type.safety")} /> : <Tag>{t(`notice.type.${item.type}`)}</Tag>}
                        <span>{places.names[item.scope.code] ?? item.scope.code}</span>
                        <span className="eg-tnum">{t("notice.list.sent", { time: formatWatTime(item.created_at, locale), name: item.created_by })}</span>
                        <span className="eg-tnum">{t("notice.list.expires", { time: formatWatTime(item.expires_at, locale) })}</span>
                      </span>
                    </button>
                  </li>
                );
              })}
            </ul>
          )}
          <p className={styles.muted}>{t("notice.list.fixedNote")}</p>
        </section>

        {selected ? (
          selected.status === "pending_approval" ? (
            <Approval {...props} notice={selected} />
          ) : (
            <Results {...props} notice={selected} results={results} now={now} />
          )
        ) : null}
      </div>
    </div>
  );
}

/* ---------- Compose ---------- */

function Compose({ places, questions, serverReasons = [], composeError, onSend, onTextChange }: CheckinsViewProps) {
  const t = useT();
  const { locale } = useLocale();
  const id = useId();
  const [scopeKind, setScopeKind] = useState<"ward" | "lga">("ward");
  const [scopeCode, setScopeCode] = useState("");
  const [type, setType] = useState<NoticeType>("logistics");
  const [mode, setMode] = useState<"question" | "message">("question");
  const [questionId, setQuestionId] = useState("");
  const [text, setText] = useState("");
  const [minutes, setMinutes] = useState(DEFAULT_EXPIRY);
  const [pending, setPending] = useState(false);
  const field = useRef<HTMLTextAreaElement>(null);
  const backdrop = useRef<HTMLDivElement>(null);

  const options = scopeKind === "ward" ? places.wards : places.lgas;
  const question = questions.find((q) => q.id === questionId) ?? null;
  const body = mode === "question" ? (question ? questionText(question, "en") : "") : text.trim();
  const check = mode === "message" ? localCheck(text) : { reasons: [] as BlockReason[], marks: [] };
  const reasons = mode === "message" ? [...new Set<BlockReason>([...check.reasons, ...knownReasons(serverReasons)])] : [];
  const ready = Boolean(scopeCode && body && body.length <= NOTICE_MAX && reasons.length === 0);

  async function submit(event: React.FormEvent) {
    event.preventDefault();
    if (!ready || pending) return;
    setPending(true);
    const ok = await onSend?.({ scopeKind, scopeCode, type, mode, questionId, text: body, minutes });
    setPending(false);
    if (ok !== false) {
      setText("");
      setQuestionId("");
    }
  }

  return (
    <form className={styles.card} onSubmit={(e) => void submit(e)} aria-labelledby={`${id}-title`} noValidate data-testid="ci-compose">
      <h2 id={`${id}-title`} className={styles.cardTitle}>{t("notice.new.title")}</h2>
      {composeError ? <Banner tone="danger" title={composeError} critical data-testid="ci-compose-error" /> : null}

      <div className={styles.group}>
        <span className={styles.groupLabel}>{t("notice.new.sendTo")}</span>
        <div className={styles.sendTo}>
          <SegmentedControl
            label={t("notice.new.sendTo")}
            value={scopeKind}
            onChange={(value) => {
              setScopeKind(value as "ward" | "lga");
              setScopeCode("");
            }}
            options={[
              { value: "ward", label: t("notice.scope.ward") },
              { value: "lga", label: t("notice.scope.lga") },
            ]}
            data-testid="ci-scope-kind"
          />
          <Select
            label={<span className="eg-sr-only">{scopeKind === "ward" ? t("notice.scope.ward") : t("notice.scope.lga")}</span>}
            value={scopeCode}
            onChange={(event) => setScopeCode(event.target.value)}
            options={options}
            placeholder={t("notice.new.chooseArea")}
            data-testid="ci-scope-code"
          />
        </div>
      </div>

      <div className={styles.group}>
        <span className={styles.groupLabel}>{t("notice.new.kind")}</span>
        <SegmentedControl
          label={t("notice.new.kind")}
          value={type}
          onChange={(value) => setType(value as NoticeType)}
          options={NOTICE_TYPES.map((value) => ({ value, label: t(`notice.type.${value}`) }))}
          data-testid="ci-type"
        />
        {type === "safety" ? <p className={styles.hint}>{t("notice.new.safetyHint")}</p> : null}
      </div>

      <div className={styles.group}>
        <span className={styles.groupLabel}>{t("notice.new.what")}</span>
        <SegmentedControl
          label={t("notice.new.what")}
          value={mode}
          onChange={(value) => setMode(value as "question" | "message")}
          options={[
            { value: "question", label: t("notice.new.fixed") },
            { value: "message", label: t("notice.new.write") },
          ]}
          data-testid="ci-mode"
        />
      </div>

      {mode === "question" ? (
        <Select
          label={t("notice.new.question")}
          value={questionId}
          onChange={(event) => setQuestionId(event.target.value)}
          options={questions.map((q) => ({ value: q.id, label: questionText(q, locale) }))}
          placeholder={t("notice.new.chooseQuestion")}
          hint={t("notice.new.questionHint")}
          data-testid="ci-question"
        />
      ) : (
        <div className={styles.group}>
          <label className={styles.groupLabel} htmlFor={`${id}-text`}>{t("notice.new.message")}</label>
          <div className={styles.editor} data-invalid={reasons.length > 0 || undefined}>
            <div ref={backdrop} className={styles.backdrop} aria-hidden="true" data-testid="ci-marked">
              {segments(text, check.marks).map((part, index) =>
                part.marked ? <mark key={index} className={styles.mark}>{part.text}</mark> : <span key={index}>{part.text}</span>,
              )}
              {"\n"}
            </div>
            <textarea
              ref={field}
              id={`${id}-text`}
              className={styles.textarea}
              rows={5}
              maxLength={NOTICE_MAX}
              value={text}
              aria-invalid={reasons.length > 0 || undefined}
              aria-describedby={reasons.length ? `${id}-reasons` : undefined}
              onChange={(event) => {
                setText(event.target.value);
                onTextChange?.();
              }}
              onScroll={(event) => {
                if (backdrop.current) backdrop.current.scrollTop = event.currentTarget.scrollTop;
              }}
              data-testid="ci-text"
            />
          </div>
          {reasons.length ? (
            <div className={styles.reasons} id={`${id}-reasons`} role="alert" data-testid="ci-reasons">
              <p className={styles.reasonsTitle}>{t("notice.check.blocked")}</p>
              <ul>
                {reasons.map((reason) => (
                  <li key={reason} data-testid={`ci-reason-${reason}`}>
                    <AlertIcon size={16} />
                    <span>{t(REASON_KEY[reason])}</span>
                  </li>
                ))}
              </ul>
            </div>
          ) : text.trim() ? (
            <p className={styles.hint} data-testid="ci-clear">{t("notice.check.clear")}</p>
          ) : (
            <p className={styles.hint}>{t("notice.check.what")}</p>
          )}
        </div>
      )}

      <div className={styles.foot}>
        <Select
          label={t("notice.new.expires")}
          value={String(minutes)}
          onChange={(event) => setMinutes(Number(event.target.value))}
          options={NOTICE_EXPIRY.map((o) => ({ value: String(o.minutes), label: t(o.key) }))}
          placeholder={false}
          className={styles.expires}
          data-testid="ci-expiry"
        />
        {mode === "message" ? <span className={`${styles.count} eg-tnum`}>{t("notice.new.count", { count: text.length, max: NOTICE_MAX })}</span> : null}
      </div>
      <Button type="submit" variant="primary" block disabled={!ready} loading={pending} data-testid="ci-send">
        {t("notice.new.send")}
      </Button>
    </form>
  );
}

/* ---------- Results ---------- */

function Results({ notice, results, places, onAskAgain, actionError, now }: CheckinsViewProps & { notice: CoordinatorNotice; now: number }) {
  const t = useT();
  const { locale } = useLocale();
  const [pending, setPending] = useState(false);
  const sum = totals(results.data);
  const wards = Object.entries(results.data?.wards ?? {});
  const noWards = wards.filter(([, ward]) => ward.no > 0).map(([code]) => places.names[code] ?? code);
  const scope = places.names[notice.scope.code] ?? notice.scope.code;
  const title = notice.scope.kind === "lga" ? t("notice.results.titleLga", { area: scope, answered: sum.answered, total: sum.total }) : t("notice.results.titleWard", { area: scope, answered: sum.answered, total: sum.total });
  const expired = notice.status === "expired" || Date.parse(notice.expires_at) <= now;

  return (
    <section className={styles.card} aria-labelledby="ci-results" data-testid="ci-results">
      <div className={styles.resultsHead}>
        <div>
          <p className={styles.crumb}>{noticeTitle(notice, locale)}</p>
          <h2 id="ci-results" className={`${styles.cardTitle} eg-tnum`}>{results.loading && !results.data ? scope : title}</h2>
        </div>
        <StatusBadge tone={STATUS_TONE[expired && notice.status === "sent" ? "expired" : notice.status]} label={t(STATUS_KEY[expired && notice.status === "sent" ? "expired" : notice.status])} />
      </div>
      <p className={`${styles.muted} eg-tnum`}>{t("notice.list.expires", { time: formatWatTime(notice.expires_at, locale) })}</p>

      {results.error ? (
        <p className={styles.error} role="alert">{results.error}</p>
      ) : results.loading && !results.data ? (
        <Skeleton lines={4} height={32} delay={0} />
      ) : wards.length === 0 ? (
        <p className={styles.muted}>{t("notice.results.none")}</p>
      ) : (
        <>
          <ul className={styles.legend} aria-hidden="true">
            <li data-k="yes">{t("notice.answer.yes")}</li>
            <li data-k="no">{t("notice.answer.no")}</li>
            <li data-k="notSeen">{t("notice.answer.not_seen")}</li>
            <li data-k="open">{t("notice.results.notAnswered")}</li>
          </ul>
          <div className={styles.tableWrap}>
            <table className={styles.table} data-testid="ci-results-table">
              <caption className="eg-sr-only">{title}</caption>
              <thead>
                <tr>
                  <th scope="col">{t("notice.results.ward")}</th>
                  <th scope="col">{t("notice.results.answers")}</th>
                  <th scope="col" className={styles.num}>{t("notice.answer.yes")}</th>
                  <th scope="col" className={styles.num}>{t("notice.answer.no")}</th>
                  <th scope="col" className={styles.num}>{t("notice.answer.not_seen")}</th>
                  <th scope="col">{t("notice.results.notAnswered")}</th>
                </tr>
              </thead>
              <tbody>
                {wards.map(([code, ward]) => {
                  const answered = ward.yes + ward.no + ward.not_seen;
                  const all = answered + ward.unanswered_units.length;
                  const pct = (n: number) => (all ? `${(n / all) * 100}%` : "0%");
                  return (
                    <tr key={code} data-testid={`ci-ward-${code}`}>
                      <th scope="row">{places.names[code] ?? code}</th>
                      <td>
                        <span
                          className={styles.stack}
                          role="img"
                          aria-label={t("notice.results.barLabel", { yes: ward.yes, no: ward.no, notSeen: ward.not_seen, open: ward.unanswered_units.length })}
                        >
                          <span data-k="yes" style={{ width: pct(ward.yes) }} />
                          <span data-k="no" style={{ width: pct(ward.no) }} />
                          <span data-k="notSeen" style={{ width: pct(ward.not_seen) }} />
                        </span>
                      </td>
                      <td className={`${styles.num} eg-tnum`}>{ward.yes}</td>
                      <td className={`${styles.num} eg-tnum`} data-no={ward.no > 0 || undefined}>{ward.no}</td>
                      <td className={`${styles.num} eg-tnum`}>{ward.not_seen}</td>
                      <td className={styles.open}>
                        {ward.unanswered_units.length === 0
                          ? t("notice.results.allAnswered")
                          : ward.unanswered_units.map((unit) => <span key={unit}>{places.names[unit] ?? unit}</span>)}
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
          {sum.no > 0 ? (
            <p className={styles.raise} data-testid="ci-raise">
              <AlertIcon size={16} />
              <span>{t("notice.results.raise", { wards: noWards.join(", ") })}</span>
              <Link href="/s/queue">{t("notice.results.openQueue")}</Link>
            </p>
          ) : null}
        </>
      )}

      {actionError ? <Banner tone="danger" title={actionError} critical /> : null}
      {notice.status === "sent" ? (
        <div className={styles.again}>
          <h3 className={styles.subTitle}>{t("notice.again.title")}</h3>
          <p className={styles.muted}>{t("notice.again.body", { area: scope })}</p>
          <Button
            variant="secondary"
            block
            loading={pending}
            onClick={async () => {
              setPending(true);
              await onAskAgain?.(notice);
              setPending(false);
            }}
            data-testid="ci-again"
          >
            {t("notice.again.button")}
          </Button>
        </div>
      ) : null}
    </section>
  );
}

/* ---------- Second approval of a safety notice ---------- */

function Approval({ notice, currentUser, places, onApprove, onReject, actionError }: CheckinsViewProps & { notice: CoordinatorNotice }) {
  const t = useT();
  const { locale } = useLocale();
  const [pending, setPending] = useState<"approve" | "reject" | null>(null);
  const [sendingBack, setSendingBack] = useState(false);
  const [note, setNote] = useState("");
  const mine = Boolean(currentUser) && notice.created_by.trim().toLowerCase() === currentUser.trim().toLowerCase();
  const scope = places.names[notice.scope.code] ?? notice.scope.code;

  return (
    <section className={`${styles.card} ${styles.approval}`} aria-labelledby="ci-approval" data-testid="ci-approval">
      <h2 id="ci-approval" className={styles.approvalTitle}>
        <span className={styles.diamond} aria-hidden="true" />
        {t("notice.approve.title")}
      </h2>
      <p className={styles.approvalText}>{notice.text}</p>
      <p className={`${styles.muted} eg-tnum`}>
        {t("notice.approve.meta", { area: scope, name: notice.created_by, time: formatWatTime(notice.created_at, locale), expires: formatWatTime(notice.expires_at, locale) })}
      </p>
      {actionError ? <Banner tone="danger" title={actionError} critical data-testid="ci-action-error" /> : null}
      {sendingBack ? (
        <div className={styles.group}>
          <TextArea
            id="ci-reject-note"
            label={t("notice.approve.noteLabel")}
            hint={t("notice.approve.noteHint")}
            maxLength={REJECT_NOTE_MAX}
            rows={3}
            value={note}
            onChange={(event) => setNote(event.target.value)}
            data-testid="ci-reject-note"
          />
          <div className={styles.row}>
            <Button variant="secondary" onClick={() => setSendingBack(false)}>{t("staff.cancel")}</Button>
            <Button
              variant="primary"
              disabled={!note.trim()}
              loading={pending === "reject"}
              onClick={async () => {
                setPending("reject");
                await onReject?.(notice.id, note.trim());
                setPending(null);
              }}
              data-testid="ci-reject-confirm"
            >
              {t("notice.approve.reject")}
            </Button>
          </div>
        </div>
      ) : (
        <div className={styles.row}>
          <Button
            variant="primary"
            disabled={mine || !onApprove}
            loading={pending === "approve"}
            onClick={async () => {
              setPending("approve");
              await onApprove?.(notice.id);
              setPending(null);
            }}
            data-testid="ci-approve"
          >
            {t("notice.approve.approve")}
          </Button>
          <Button variant="secondary" disabled={!onReject} onClick={() => setSendingBack(true)} data-testid="ci-reject">
            {t("notice.approve.reject")}
          </Button>
        </div>
      )}
      <p className={styles.muted} data-testid="ci-same-person">{mine ? t("notice.approve.mine") : t("notice.approve.rule")}</p>
    </section>
  );
}
