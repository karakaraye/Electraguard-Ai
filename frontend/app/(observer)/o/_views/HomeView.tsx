"use client";
import { BackgroundArt } from "../../../../ui/BackgroundArt/BackgroundArt";

/* O-04 Home */

import Link from "next/link";
import { useState, type ComponentType } from "react";
import { useLocale, useT } from "../../../../lib/i18n/client";
import type { Category } from "../../../../lib/api/types";
import { AppShell, Banner, Button, ButtonLink, LanguageSwitcher, ReportList, ReportRow, Sheet, type ReportStatus } from "../../../../ui";
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
      <h1 className="eg-sr-only">{t("o04.title")}</h1>
      <div className={styles.home}>
        <div className={styles.homeHeader}>
          <div className={styles.homeGreeting} data-testid="o04-greeting">
            {t("o04.greeting") || "Good morning"}
          </div>
          <p className={styles.homeSubhead} data-testid="o04-signed-in">
            {t("o04.signedInAs", { code })}
          </p>
        </div>

        <div className={styles.stack}>
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

          {/* Hero "Report something" card matching 05-home.png */}
          <div
            className={styles.heroReportCard}
            onClick={props.onReport}
            role="button"
            tabIndex={0}
            onKeyDown={(e) => {
              if (e.key === "Enter" || e.key === " ") {
                e.preventDefault();
                props.onReport();
              }
            }}
          >
            <div className={styles.heroSunDisc} aria-hidden="true" />
            <div className={styles.heroCardContent}>
              <h2 className={styles.heroCardTitle} data-testid="o04-report">{t("o04.report")}</h2>
              <p className={styles.heroCardSubtitle}>
                {t("o04.heroSubtitle") || "Tell us what you see at your polling unit"}
              </p>
            </div>
            <div className={styles.heroPlusBtn} aria-hidden="true">
              <svg width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round">
                <line x1="12" y1="5" x2="12" y2="19" />
                <line x1="5" y1="12" x2="19" y2="12" />
              </svg>
            </div>
          </div>

          {/* Polling-day checklist arc card matching 05-home.png */}
          <Link href="/o/checklist" className={styles.checklistArcCard} data-testid="o04-checklist">
            <div className={styles.checklistCardHeader}>
              <h2 className={styles.checklistCardTitle}>
                {t("o04.checklist")} · <span className={styles.checklistStageCount}>{t("o04.checklistStages") || "2 of 5 stages"}</span>
              </h2>
            </div>
            <div className={styles.arcContainer} aria-hidden="true">
              <svg viewBox="0 0 320 80" className={styles.arcSvg}>
                <path d="M 30 65 Q 160 15 290 65" stroke="var(--rule, #e8e3d8)" strokeWidth="3" fill="none" />
                <path d="M 30 65 Q 95 38 120 37" stroke="var(--sun, #e3b060)" strokeWidth="3" fill="none" />
                <circle cx="120" cy="37" r="10" fill="var(--sun, #e3b060)" />
                <circle cx="120" cy="37" r="5" fill="#faf7f0" />
                <circle cx="30" cy="65" r="5" fill="var(--ink, #16130f)" />
                <circle cx="180" cy="46" r="4" fill="var(--rule, #e8e3d8)" />
                <circle cx="235" cy="56" r="4" fill="var(--rule, #e8e3d8)" />
                <circle cx="290" cy="65" r="4" fill="var(--rule, #e8e3d8)" />
              </svg>
              <div className={styles.arcLabels}>
                <span>Before opening</span>
                <span className={styles.activeArcLabel}>Opening</span>
                <span>Voting</span>
                <span>Close</span>
                <span>After</span>
              </div>
            </div>
          </Link>
        </div>

        <nav aria-label={t("o04.tasks")} className={styles.tight}>
          <ul className={s.tasks}>
            <TaskLink
              href="/o/messages"
              icon={MessagesPictogram}
              label={t("o04.messages")}
              count={questionCount + (props.unreadCount ?? 0)}
              attn={questionCount > 0}
              countLabel={questionCount > 0 ? t("o04.questionBanner", { count: questionCount }) : t("o17.newMessage", { count: props.unreadCount ?? 0 })}
              testId="o04-messages"
            />
            {props.discussions ? (
              <TaskLink href="/o/discussions" icon={DiscussionsPictogram} label={t("o04.discussions")} count={props.discussions.count} countLabel={t("o18.unread", { count: props.discussions.count })} testId="o04-discussions" />
            ) : null}
            <TaskLink href="/o/ask" icon={AskPictogram} label={t("o04.ask")} testId="o04-ask" />
          </ul>
        </nav>

        <section aria-labelledby="o04-reports" className={styles.tight}>
          <div className={styles.reportsSectionHead}>
            <h2 className={styles.sectionTitle} id="o04-reports">
              {t("o04.myReports")}
            </h2>
            {rows.length ? (
              <Link href="/o/reports" className={styles.seeAllLink} data-testid="o04-all-reports">
                {t("o04.allReports")} &gt;
              </Link>
            ) : null}
          </div>
          {rows.length ? (
            <ReportList label={t("o04.myReports")}>
              {rows.map((row) => {
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
            <p className={styles.meta} data-testid="o04-no-reports">
              {t("o04.myReportsCount", { count: 0 })}
            </p>
          )}
          {rows.length === 0 ? (
            <p className={styles.purpose} data-testid="o04-purpose">
              {t("o04.purpose")}
            </p>
          ) : null}
        </section>

        {/* Bottom navigation bar */}
        <nav className={styles.bottomNav} aria-label="Main Navigation">
          <Link href="/o" className={`${styles.navItem} ${styles.navActive}`} aria-current="page">
            <svg width="22" height="22" viewBox="0 0 24 24" fill="currentColor">
              <path d="M10 20v-6h4v6h5v-8h3L12 3 2 12h3v8z" />
            </svg>
            <span>Home</span>
          </Link>
          <Link href="/o/reports" className={styles.navItem}>
            <svg width="22" height="22" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
              <path d="M14 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V8z" />
              <polyline points="14 2 14 8 20 8" />
              <line x1="16" y1="13" x2="8" y2="13" />
              <line x1="16" y1="17" x2="8" y2="17" />
            </svg>
            <span>Reports</span>
          </Link>
          <Link href="/o/settings" className={styles.navItem}>
            <svg width="22" height="22" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
              <path d="M20 21v-2a4 4 0 0 0-4-4H8a4 4 0 0 0-4 4v2" />
              <circle cx="12" cy="7" r="4" />
            </svg>
            <span>Profile</span>
          </Link>
        </nav>
      </div>

      <Sheet open={menu} onClose={() => setMenu(false)} title={t("ui.menu")} data-testid="o04-menu">
        <ObserverMenu />
        <LanguageSwitcher variant="compact" />
      </Sheet>
    </AppShell>
  );
}

function TaskLink({
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
      <Link href={href} className={s.taskLink} data-testid={testId}>
        <Icon size={32} aria-hidden="true" />
        <span>{label}</span>
        {count > 0 ? (
          <span className={`${s.count} ${attn ? s.countAttn : ""}`}>
            <span aria-hidden="true">{count}</span>
            <span className="eg-sr-only">{countLabel}</span>
          </span>
        ) : (
          <span />
        )}
        <ChevronRightIcon className={s.chev} aria-hidden="true" />
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
