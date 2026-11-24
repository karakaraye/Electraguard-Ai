"use client";

/* C-01 Citizen receipt and P-01 Check a report. Views only: fixture-renderable props. */

import type { Outcome, ReportStatus as ServerStatus } from "../../../../lib/api/types";
import { useLocale, useT } from "../../../../lib/i18n/client";
import { AppShell, Banner, Button, Field, ReceiptCard, Sheet, StatusBadge, TextArea, UploadItem, UploadList } from "../../../../ui";
import { AppBarTitle } from "../_components/AppBarTitle";
import { OUTCOME_KEY, SERVER_BADGE } from "../_lib/status";
import type { ReceiptItem } from "./ReceiptView";
import styles from "../_components/observer.module.css";
import s from "../_components/screens.module.css";

/* ---------- C-01 Citizen receipt ---------- */

export type CitizenReceiptViewProps = {
  offline: boolean;
  code: string;
  receivedAt: string;
  justSent: boolean;
  keep: boolean;
  onKeep: (keep: boolean) => void;
  shortCode: string;
  shortCodeIsTest: boolean;
  items: ReceiptItem[];
  onRetry: (id: string) => void;
  onCheckStatus: () => void;
  onAnother: () => void;
  onBack: () => void;
};

export function CitizenReceiptView(props: CitizenReceiptViewProps) {
  const t = useT();
  const pending = props.items.some((item) => item.state !== "saved");
  const shortCode = props.shortCodeIsTest ? `${props.shortCode} (${t("c01.testNumber")})` : props.shortCode;
  return (
    <AppShell
      title={<AppBarTitle />}
      onBack={props.onBack}
      offline={props.offline}
      actions={
        <>
          <Button variant="quiet" block onClick={props.onAnother} data-testid="c01-another">
            {t("c01.another")}
          </Button>
          <Button block onClick={props.onCheckStatus} data-testid="c01-check">
            {t("c01.checkStatus")}
          </Button>
        </>
      }
      data-testid="c01"
    >
      <div className={`${styles.screen} ${styles.wide}`}>
        <h1 className={styles.title}>{t("c01.title")}</h1>
        <div className={styles.receipt}>
          <div className={styles.receiptSide}>
            <ReceiptCard code={props.code} receivedAt={props.receivedAt} animate={props.justSent} />
            <p className={styles.strong} style={{ margin: 0 }}>
              {t("c01.writeDown")}
            </p>
            <label className={styles.switch} data-testid="c01-keep">
              <input type="checkbox" role="switch" checked={props.keep} onChange={(event) => props.onKeep(event.target.checked)} />
              <span>{t("c01.keepOnPhone")}</span>
              <span className={styles.switchHint}>{t("c01.keepOnPhoneHint")}</span>
            </label>
          </div>
          <div className={styles.receiptSide}>
            <section className={styles.tight} aria-labelledby="c01-next">
              <h2 className={styles.sectionTitle} id="c01-next">
                {t("c01.next.title")}
              </h2>
              <ol className={styles.steps}>
                <li>{t("c01.next.line1")}</li>
                <li>{t("c01.next.line2")}</li>
                <li>{t("c01.next.line3")}</li>
              </ol>
              <p className={`${styles.meta} eg-tnum`} data-testid="c01-sms">
                {t("c01.sms", { code: props.code, shortCode })}
              </p>
            </section>
            {props.items.length ? (
              <section className={styles.tight} aria-labelledby="c01-attachments">
                <h2 className={styles.sectionTitle} id="c01-attachments">
                  {t("o12.attachments")}
                </h2>
                <UploadList label={t("o12.attachments")}>
                  {props.items.map((item) => (
                    <UploadItem
                      key={item.id}
                      kind={item.kind === "audio" ? "voice" : item.kind}
                      name={item.name}
                      sizeBytes={item.sizeBytes}
                      state={item.state}
                      progress={item.progress}
                      reason={item.reasonKey ? t(item.reasonKey, item.reasonVars) : undefined}
                      onRetry={item.state === "failed" && !item.reasonKey ? () => props.onRetry(item.id) : undefined}
                    />
                  ))}
                </UploadList>
                {pending ? <p className={styles.note}>{t("o12.keepOpen")}</p> : null}
              </section>
            ) : null}
            <p className={styles.meta}>{t("c01.citizenLabel")}</p>
          </div>
        </div>
      </div>
    </AppShell>
  );
}

