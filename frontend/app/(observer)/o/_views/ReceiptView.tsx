"use client";

/* O-12 Report received, and the honest state of a report that is still on the phone. */

import type { ReactNode } from "react";
import { useT } from "../../../../lib/i18n/client";
import type { ReportViewState } from "../../../../lib/outbox";
import { AppShell, Banner, Button, ButtonLink, ReceiptCard, StatusBadge, UploadItem, UploadList, type ReportStatus, type UploadState } from "../../../../ui";
import { AppBarTitle } from "../_components/AppBarTitle";
import styles from "../_components/observer.module.css";

export type ReceiptItem = {
  id: string;
  kind: "photo" | "video" | "audio";
  name: string;
  sizeBytes: number;
  state: UploadState;
  progress: number;
  /** Why the server refused it, as a message key. */
  reasonKey?: string;
  reasonVars?: Record<string, string | number>;
  removable: boolean;
};

export type ReceiptViewProps = {
  code: string;
  receivedAt: string;
  /** Draw the tick once (only right after the server confirmed). */
  justSent: boolean;
  citizen: boolean;
  items: ReceiptItem[];
  removeBlocked: boolean;
  offline: boolean;
  onRetry: (id: string) => void;
  onRemove: (id: string) => void;
  onChooseAgain: (id: string) => void;
  onView?: () => void;
  onAnother: () => void;
  onHome: () => void;
};

export function ReceiptView({ code, receivedAt, justSent, citizen, items, removeBlocked, offline, onRetry, onRemove, onChooseAgain, onView, onAnother, onHome }: ReceiptViewProps) {
  const t = useT();
  const pending = items.some((item) => item.state !== "saved");
  const reasons = items.filter((item) => item.reasonKey);
  return (
    <AppShell
      title={<AppBarTitle />}
      onBack={onHome}
      offline={offline}
      actions={
        <>
          <Button variant="quiet" block onClick={onAnother} data-testid="o12-another">
            {t("o12.another")}
          </Button>
          {onView ? (
            <>
              <Button variant="quiet" block onClick={onHome} data-testid="o12-home">
                {t("o12.home")}
              </Button>
              <Button block onClick={onView} data-testid="o12-view">
                {t("o12.viewReport")}
              </Button>
            </>
          ) : (
            <Button block onClick={onHome} data-testid="o12-home">
              {t("o12.home")}
            </Button>
          )}
        </>
      }
      data-testid="o12"
    >
      <div className={`${styles.screen} ${styles.wide}`}>
        <h1 className={styles.title}>{t("o12.title")}</h1>
        <div className={styles.receipt}>
          <div className={styles.receiptSide}>
            <ReceiptCard
              code={code}
              receivedAt={receivedAt}
              animate={justSent}
              next={[t("o12.next.line1"), t(citizen ? "o12.citizen.keep" : "o12.next.line2"), t("o12.next.line3")]}
            />
          </div>
          {items.length ? (
            <section className={styles.receiptSide} aria-labelledby="o12-attachments">
              <h2 className={styles.sectionTitle} id="o12-attachments">
                {t("o12.attachments")}
              </h2>
              {reasons.map((item) => (
                <Banner key={item.id} tone="attn" title={`${item.name}: ${t(item.reasonKey!, item.reasonVars)}`} />
              ))}
              {removeBlocked ? <Banner tone="attn" title={t("o12.upload.cannotRemove")} /> : null}
              <UploadList label={t("o12.attachments")}>
                {items.map((item) => (
                  <UploadItem
                    key={item.id}
                    kind={item.kind === "audio" ? "voice" : item.kind}
                    name={item.name}
                    sizeBytes={item.sizeBytes}
                    state={item.state}
                    progress={item.progress}
                    onRetry={item.state === "failed" && !item.reasonKey ? () => onRetry(item.id) : undefined}
                    onChooseAgain={item.state === "missing" ? () => onChooseAgain(item.id) : undefined}
                    onRemove={item.removable ? () => onRemove(item.id) : undefined}
                    data-testid="o12-upload"
                  />
                ))}
              </UploadList>
              {pending ? <p className={styles.note}>{t("o12.keepOpen")}</p> : null}
              <p className="eg-sr-only" role="status" aria-live="polite">
                {!pending ? t("o12.upload.saved") : ""}
              </p>
            </section>
          ) : null}
        </div>
      </div>
    </AppShell>
  );
}

/* ---------- A report that is not received yet (from Home) ---------- */

const STATE_BADGE: Partial<Record<ReportViewState, ReportStatus>> = {
  on_phone: "on-phone",
  sending: "sending",
  not_confirmed: "not-confirmed",
  needs_attention: "needs-attention",
  waiting_code: "waiting-code",
  withdrawn: "withdrawn",
};

const STATE_HINT: Partial<Record<ReportViewState, string>> = {
  on_phone: "common.status.onPhoneHint",
  sending: "common.status.notConfirmedHint",
  not_confirmed: "common.status.notConfirmedHint",
  needs_attention: "common.status.needsAttentionHint",
  waiting_code: "o03.revoked.unsentHint",
  withdrawn: "o11.withdrawn",
};

export type PendingViewProps = {
  state: ReportViewState;
  offline: boolean;
  onHome: () => void;
  action?: ReactNode;
};

export function PendingView({ state, offline, onHome, action }: PendingViewProps) {
  const t = useT();
  const badge = STATE_BADGE[state];
  return (
    <AppShell
      title={<AppBarTitle />}
      onBack={onHome}
      offline={offline}
      actions={
        action ?? (
          <ButtonLink href="/o" block data-testid="pending-home">
            {t("common.home")}
          </ButtonLink>
        )
      }
      data-testid="o12-pending"
    >
      <div className={styles.screen}>
        {badge ? (
          <>
            <h1 className={styles.title}>{t(badge === "on-phone" ? "common.status.onPhone" : `common.status.${state === "not_confirmed" ? "notConfirmed" : state === "needs_attention" ? "needsAttention" : state === "waiting_code" ? "waitingCode" : state === "withdrawn" ? "withdrawn" : "sending"}`)}</h1>
            <StatusBadge status={badge} size="lg" />
            <p className={styles.lead}>{t(STATE_HINT[state] ?? "common.status.onPhoneHint")}</p>
          </>
        ) : (
          <>
            <h1 className={styles.title}>{t("common.error.notFound")}</h1>
          </>
        )}
      </div>
    </AppShell>
  );
}
