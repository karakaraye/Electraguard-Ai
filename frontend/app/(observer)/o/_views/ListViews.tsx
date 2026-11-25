"use client";

/* O-13 My reports and O-17 Messages. Views only: fixture-renderable props, no API calls. */

import type { Category, ReportKind } from "../../../../lib/api/types";
import { useLocale, useT } from "../../../../lib/i18n/client";
import { AppShell, Banner, Button, EmptyState, ReportList, ReportRow, type ReportStatus, Skeleton, SunRings } from "../../../../ui";
import { formatWatTime } from "../../../../ui/format";
import { categoryMeta } from "../_lib/categories";
import { ChecklistPictogram, SheetPictogram } from "../_components/pictograms";
import styles from "../_components/observer.module.css";
import { FileIcon, MessageIcon } from "../../../../ui/icons";
import s from "../_components/screens.module.css";

export type ListRow = {
  key: string;
  href: string;
  kind: ReportKind;
  category: Category | null;
  /** Checklist stage slug (o15.stage.*) for checklist rows. */
  stage?: string | null;
  place: string;
  at: string | number | null;
  reference?: string;
  status: ReportStatus;
  /** Extra line, already translated. */
  note?: string;
};

export type ListLoad = "loading" | "ok" | "offline" | "error" | "unavailable";

/** One row in either list: the label depends on the report kind (O-13 layout 3). */
export function Row({ row }: { row: ListRow }) {
  const t = useT();
  const meta = categoryMeta(row.category);
  const label =
    row.kind === "checklist"
      ? t("o13.checklistStage", { stage: t(`o15.stage.${row.stage ?? "arrival"}`) })
      : row.kind === "result_sheet"
        ? t("o13.resultSheet")
        : t(`o05.tile.${meta.tile}`);
  const pictogram = row.kind === "checklist" ? ChecklistPictogram : row.kind === "result_sheet" ? SheetPictogram : undefined;
  return (
    <ReportRow
      href={row.href}
      category={meta.pictogram}
      pictogram={pictogram}
      categoryLabel={label}
      place={row.place}
      observedAt={row.at ?? 0}
      hideTime={row.at === null}
      reference={row.reference}
      status={row.status}
      note={row.note}
      data-testid="report-row"
    />
  );
}

function LoadBanner({ load, stale, errorKey, onRetry }: { load: ListLoad; stale: boolean; errorKey: string; onRetry: () => void }) {
  const t = useT();
  if (load === "unavailable") return <Banner tone="wait" title={t("common.error.unavailable")} data-testid="list-unavailable" />;
  if (load === "error" || stale) {
    return (
      <Banner
        tone="attn"
        title={t(errorKey)}
        action={
          <Button variant="secondary" onClick={onRetry} data-testid="list-retry">
            {t("ui.retry")}
          </Button>
        }
        data-testid="list-error"
      />
    );
  }
  return null;
}

/* ---------- O-13 My reports ---------- */

export type ReportsFilter = "all" | "needsYou" | "onPhone";

export type MyReportsViewProps = {
  offline: boolean;
  queuedCount: number;
  filter: ReportsFilter;
  onFilter: (filter: ReportsFilter) => void;
  counts: Record<ReportsFilter, number>;
  /** Rows already filtered and sorted (needs you, on this phone, then newest activity). */
  rows: ListRow[];
  load: ListLoad;
  stale: boolean;
  updatedAt: number | null;
  hasMore: boolean;
  loadingMore: boolean;
  onMore: () => void;
  onRetry: () => void;
  onReport: () => void;
  onBack: () => void;
};