/* ---------- P-01 Check a report ---------- */

export type StatusResult = {
  receipt_code: string;
  status: ServerStatus;
  outcome: Outcome | null;
  has_open_question: boolean;
  received_on: string;
  updated_on: string;
};

export type StatusError = null | "format" | "not_found" | "too_many" | "offline" | "server";

export type StatusViewProps = {
  offline: boolean;
  code: string;
  onCode: (code: string) => void;
  onCheck: () => void;
  checking: boolean;
  error: StatusError;
  retryMinutes: number;
  saved: string[];
  onCheckSaved: (code: string) => void;
  onRemoveSaved: (code: string) => void;
  result: StatusResult | null;
  /** This phone holds the receipt secret for the result. */
  hasSecret: boolean;
  question: { id: string; body: string } | null;
  reply: string;
  onReply: (text: string) => void;
  replyState: null | "sending" | "sent";
  replyError: string | null;
  onSendReply: () => void;
  withdraw: null | "confirm" | "sending" | "error";
  onWithdraw: () => void;
  onConfirmWithdraw: () => void;
  onCancelWithdraw: () => void;
  banner: string | null;
  shortCode: string;
  onBack: () => void;
};

const EXPLAIN: Record<ServerStatus, string> = {
  received: "p01.explain.received",
  in_review: "p01.explain.inReview",
  question: "p01.explain.question",
  closed: "p01.explain.closed",
  withdrawn: "p01.explain.withdrawn",
};

/** Dates only (REP-06 withholds times on purpose). */
function day(value: string, locale: string) {
  try {
    return new Intl.DateTimeFormat(locale === "en" ? "en-NG" : locale, { dateStyle: "medium", timeZone: "Africa/Lagos" }).format(new Date(`${value}T12:00:00+01:00`));
  } catch {
    return value;
  }
}

