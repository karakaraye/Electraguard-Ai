"use client";

/* O-13 My reports and O-17 Messages. Views only: fixture-renderable props, no API calls. */

import type { Category, ReportKind } from "../../../../lib/api/types";
import { useLocale, useT } from "../../../../lib/i18n/client";
import Link from "next/link";
import { Banner, Button, Count, ReportList, ReportRow, StatusBadge, Tag, useNow, type ReportStatus, Skeleton } from "../../../../ui";
import { noticeTitle } from "../../../../lib/notices";
import type { NoticeView } from "../_lib/notices";
import noticeStyles from "../_components/notice.module.css";
import { ObserverShell } from "../_components/ObserverShell";
import { formatWatTime } from "../../../../ui/format";
import { categoryMeta } from "../_lib/categories";
import { ObserverEmpty } from "../_components/ObserverEmpty";
import p3 from "../_components/p3.module.css";
import { ChecklistPictogram, SheetPictogram } from "../_components/pictograms";
import styles from "../_components/observer.module.css";
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
  /** Messages list: the latest reviewer words, the time they were written and the unread count. */
  preview?: string;
  previewAt?: string | null;
  unread?: number;
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
      count={row.unread}
      countLabel={row.unread ? t("o17.newMessageLabel", { count: row.unread }) : undefined}
      note={row.note ?? (!row.reference && row.status !== "received" ? t("o14.notSentYet") : undefined)}
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
        tone="danger"
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
    <ObserverShell
      tab="reports"
      title={t("o13.title")}
      hideBack
      onBack={props.onBack}
      offline={offline}
      queuedCount={props.queuedCount}
      banner={load === "error" || load === "unavailable" || stale ? <LoadBanner load={load} stale={stale} errorKey="o13.loadError" onRetry={props.onRetry} /> : undefined}
      data-testid="o13"
    >
      <div className={`${styles.screen} ${styles.wide}`}>
        <h1 className="eg-sr-only">{t("o13.title")}</h1>
        {nothingAtAll ? (
          <ObserverEmpty
            art="reportsEmpty"
            title={t("o13.emptyTitle")}
            action={
              <Button onClick={props.onReport} data-testid="o13-report">
                {t("o04.report")}
              </Button>
            }
            data-testid="o13-empty"
          >
            {t("o13.emptyBody")}
          </ObserverEmpty>
        ) : (
          <>
            <fieldset className={p3.segments} data-testid="o13-filter">
              <legend className="eg-sr-only">{t("o13.filterLabel")}</legend>
              {options.map((option) => (
                <label key={option} className={p3.segment}>
                  <input type="radio" name="o13-filter" value={option} checked={filter === option} onChange={() => props.onFilter(option)} data-testid={`o13-filter-${option}`} />
                  <span className={p3.segmentFace}>
                    <span>{t(`o13.filter.${option}`)}</span>
                    {load === "error" && option !== "onPhone" ? (
                      <span aria-hidden="true">-</span>
                    ) : (
                      <Count value={counts[option]} tone={option === "needsYou" && counts[option] > 0 ? "needs" : "neutral"} />
                    )}
                  </span>
                </label>
              ))}
            </fieldset>
            <p className={p3.listMeta} data-testid="o13-freshness">
              <span>{load === "loading" ? "" : t("o13.resultCount", { count: rows.length })}</span>
              <span>{offline || load === "offline" ? t("o13.offlineList") : load === "loading" ? t("o13.loading") : updatedAt ? t("o13.updated", { time: formatWatTime(updatedAt, locale) }) : ""}</span>
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
    </ObserverShell>
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
  /** Check-ins from the coordinator, newest first. They lead the list. */
  notices?: NoticeView[];
  now?: number;
};

export function MessagesView({ offline, rows, load, stale, onRetry, onBack, notices = [], now }: MessagesViewProps) {
  const t = useT();
  return (
    <ObserverShell
      tab="messages"
      title={t("o17.title")}
      hideBack
      onBack={onBack}
      offline={offline}
      banner={load === "error" || load === "unavailable" || stale ? <LoadBanner load={load} stale={stale} errorKey="o17.loadError" onRetry={onRetry} /> : undefined}
      data-testid="o17"
    >
      <div className={`${styles.screen} ${styles.wide}`}>
        <h1 className="eg-sr-only">{t("o17.title")}</h1>
        <p className={styles.meta}>{t("o17.hint")}</p>
        {notices.length ? (
          <section className={p3.listStack} aria-labelledby="o17-notices" data-testid="o17-group-notices">
            <h2 className={p3.groupLabel} id="o17-notices">
              {t("notice.group")}
            </h2>
            <ul className={p3.msgList} aria-label={t("notice.group")}>
              {notices.map((notice) => (
                <NoticeRow key={notice.id} notice={notice} now={now} />
              ))}
            </ul>
          </section>
        ) : null}
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
              <section key={group.key} className={p3.listStack} aria-labelledby={`o17-${group.key}`} data-testid={`o17-group-${group.key}`}>
                <h2 className={p3.groupLabel} id={`o17-${group.key}`}>
                  {group.title}
                </h2>
                <ul className={p3.msgList} aria-label={group.title}>
                  {group.rows.map((row) => (
                    <MessageRow key={row.key} row={row} />
                  ))}
                </ul>
              </section>
            ))
        ) : load === "ok" && notices.length === 0 ? (
          <ObserverEmpty art="messagesEmpty" title={t("o17.emptyTitle")} data-testid="o17-empty">
            {t("o17.emptyBody")}
          </ObserverEmpty>
        ) : null}
        <p className="eg-sr-only" role="status" aria-live="polite">
          {load === "ok" ? t("o13.resultCount", { count: rows.length }) : ""}
        </p>
      </div>
    </ObserverShell>
  );
}

