"use client";
import { BackgroundArt } from "../../../../ui/BackgroundArt/BackgroundArt";

/* O-04 Home */

import Link from "next/link";
import { useState, type ReactNode } from "react";
import { useLocale, useT } from "../../../../lib/i18n/client";
import type { Category } from "../../../../lib/api/types";
import { Banner, Button, ButtonLink, Count, HeroCard, OutboxBadge, ReportList, ReportRow, Sheet, StatusBadge, type ReportStatus } from "../../../../ui";
import { StatusShape } from "../../../../ui/StatusBadge/StatusBadge";
import { formatWatDateTime, formatWatTime } from "../../../../ui/format";
import { categoryPictograms, ChevronRightIcon } from "../../../../ui/icons";
import { ObserverShell } from "../_components/ObserverShell";
import styles from "../_components/observer.module.css";
import p3 from "../_components/p3.module.css";
import s from "../_components/screens.module.css";
import { categoryMeta } from "../_lib/categories";

export type HomeRow = {
  href: string;
  category: Category | null;
  place: string;
  at: string | number;
  reference?: string;
  status: ReportStatus;
};

export type HomeViewProps = {
  code: string;
  offline: boolean;
  networkBack: boolean;
  queuedCount: number;
  waitingCodeCount: number;
  intakePaused: boolean;
  unsentCount: number;
  needsAttentionCount: number;
  questionCount: number;
  /** Reports with unread reviewer messages (REP-02 counts). */
  unreadCount?: number;
  /** Discussions: null when the observer has none (the row is hidden, O-18), else invitations + unread posts. */
  discussions?: { count: number } | null;
  pinSaved: boolean;
  draftKept: boolean;
  draft: { category: Category | null; startedAt: number } | null;
  rows: HomeRow[];
  /** For previews and tests: the clock the day arc reads. Defaults to the real clock. */
  now?: Date;
  /** Today's checklist from this phone (O-15 per-day state): each stage sent, next or later. */
  checklist: { unitLabel: string | null; stages: Array<{ slug: string; state: "sent" | "next" | "later" }> };
  onReport: () => void;
  onContinue: () => void;
  onSendNow: () => void;
  onFix: () => void;
  onSendWaiting: () => void;
  onDeleteWaiting: () => void;
  /** Reports on this phone that are not received yet, oldest first (the outbox, D4). */
  outbox?: Array<{ id: string; category: Category | null; createdAt: number; status: ReportStatus; deletable: boolean }>;
  onDeleteQueued?: (id: string) => void;
};

