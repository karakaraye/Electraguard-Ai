"use client";
import { BackgroundArt } from "../../../../ui/BackgroundArt/BackgroundArt";

/* O-12 Report received, and the honest state of a report that is still on the phone. */

import type { ReactNode } from "react";
import type { Category } from "../../../../lib/api/types";
import { useLocale, useT } from "../../../../lib/i18n/client";
import type { ReportViewState } from "../../../../lib/outbox";
import { AppShell, Banner, Button, ButtonLink, ReceiptCard, StatusBadge, SunRings, UploadItem, UploadList, type ReportStatus, type UploadState } from "../../../../ui";
import { formatWatDateTime } from "../../../../ui/format";
import { categoryPictograms, PlaceIcon, ClockIcon } from "../../../../ui/icons";
import styles from "../_components/observer.module.css";
import { categoryMeta } from "../_lib/categories";

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
  return (
    <AppShell
      title={t("ui.nav.receipt")}
      done={{ label: t("common.done"), onClick: onHome }}
      offline={offline}
      actions={
        onView ? (
          <Button block onClick={onView} data-testid="o12-view">
            {t("o12.viewReport")}
          </Button>
        ) : (
          <Button block onClick={onHome} data-testid="o12-home">
            {t("o12.home")}
          </Button>
        )
      }
      data-testid="o12"
    >
      <BackgroundArt variant="soft" />
      <div className={`${styles.screen} ${styles.wide}`}>
        <div className={styles.receivedHead}>
          <SunRings size={152} ripple={justSent}>
            <span className={styles.receivedDisc} data-draw={justSent || undefined}>
              <svg viewBox="0 0 24 24" width="40" height="40" aria-hidden="true">
                <path d="m5 12.5 4.5 4.5L19 7.5" pathLength={1} />
              </svg>
            </span>
          </SunRings>
          <h1 className={styles.title}>{t("o12.title")}</h1>
        </div>
        <div className={styles.receipt}>
          <div className={styles.receiptSide}>
            <ReceiptCard code={code} receivedAt={receivedAt} animate={justSent} />
          </div>
          {items.length ? (
            <section className={styles.receiptSide} aria-labelledby="o12-attachments">
              <h2 className={styles.sectionTitle} id="o12-attachments">
                {t("o12.attachments")}
              </h2>
              {removeBlocked ? <Banner tone="attn" title={t("o12.upload.cannotRemove")} /> : null}
              <UploadList label={t("o12.attachments")}>
                {items.map((item) => (
                  <UploadItem
                    key={item.id}
                    kind={item.kind === "audio" ? "voice" : item.kind}
                    name={item.name}
                    sizeBytes={item.sizeBytes}
                    state={item.state}
                    reason={item.reasonKey ? t(item.reasonKey, item.reasonVars) : undefined}
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
        <section className={styles.nextSteps} aria-labelledby="o12-next">
          <h2 className={styles.sectionTitle} id="o12-next">
            {t("ui.receipt.next")}
          </h2>
          <ol className={styles.steps}>
            <li>{t("o12.next.line1")}</li>
            <li>{t(citizen ? "o12.citizen.keep" : "o12.next.line2")}</li>
            <li>{t("o12.next.line3")}</li>
          </ol>
        </section>
        <Button variant="quiet" className={styles.another} onClick={onAnother} data-testid="o12-another">
          {t("o12.another")}
        </Button>
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
  /** What the report is about, so the screen says which report this is. */
  category?: Category | null;
  place?: string | null;
  occurredAt?: string | null;
  offline: boolean;
  onHome: () => void;
  action?: ReactNode;
};

export function PendingView({ state, category, place, occurredAt, offline, onHome, action }: PendingViewProps) {
  const t = useT();
  const { locale } = useLocale();
  const badge = STATE_BADGE[state];
  const statusKey = state === "not_confirmed" ? "notConfirmed" : state === "needs_attention" ? "needsAttention" : state === "waiting_code" ? "waitingCode" : state === "withdrawn" ? "withdrawn" : state === "sending" ? "sending" : "onPhone";
  const meta = category ? categoryMeta(category) : null;
  const Pictogram = meta ? categoryPictograms[meta.pictogram] : null;
  return (
    <AppShell
      title={t("ui.nav.receipt")}
      done={{ label: t("common.done"), onClick: onHome }}
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
            {meta && Pictogram ? (
              <>
                <h1 className={`${styles.title} ${styles.valueRow}`} data-testid="pending-title">
                  <Pictogram size={32} aria-hidden="true" />
                  <span>{t(`o05.tile.${meta.tile}`)}</span>
                </h1>
                <p className={styles.meta}>
                  {place ? (
                    <span className={styles.valueRow}>
                      <PlaceIcon size={18} aria-hidden="true" />
                      {place}
                    </span>
                  ) : null}
                  {occurredAt ? (
                    <span className={`${styles.valueRow} eg-tnum`}>
                      <ClockIcon size={18} aria-hidden="true" />
                      {formatWatDateTime(occurredAt, locale)}
                    </span>
                  ) : null}
                </p>
                <div>
                  <StatusBadge status={badge} size="lg" />
                </div>
              </>
            ) : (
              <>
                <h1 className={styles.title}>{t(`common.status.${statusKey}`)}</h1>
              </>
            )}
            <p className={styles.lead}>{t(STATE_HINT[state] ?? "common.status.onPhoneHint")}</p>
            {state !== "withdrawn" ? <p className={`${styles.strong} ${styles.noCode}`} data-testid="pending-no-code">{t("o12.pending.noCode")}</p> : null}
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
