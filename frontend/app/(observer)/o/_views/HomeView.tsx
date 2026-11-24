"use client";
import { BackgroundArt } from "../../../../ui/BackgroundArt/BackgroundArt";

/* O-04 Home */

import Link from "next/link";
import { useState, type ComponentType } from "react";
import { useLocale, useT } from "../../../../lib/i18n/client";
import type { Category } from "../../../../lib/api/types";
import { AppShell, Banner, Button, ButtonLink, DayArc, HeroCard, LanguageSwitcher, ReportList, ReportRow, Sheet, type ReportStatus } from "../../../../ui";
import { formatWatDateTime } from "../../../../ui/format";
import { categoryPictograms, ChevronRightIcon, type IconProps } from "../../../../ui/icons";
import { AppBarTitle } from "../_components/AppBarTitle";
import { AskPictogram, DiscussionsPictogram, MessagesPictogram } from "../_components/pictograms";
import styles from "../_components/observer.module.css";
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
  /** Today's checklist from this phone (O-15 per-day state): each stage sent, next or later. */
  checklist: { unitLabel: string | null; stages: Array<{ slug: string; state: "sent" | "next" | "later" }> };
  onReport: () => void;
  onContinue: () => void;
  onSendNow: () => void;
  onFix: () => void;
  onSendWaiting: () => void;
  onDeleteWaiting: () => void;
};