/** One check-in from the coordinator: what it asks, its type (only Safety is red), and when to answer by. */
function NoticeRow({ notice, now: nowProp }: { notice: NoticeView; now?: number }) {
  const t = useT();
  const clock = useNow();
  const now = nowProp ?? clock ?? 0;
  const { locale } = useLocale();
  const closed = Date.parse(notice.expires_at) <= now;
  return (
    <li>
      <Link href={`/o/checkin/${notice.id}`} className={p3.msg} data-testid={`o17-notice-${notice.id}`}>
        <span className={`${p3.msgTime} ${noticeStyles.rowTime} eg-tnum`}>{formatWatTime(notice.created_at, locale)}</span>
        <p className={noticeStyles.rowTitle}>{noticeTitle(notice, locale)}</p>
        <span className={noticeStyles.tags}>
          {notice.type === "safety" ? <StatusBadge tone="danger" label={t("notice.type.safety")} /> : <Tag>{t(`notice.type.${notice.type}`)}</Tag>}
          {notice.answer ? (
            <StatusBadge tone={notice.answer.state === "expired" ? "attn" : "ok"} label={notice.answer.state === "on_phone" ? t("ui.status.onPhone") : t(`notice.answer.${notice.answer.choice}`)} />
          ) : closed ? (
            <StatusBadge tone="wait" label={t("notice.expired")} />
          ) : (
            <StatusBadge tone="attn" label={t("notice.answerBy", { time: formatWatTime(notice.expires_at, locale) })} />
          )}
        </span>
      </Link>
    </li>
  );
}

/** One message in the grouped list: the receipt code, when the reviewer wrote, what they said, then status and place. */
function MessageRow({ row }: { row: ListRow }) {
  const t = useT();
  const { locale } = useLocale();
  const meta = categoryMeta(row.category);
  const label =
    row.kind === "checklist" ? t("o13.checklistStage", { stage: t(`o15.stage.${row.stage ?? "arrival"}`) }) : row.kind === "result_sheet" ? t("o13.resultSheet") : t(`o05.tile.${meta.tile}`);
  const when = row.previewAt ?? row.at;
  const text = row.preview ?? row.note;
  return (
    <li>
      <Link href={row.href} className={p3.msg} data-testid="report-row">
        <span className={`${p3.msgCode} eg-tnum`}>{row.reference ?? label}</span>
        <span className={`${p3.msgTime} eg-tnum`}>
          {when ? formatWatTime(when, locale) : null}
          {row.unread ? <Count value={row.unread} tone="needs" label={t("o17.newMessageLabel", { count: row.unread })} /> : null}
        </span>
        {text ? <p className={p3.msgPreview}>{text}</p> : null}
        <span className={p3.msgFoot}>
          {row.status === "question" ? <StatusBadge status="question" /> : null}
          {row.status === "question" ? <span className={p3.msgTag}>{label}</span> : null}
        </span>
      </Link>
    </li>
  );
}