export function StatusView(props: StatusViewProps) {
  const t = useT();
  const { locale } = useLocale();
  const { result, error } = props;
  const errorText =
    error === "format"
      ? t("p01.formatError")
      : error === "not_found"
        ? t("p01.notFound")
        : error === "too_many"
          ? t("p01.tooMany", { minutes: props.retryMinutes })
          : error === "offline"
            ? t("p01.offline")
            : error === "server"
              ? t("common.error.server")
              : undefined;

  return (
    <AppShell title={t("p01.title")} onBack={props.onBack} offline={props.offline} banner={props.banner ? <Banner tone="attn" title={t(props.banner)} /> : undefined} data-testid="p01">
      <div className={`${styles.screen} ${styles.wide}`}>
        <h1 className={styles.title}>{t("p01.title")}</h1>
        <div className={s.twoCol}>
          <div className={styles.stack}>
            <form
              className={styles.stack}
              noValidate
              onSubmit={(event) => {
                event.preventDefault();
                props.onCheck();
              }}
            >
              <Field
                className={s.codeInput}
                label={t("p01.label")}
                hint={t("p01.hint")}
                value={props.code}
                onChange={(event) => props.onCode(event.target.value)}
                autoCapitalize="characters"
                autoComplete="off"
                spellCheck={false}
                maxLength={16}
                error={errorText}
                data-testid="p01-code"
              />
              <Button type="submit" block disabled={props.offline} loading={props.checking} loadingLabel={t("p01.checking")} data-testid="p01-check">
                {t("p01.check")}
              </Button>
            </form>
            {props.saved.length ? (
              <section className={styles.tight} aria-labelledby="p01-saved">
                <h2 className={styles.sectionTitle} id="p01-saved">
                  {t("p01.savedCodes")}
                </h2>
                <ul className={s.savedCodes}>
                  {props.saved.map((code) => (
                    <li key={code} className={s.savedCode}>
                      <Button variant="quiet" disabled={props.offline} onClick={() => props.onCheckSaved(code)} aria-label={t("p01.checkCode", { code })} data-testid="p01-saved">
                        <span className="eg-tnum">{code}</span>
                      </Button>
                      <Button variant="quiet" onClick={() => props.onRemoveSaved(code)} aria-label={`${t("p01.removeCode")}: ${code}`}>
                        {t("p01.removeCode")}
                      </Button>
                    </li>
                  ))}
                </ul>
              </section>
            ) : null}
          </div>

          <div aria-live="polite">
            {result ? (
              <section className={s.result} aria-labelledby="p01-result" data-testid="p01-result">
                <h2 id="p01-result" tabIndex={-1}>
                  {t("p01.result.status")} · <span className="eg-tnum">{result.receipt_code}</span>
                </h2>
                <div>
                  <StatusBadge status={result.has_open_question ? "question" : SERVER_BADGE[result.status]} size="lg" />
                </div>
                <p className={styles.lead} style={{ margin: 0 }}>
                  {result.outcome ? `${t(OUTCOME_KEY[result.outcome])}. ` : ""}
                  {t(EXPLAIN[result.has_open_question ? "question" : result.status])}
                </p>
                <p className={styles.meta}>
                  {t("p01.result.received", { time: day(result.received_on, locale) })}
                  <br />
                  {t("p01.result.updated", { time: day(result.updated_on, locale) })}
                </p>
                {result.has_open_question && props.replyState !== "sent" ? (
                  props.hasSecret && props.question ? (
                    <div className={s.question} data-testid="p01-question">
                      <h3 className={s.questionHead}>{t("p01.question.title")}</h3>
                      <p className={s.questionBody}>{props.question.body}</p>
                      <TextArea label={t("p01.question.replyLabel")} value={props.reply} onChange={(event) => props.onReply(event.target.value)} maxLength={2000} rows={4} error={props.replyError ?? undefined} data-testid="p01-reply" />
                      <Button block disabled={props.offline} loading={props.replyState === "sending"} onClick={props.onSendReply} data-testid="p01-reply-send">
                        {t("p01.question.send")}
                      </Button>
                    </div>
                  ) : !props.hasSecret ? (
                    <p className={styles.note} data-testid="p01-need-secret">
                      {t("p01.question.needSecret")}
                    </p>
                  ) : null
                ) : null}
                {props.replyState === "sent" ? (
                  <p className={styles.tag} role="status">
                    {t("p01.question.sent")}
                  </p>
                ) : null}
                {props.hasSecret && result.status === "received" && !result.has_open_question ? (
                  <div>
                    <Button variant="secondary" className={s.dangerOutline} onClick={props.onWithdraw} data-testid="p01-withdraw">
                      {t("o14.withdraw.button")}
                    </Button>
                  </div>
                ) : null}
              </section>
            ) : null}
          </div>
        </div>
        <p className={styles.meta}>{t("p01.sms", { shortCode: props.shortCode })}</p>
      </div>

      <Sheet
        open={props.withdraw !== null}
        onClose={props.onCancelWithdraw}
        title={t("o14.withdraw.title")}
        description={t("o14.withdraw.body")}
        footer={
          <>
            <Button variant="secondary" block autoFocus onClick={props.onCancelWithdraw}>
              {t("o14.withdraw.keep")}
            </Button>
            <Button variant="danger" block disabled={props.offline} loading={props.withdraw === "sending"} onClick={props.onConfirmWithdraw} data-testid="p01-withdraw-confirm">
              {t("o14.withdraw.confirm")}
            </Button>
          </>
        }
      >
        {props.offline ? <Banner tone="wait" title={t("o14.withdraw.offline")} /> : null}
        {props.withdraw === "error" ? <Banner tone="danger" title={t("common.error.server")} /> : null}
      </Sheet>
    </AppShell>
  );
}