export function HomeView(props: HomeViewProps) {
  const t = useT();
  const { locale } = useLocale();
  const [menu, setMenu] = useState(false);
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
  const sentCount = props.checklist.stages.filter((stage) => stage.state === "sent").length;
  const nextStage = props.checklist.stages.find((stage) => stage.state === "next");

  const banners = (
    <div className={styles.tight}>
      {networkBack ? <Banner tone="ok" title={t("common.network.back")} data-testid="o04-network-back" /> : null}
      {pinSaved ? <Banner tone="ok" title={t("o03.setPin.done")} data-testid="o04-pin-saved" /> : null}
      {draftKept ? <Banner tone="ok" title={t("incident.draftKept")} data-testid="o04-draft-kept" /> : null}
      {waitingCodeCount > 0 ? (
        <Banner
          tone="attn"
          critical
          title={t("o04.waitingCode", { count: waitingCodeCount })}
          action={
            <div className={styles.itemActions}>
              <Button variant="secondary" onClick={props.onSendWaiting} data-testid="o04-send-waiting">
                {t("o04.sendWaiting")}
              </Button>
              <Button variant="quiet" onClick={props.onDeleteWaiting} data-testid="o04-delete-waiting">
                {t("o04.deleteWaiting")}
              </Button>
            </div>
          }
          data-testid="o04-waiting-code"
        />
      ) : null}
      {intakePaused ? <Banner tone="attn" critical title={t("o04.intakePaused")} data-testid="o04-intake-paused" /> : null}
      {unsentCount > 0 ? (
        <Banner
          tone="wait"
          title={t("o04.unsent", { count: unsentCount })}
          action={
            <div className={styles.itemActions}>
              <Button variant="secondary" disabled={offline} onClick={props.onSendNow} data-testid="o04-send-now">
                {t("o04.sendNow")}
              </Button>
            </div>
          }
          data-testid="o04-unsent"
        />
      ) : null}
      {needsAttentionCount > 0 ? (
        <Banner
          tone="attn"
          title={t("o04.needsAttention", { count: needsAttentionCount })}
          action={
            <Button variant="secondary" onClick={props.onFix} data-testid="o04-fix">
              {t("o04.fix")}
            </Button>
          }
          data-testid="o04-needs-attention"
        />
      ) : null}
      {questionCount > 0 ? (
        <Banner
          tone="attn"
          title={t("o04.questionBanner", { count: questionCount })}
          action={
            <ButtonLink href="/o/messages" variant="secondary" data-testid="o04-answer">
              {t("o04.answer")}
            </ButtonLink>
          }
          data-testid="o04-question"
        />
      ) : null}
    </div>
  );
  const hasBanner =
    networkBack || pinSaved || draftKept || waitingCodeCount > 0 || intakePaused || unsentCount > 0 || needsAttentionCount > 0 || questionCount > 0;

  return (
    <AppShell
      title={<AppBarTitle />}
      hideBack
      onMenu={() => setMenu(true)}
      offline={offline}
      queuedCount={queuedCount}
      banner={hasBanner ? banners : undefined}
      data-testid="o04"
    >
      {rows.length === 0 ? <BackgroundArt variant="soft" clear="none" /> : null}
      <div className={styles.home}>
        <header className={styles.homeHead}>
          <h1 className={styles.homeGreeting}>{t(`o04.greeting.${greetingFor(new Date())}`)}</h1>
          <p className={styles.meta} data-testid="o04-signed-in">
            {t("o04.signedInAs", { code })}
            {props.checklist.unitLabel ? ` · ${props.checklist.unitLabel}` : ""}
          </p>
        </header>

        {draft && DraftPictogram ? (
          <div className={styles.draftCard} data-testid="o04-draft">
            <div className={styles.draftHead}>
              <DraftPictogram size={32} aria-hidden="true" />
              <div className={styles.tight}>
                <p className={styles.itemName}>{t(`o05.tile.${categoryMeta(draft.category).tile}`)}</p>
                <p className={styles.meta}>{t("o04.draftSaved", { time: formatWatDateTime(draft.startedAt, locale) })}</p>
              </div>
            </div>
            <Button variant="secondary" block icon={<ChevronRightIcon />} onClick={props.onContinue} data-testid="o04-continue">
              {t("o04.continueDraft")}
            </Button>
          </div>
        ) : null}

        {/* Stays tappable when intake is paused: reports can still be written and wait on the phone. */}
        <HeroCard title={t("o04.report")} body={t("o04.heroBody")} onClick={props.onReport} data-testid="o04-report" />

        <Link href="/o/checklist" className={styles.arcCard} data-testid="o04-checklist">
          <span className={styles.arcHead}>
            <span className={styles.arcTitle}>{t("o04.checklist")}</span>
            <span className={styles.meta}>{t("o04.checklistProgress", { done: sentCount, total: props.checklist.stages.length })}</span>
          </span>
          <DayArc
            stages={props.checklist.stages.map((stage) => ({ id: stage.slug, label: t(`o15.stage.${stage.slug}`), state: stage.state }))}
            nextLabel={nextStage ? t("o04.checklistNext", { stage: t(`o15.stage.${nextStage.slug}`) }) : t("o04.checklistDone")}
            listLabel={t("o04.checklist")}
            stateLabels={{ sent: t("o15.stageState.received"), next: t("o04.stageNext"), later: t("o15.stageState.notStarted") }}
          />
        </Link>

        <section aria-labelledby="o04-reports" className={styles.tight}>
          <div className={styles.sectionHead}>
            <h2 className={styles.sectionTitle} id="o04-reports">
              {t("o04.myReports")}
            </h2>
            {rows.length ? (
              <Link href="/o/reports" className={s.textLink} data-testid="o04-all-reports">
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

        <nav aria-label={t("o04.tasks")}>
          <ul className={styles.quickTiles}>
            <QuickTile
              href="/o/messages"
              icon={MessagesPictogram}
              label={t("o04.messages")}
              count={questionCount + (props.unreadCount ?? 0)}
              attn={questionCount > 0}
              countLabel={questionCount > 0 ? t("o04.questionBanner", { count: questionCount }) : t("o17.newMessage", { count: props.unreadCount ?? 0 })}
              testId="o04-messages"
            />
            <QuickTile href="/o/ask" icon={AskPictogram} label={t("o04.ask")} testId="o04-ask" />
            {props.discussions ? (
              <QuickTile
                href="/o/discussions"
                icon={DiscussionsPictogram}
                label={t("o04.discussions")}
                count={props.discussions.count}
                countLabel={t("o18.unread", { count: props.discussions.count })}
                testId="o04-discussions"
              />
            ) : null}
          </ul>
        </nav>
      </div>

      <Sheet open={menu} onClose={() => setMenu(false)} title={t("ui.menu")} data-testid="o04-menu">
        <ObserverMenu />
        <LanguageSwitcher variant="compact" />
      </Sheet>
    </AppShell>
  );
}

/** Morning until 12:00, afternoon until 17:00, then evening, in West Africa Time. */
function greetingFor(now: Date): "morning" | "afternoon" | "evening" {
  const hour = Number(new Intl.DateTimeFormat("en-GB", { timeZone: "Africa/Lagos", hour: "numeric", hourCycle: "h23" }).format(now));
  return hour < 12 ? "morning" : hour < 17 ? "afternoon" : "evening";
}

function QuickTile({
  href,
  icon: Icon,
  label,
  count = 0,
  attn,
  countLabel,
  testId,
}: {
  href: string;
  icon: ComponentType<IconProps>;
  label: string;
  count?: number;
  attn?: boolean;
  countLabel?: string;
  testId: string;
}) {
  return (
    <li>
      <Link href={href} className={styles.quickTile} data-testid={testId}>
        <span className={styles.quickDisc} aria-hidden="true">
          <Icon size={26} />
          {count > 0 ? <span className={`${styles.quickCount} ${attn ? styles.quickCountAttn : ""} eg-tnum`}>{count}</span> : null}
        </span>
        <span>{label}</span>
        {count > 0 && countLabel ? <span className="eg-sr-only">{countLabel}</span> : null}
      </Link>
    </li>
  );
}

/** The top-bar menu on every observer screen that has one: Settings, Messages, Discussions, Ask. */
export function ObserverMenu() {
  const t = useT();
  const links: Array<{ href: string; key: string }> = [
    { href: "/o/settings", key: "o20.title" },
    { href: "/o/reports", key: "o13.title" },
    { href: "/o/messages", key: "o17.title" },
    { href: "/o/discussions", key: "o18.title" },
    { href: "/o/ask", key: "o04.ask" },
  ];
  return (
    <ul className={s.menuList}>
      {links.map((link) => (
        <li key={link.href}>
          <Link href={link.href} className={s.menuLink} data-testid={`menu-${link.href.split("/").pop()}`}>
            {t(link.key)}
          </Link>
        </li>
      ))}
    </ul>
  );
}