export function HomeView(props: HomeViewProps) {
  const t = useT();
  const { locale } = useLocale();
  const [outboxOpen, setOutboxOpen] = useState(false);
  const [deleting, setDeleting] = useState<string | null>(null);
  const outbox = props.outbox ?? [];
  const {
    code,
    offline,
    networkBack,
    queuedCount,
    waitingCodeCount,
    intakePaused,
    unsentCount,
    needsAttentionCount,
    questionCount,
    pinSaved,
    draftKept,
    draft,
    rows,
  } = props;
  const DraftPictogram = draft ? categoryPictograms[categoryMeta(draft.category).pictogram] : null;

  /* Confirmations stay as short banners; everything that waits on the observer moves into one "Needs you" card. */
  const banners = (
    <div className={styles.tight}>
      {networkBack ? <Banner tone="ok" title={t("common.network.back")} data-testid="o04-network-back" /> : null}
      {pinSaved ? <Banner tone="ok" title={t("o03.setPin.done")} data-testid="o04-pin-saved" /> : null}
      {draftKept ? <Banner tone="ok" title={t("incident.draftKept")} data-testid="o04-draft-kept" /> : null}
    </div>
  );
  const hasBanner = networkBack || pinSaved || draftKept;
  const needs: Array<{ key: string; tone: "wait" | "attn"; testId: string; text: string; actions: ReactNode }> = [];
  if (waitingCodeCount > 0) {
    needs.push({
      key: "waiting",
      tone: "attn",
      testId: "o04-waiting-code",
      text: t("o04.waitingCode", { count: waitingCodeCount }),
      actions: (
        <>
          <Button variant="secondary" className={p3.smallBtn} onClick={props.onSendWaiting} data-testid="o04-send-waiting">
            {t("o04.sendWaiting")}
          </Button>
          <Button variant="quiet" className={p3.smallQuiet} onClick={props.onDeleteWaiting} data-testid="o04-delete-waiting">
            {t("o04.deleteWaiting")}
          </Button>
        </>
      ),
    });
  }
  if (unsentCount > 0) {
    needs.push({
      key: "unsent",
      tone: "wait",
      testId: "o04-unsent",
      text: t("o04.unsent", { count: unsentCount }),
      actions: (
        <Button variant="secondary" className={p3.smallBtn} disabled={offline} onClick={props.onSendNow} data-testid="o04-send-now">
          {t("o04.sendNow")}
        </Button>
      ),
    });
  }
  if (needsAttentionCount > 0) {
    needs.push({
      key: "attention",
      tone: "attn",
      testId: "o04-needs-attention",
      text: t("o04.needsAttention", { count: needsAttentionCount }),
      actions: (
        <Button variant="secondary" className={p3.smallBtn} onClick={props.onFix} data-testid="o04-fix">
          {t("o04.fix")}
        </Button>
      ),
    });
  }
  if (questionCount > 0) {
    needs.push({
      key: "question",
      tone: "attn",
      testId: "o04-question",
      text: t("o04.questionBanner", { count: questionCount }),
      actions: (
        <ButtonLink href="/o/messages" variant="secondary" className={p3.smallBtn} data-testid="o04-answer">
          {t("o04.answer")}
        </ButtonLink>
      ),
    });
  }

  return (
    <ObserverShell
      variant="home"
      tab="home"
      menuCode={code}
      menuUnit={props.checklist.unitLabel}
      counts={{ questions: questionCount, unread: props.unreadCount ?? 0 }}
      end={
        outbox.length ? (
          <OutboxBadge
            count={outbox.length}
            state={outbox.some((item) => item.status === "sending") ? "sending" : outbox.some((item) => item.status === "needs-attention") ? "failed" : "waiting"}
            onClick={() => setOutboxOpen(true)}
            label={t("o04.outboxLabel", { count: outbox.length })}
            data-testid="o04-outbox-badge"
          />
        ) : undefined
      }
      offline={offline}
      queuedCount={queuedCount}
      banner={hasBanner ? banners : undefined}
      strip={
        intakePaused ? (
          <p className={p3.pausedStrip} role="alert" data-testid="o04-intake-paused">
            <StatusShape tone="attn" size={16} />
            <span>{t("o04.intakePaused")}</span>
          </p>
        ) : undefined
      }
      data-testid="o04"
    >
      {rows.length === 0 ? <BackgroundArt variant="soft" clear="none" /> : null}
      <div className={p3.home}>
        <header className={styles.homeHead}>
          <h1 className={p3.greeting}>{t(`o04.greeting.${greetingFor(props.now ?? new Date())}`)}</h1>
          <p className={styles.meta} data-testid="o04-signed-in">
            {t("o04.signedInAs", { code })}
            {props.checklist.unitLabel ? `, ${props.checklist.unitLabel}` : ""}
          </p>
        </header>

        {needs.length ? (
          <section className={p3.needs} aria-labelledby="o04-needs">
            <h2 className={p3.needsHead} id="o04-needs">
              {t("o13.filter.needsYou")}
              <Count value={needs.length} tone="needs" data-testid="o04-needs-count" />
            </h2>
            <ul className={p3.needList}>
              {needs.map((need) => (
                <li key={need.key} className={p3.need} data-testid={need.testId}>
                  <span className={p3.needShape} data-tone={need.tone} aria-hidden="true">
                    <StatusShape tone={need.tone} size={16} />
                  </span>
                  <p className={p3.needText}>{need.text}</p>
                  <div className={p3.needActions}>{need.actions}</div>
                </li>
              ))}
            </ul>
          </section>
        ) : null}

        {/* Stays tappable when intake is paused: reports can still be written and wait on the phone. */}
        <HeroCard
          title={t("o04.report")}
          body={offline ? t("o04.heroOffline") : t("o04.heroBody")}
          paused={intakePaused}
          pausedText={t("o04.heroPaused")}
          onClick={props.onReport}
          data-testid="o04-report"
          footer={
            draft && DraftPictogram ? (
              <div className={p3.draftRow} data-testid="o04-draft">
                <button type="button" className={p3.draftBtn} onClick={props.onContinue} data-testid="o04-continue">
                  <span className={p3.draftText}>
                    <span className={p3.draftTitle}>{t("o04.continueDraft")}</span>
                    <span className={p3.draftMeta}>
                      {t(`o05.tile.${categoryMeta(draft.category).tile}`)}, {t("o04.draftSaved", { time: formatWatTime(draft.startedAt, locale) })}
                    </span>
                  </span>
                  <ChevronRightIcon aria-hidden="true" />
                </button>
              </div>
            ) : undefined
          }
        />

        <section aria-labelledby="o04-reports" className={p3.reports}>
          <div className={p3.sectionHead}>
            <h2 className={p3.sectionTitle} id="o04-reports">
              {t("o04.myReports")}
            </h2>
            {rows.length ? (
              <Link href="/o/reports" className={p3.seeAll} data-testid="o04-all-reports">
                {t("o04.allReports")}
              </Link>
            ) : null}
          </div>
          {rows.length ? (
            <ReportList label={t("o04.myReports")}>
              {rows.slice(0, 3).map((row) => {
                const meta = categoryMeta(row.category);
                return (
                  <ReportRow
                    key={row.href}
                    href={row.href}
                    category={meta.pictogram}
                    categoryLabel={t(`o05.tile.${meta.tile}`)}
                    place={row.place}
                    observedAt={row.at}
                    reference={row.reference}
                    status={row.status}
                    note={row.reference ? undefined : t("o14.notSentYet")}
                  />
                );
              })}
            </ReportList>
          ) : (
            <>
              <p className={styles.meta} data-testid="o04-no-reports">
                {t("o04.myReportsCount", { count: 0 })}
              </p>
              <p className={styles.purpose} data-testid="o04-purpose">
                {t("o04.purpose")}
              </p>
            </>
          )}
        </section>
      </div>

      <Sheet
        open={outboxOpen}
        onClose={() => {
          setOutboxOpen(false);
          setDeleting(null);
        }}
        title={deleting ? t("common.discard.title") : t("o04.outboxTitle")}
        description={<p style={{ margin: 0 }}>{deleting ? t("o14.deleteLocal.note") : t("o04.outboxOrder")}</p>}
        footer={
          deleting ? (
            <>
              <Button variant="secondary" block onClick={() => setDeleting(null)} data-testid="o04-outbox-keep">
                {t("common.discard.keep")}
              </Button>
              <Button
                variant="danger"
                block
                onClick={() => {
                  props.onDeleteQueued?.(deleting);
                  setDeleting(null);
                }}
                data-testid="o04-outbox-confirm"
              >
                {t("common.discard.confirm")}
              </Button>
            </>
          ) : outbox.length ? (
            <Button block disabled={offline} onClick={props.onSendNow} data-testid="o04-outbox-send">
              {t("o04.sendNow")}
            </Button>
          ) : undefined
        }
        data-testid="o04-outbox"
      >
        {/* Deleting asks inside the same sheet: two sheets swapping would race on the Back history entry. */}
        <ul className={s.outboxList}>
          {outbox
            .filter((item) => !deleting || item.id === deleting)
            .map((item) => {
              const meta = categoryMeta(item.category);
              const Pictogram = categoryPictograms[meta.pictogram];
              return (
                <li key={item.id} className={s.outboxItem} data-testid="o04-outbox-item">
                  <span className={s.outboxDisc} aria-hidden="true">
                    <Pictogram size={24} />
                  </span>
                  <span className={s.outboxText}>
                    <span className={s.outboxName}>{t(`o05.tile.${meta.tile}`)}</span>
                    <span className={`${styles.meta} eg-tnum`}>{formatWatDateTime(item.createdAt, locale)}</span>
                    <StatusBadge status={item.status} />
                    {!deleting && item.deletable && props.onDeleteQueued ? (
                      <Button variant="quiet" className={s.outboxDelete} onClick={() => setDeleting(item.id)} data-testid="o04-outbox-delete">
                        {t("o14.deleteLocal.button")}
                      </Button>
                    ) : null}
                  </span>
                </li>
              );
            })}
        </ul>
        {offline && !deleting ? <p className={styles.note}>{t("ui.network.offline")}</p> : null}
      </Sheet>
    </ObserverShell>
  );
}

/** Morning until 12:00, afternoon until 17:00, then evening, in West Africa Time. */
function greetingFor(now: Date): "morning" | "afternoon" | "evening" {
  const hour = Number(new Intl.DateTimeFormat("en-GB", { timeZone: "Africa/Lagos", hour: "numeric", hourCycle: "h23" }).format(now));
  return hour < 12 ? "morning" : hour < 17 ? "afternoon" : "evening";
}
