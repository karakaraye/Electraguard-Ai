"use client";
import { BackgroundArt } from "../../../../ui/BackgroundArt/BackgroundArt";

/* O-04 Home */

import { useState } from "react";
import { useLocale, useT } from "../../../../lib/i18n/client";
import type { Category } from "../../../../lib/api/types";
import { AppShell, Banner, Button, LanguageSwitcher, ReportList, ReportRow, Sheet, type ReportStatus } from "../../../../ui";
import { formatWatDateTime } from "../../../../ui/format";
import { categoryPictograms, ChevronRightIcon } from "../../../../ui/icons";
import { AppBarTitle } from "../_components/AppBarTitle";
import { ReportPictogram } from "../_components/pictograms";
import styles from "../_components/observer.module.css";
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
      {questionCount > 0 ? <Banner tone="attn" title={t("o04.questionBanner", { count: questionCount })} data-testid="o04-question" /> : null}
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
      {rows.length === 0 ? <BackgroundArt clear="none" /> : null}
      <h1 className="eg-sr-only">{t("o04.title")}</h1>
      <div className={styles.home}>
        <div className={styles.stack}>
          <p className={styles.meta} data-testid="o04-signed-in">
            {t("o04.signedInAs", { code })}
          </p>
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
          <button type="button" className={`${styles.choice} ${styles.choicePrimary}`} onClick={props.onReport} data-testid="o04-report">
            <ReportPictogram size={32} aria-hidden="true" />
            <span className={styles.choiceText}>
              <span className={styles.choiceLabel}>{t("o04.report")}</span>
            </span>
            <ChevronRightIcon aria-hidden="true" />
          </button>
        </div>

        <section aria-labelledby="o04-reports" className={styles.tight}>
          <h2 className={styles.sectionTitle} id="o04-reports">
            {t("o04.myReports")}
          </h2>
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
      </div>

      <Sheet open={menu} onClose={() => setMenu(false)} title={t("ui.menu")} data-testid="o04-menu">
        <LanguageSwitcher variant="compact" />
      </Sheet>
    </AppShell>
  );
}