export function MyReportsView(props: MyReportsViewProps) {
  const t = useT();
  const { locale } = useLocale();
  const { offline, filter, counts, rows, load, stale, updatedAt } = props;
  const options: ReportsFilter[] = ["all", "needsYou", "onPhone"];
  const nothingAtAll = load === "ok" && counts.all === 0;

  return (
    <AppShell
      title={t("o13.title")}
      onBack={props.onBack}
      offline={offline}
      queuedCount={props.queuedCount}
      banner={load === "error" || load === "unavailable" || stale ? <LoadBanner load={load} stale={stale} errorKey="o13.loadError" onRetry={props.onRetry} /> : undefined}
      data-testid="o13"
    >
      <div className={`${styles.screen} ${styles.wide}`}>
        <h1 className={styles.title}>{t("o13.title")}</h1>
        {nothingAtAll ? (
          <EmptyState
            title={t("o13.empty")}
            art={
              <SunRings size={128}>
                <span className={s.emptyDisc}>
                  <FileIcon size={30} aria-hidden="true" />
                </span>
              </SunRings>
            }
            action={
              <Button onClick={props.onReport} data-testid="o13-report">
                {t("o04.report")}
              </Button>
            }
            data-testid="o13-empty"
          />
        ) : (
          <>
            <fieldset className={s.segmented} data-testid="o13-filter">
              <legend className="eg-sr-only">{t("o13.filterLabel")}</legend>
              {options.map((option) => (
                <label key={option} className={s.segment}>
                  <input type="radio" name="o13-filter" value={option} checked={filter === option} onChange={() => props.onFilter(option)} data-testid={`o13-filter-${option}`} />
                  <span className={s.segmentLabel}>{t(`o13.filter.${option}`)}</span>
                  <span className={`${s.segmentCount} ${s.tnum}`} data-attention={option === "needsYou" && counts[option] > 0 ? "" : undefined}>
                    {counts[option]}
                  </span>
                </label>
              ))}
            </fieldset>
            <p className={styles.meta} data-testid="o13-freshness">
              {offline || load === "offline" ? t("o13.offlineList") : load === "loading" ? t("o13.loading") : updatedAt ? t("o13.updated", { time: formatWatTime(updatedAt, locale) }) : ""}
            </p>
            {rows.length ? (
              <ReportList label={t("o13.title")}>
                {rows.map((row) => (
                  <Row key={row.key} row={row} />
                ))}
              </ReportList>
            ) : load === "loading" ? (
              <div className={s.skeletonList} aria-hidden="true" data-testid="o13-loading">
                {[0, 1, 2].map((index) => (
                  <div key={index} className={s.skeletonCard}>
                    <Skeleton lines={3} delay={0} />
                  </div>
                ))}
              </div>
            ) : (
              <p className={styles.lead} data-testid="o13-empty-filter">
                {t("o13.emptyFilter")}
              </p>
            )}
            {props.hasMore ? (
              <Button variant="secondary" loading={props.loadingMore} onClick={props.onMore} data-testid="o13-more">
                {t("o13.more")}
              </Button>
            ) : null}
            <p className="eg-sr-only" role="status" aria-live="polite">
              {load === "loading" ? "" : t("o13.resultCount", { count: rows.length })}
            </p>
          </>
        )}
      </div>
    </AppShell>
  );
}

/* ---------- O-17 Messages ---------- */

export type MessagesViewProps = {
  offline: boolean;
  rows: ListRow[];
  load: ListLoad;
  stale: boolean;
  onRetry: () => void;
  onBack: () => void;
};

export function MessagesView({ offline, rows, load, stale, onRetry, onBack }: MessagesViewProps) {
  const t = useT();
  return (
    <AppShell
      title={t("o17.title")}
      onBack={onBack}
      offline={offline}
      banner={load === "error" || load === "unavailable" || stale ? <LoadBanner load={load} stale={stale} errorKey="o17.loadError" onRetry={onRetry} /> : undefined}
      data-testid="o17"
    >
      <div className={`${styles.screen} ${styles.wide}`}>
        <h1 className={styles.title}>{t("o17.title")}</h1>
        <p className={styles.lead}>{t("o17.hint")}</p>
        {load === "loading" ? (
          <div className={s.skeletonList} aria-hidden="true" data-testid="o17-loading">
            {[0, 1].map((index) => (
              <div key={index} className={s.skeletonCard}>
                <Skeleton lines={3} delay={0} />
              </div>
            ))}
          </div>
        ) : load === "offline" && rows.length === 0 ? (
          <p className={styles.meta} data-testid="o17-offline">
            {t("o17.offline")}
          </p>
        ) : rows.length ? (
          /* Questions first (they block the reviewer), then unread messages. */
          [
            { key: "questions", title: t("o17.groupQuestions"), rows: rows.filter((row) => row.status === "question") },
            { key: "unread", title: t("o17.groupUnread"), rows: rows.filter((row) => row.status !== "question") },
          ]
            .filter((group) => group.rows.length)
            .map((group) => (
              <section key={group.key} className={s.messageGroup} aria-labelledby={`o17-${group.key}`} data-testid={`o17-group-${group.key}`}>
                <h2 className={s.groupTitle} id={`o17-${group.key}`}>
                  {group.title}
                  <span className={`${s.segmentCount} ${s.tnum}`} data-attention={group.key === "questions" ? "" : undefined}>
                    {group.rows.length}
                  </span>
                </h2>
                <ReportList label={group.title}>
                  {group.rows.map((row) => (
                    <Row key={row.key} row={row} />
                  ))}
                </ReportList>
              </section>
            ))
        ) : load === "ok" ? (
          <EmptyState
            title={t("o17.empty")}
            art={
              <SunRings size={128}>
                <span className={s.emptyDisc}>
                  <MessageIcon size={30} aria-hidden="true" />
                </span>
              </SunRings>
            }
            data-testid="o17-empty"
          />
        ) : null}
        <p className="eg-sr-only" role="status" aria-live="polite">
          {load === "ok" ? t("o13.resultCount", { count: rows.length }) : ""}
        </p>
      </div>
    </AppShell>
  );
}
