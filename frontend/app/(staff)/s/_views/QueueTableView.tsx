"use client";

import Link from "next/link";
import { useState, type FormEvent } from "react";
import type {
  Category,
  Channel,
  QueueItem,
  QueueResponse,
  ReportStatus,
  Urgency,
} from "../../../../lib/api/types";
import { useLocale, useT } from "../../../../lib/i18n/client";
import {
  Banner,
  Button,
  DataTable,
  EmptyState,
  SegmentedControl,
  Skeleton,
  StatusBadge,
  type Column,
  type ReportStatus as BadgeStatus,
  type StatusTone,
} from "../../../../ui";
import { formatWatDateTime } from "../../../../ui/format";
import { useMediaQuery } from "../../../../ui/hooks";
import {
  ArrowRightIcon,
  CameraIcon,
  CloseIcon,
  MicIcon,
  PlusIcon,
  RetryIcon,
  VideoIcon,
} from "../../../../ui/icons";
import { CATEGORY_ROWS } from "../../../(public)/_lib/public";
import styles from "./QueueTableView.module.css";

export type QueueStatusTab =
  "all" | "received" | "in_review" | "question" | "closed";

export interface QueueTableFilters {
  status: QueueStatusTab;
  urgency: Urgency[];
  category: Category | "";
  channel: Channel[];
  hasEvidence: boolean;
}

export const EMPTY_QUEUE_FILTERS: QueueTableFilters = {
  status: "all",
  urgency: [],
  category: "",
  channel: [],
  hasEvidence: false,
};

export interface SavedQueueView {
  name: string;
  filters: QueueTableFilters;
}

export interface QueueTableViewProps {
  data: QueueResponse | null;
  loading: boolean;
  loadingMore?: boolean;
  error: string | null;
  filters: QueueTableFilters;
  onFiltersChange: (filters: QueueTableFilters) => void;
  onLoadMore?: () => void;
  onRetry?: () => void;
  /** Cases that arrived since the list was loaded; they wait behind the pill (I-18). */
  newCount?: number;
  onShowNew?: () => void;
  savedViews?: SavedQueueView[];
  onSaveView?: (name: string) => void;
  onRemoveView?: (name: string) => void;
  /** Opens a case (Enter or click). */
  onOpenCase: (id: string) => void;
  /** Preview only: the row shown in the preview pane at first. */
  initialPreviewId?: string;
  "data-testid"?: string;
}

const URGENCIES: Urgency[] = ["urgent", "high", "normal", "low"];
const CHANNELS: Channel[] = ["app", "citizen", "sms", "ussd"];
const TABS: QueueStatusTab[] = [
  "all",
  "received",
  "in_review",
  "question",
  "closed",
];
const CATEGORY_KEY = Object.fromEntries(
  CATEGORY_ROWS.map((row) => [row.value, row.key]),
) as Record<Category, string>;

/** The badge spells "in review" with a hyphen; the API with an underscore. */
function badgeStatus(status: ReportStatus): BadgeStatus {
  return (status === "in_review" ? "in-review" : status) as BadgeStatus;
}

export function urgencyTone(level: Urgency): StatusTone {
  return level === "urgent" ? "danger" : level === "high" ? "attn" : "wait";
}

function isFiltered(f: QueueTableFilters): boolean {
  return (
    f.urgency.length > 0 ||
    f.category !== "" ||
    f.channel.length > 0 ||
    f.hasEvidence
  );
}

function toggle<T>(list: T[], value: T): T[] {
  return list.includes(value)
    ? list.filter((v) => v !== value)
    : [...list, value];
}

/** S-02 review queue: status tabs, filter chips, the case table and, on wide screens, a preview. */
export function QueueTableView({
  data,
  loading,
  loadingMore,
  error,
  filters,
  onFiltersChange,
  onLoadMore,
  onRetry,
  newCount = 0,
  onShowNew,
  savedViews = [],
  onSaveView,
  onRemoveView,
  onOpenCase,
  initialPreviewId,
  "data-testid": testId = "queue-table-view",
}: QueueTableViewProps) {
  const t = useT();
  const { locale } = useLocale();
  const [previewId, setPreviewId] = useState<string | null>(
    initialPreviewId ?? null,
  );
  const [naming, setNaming] = useState(false);
  const [viewName, setViewName] = useState("");

  const items = data?.items ?? [];
  const counts = data?.counts ?? {};
  const countOf = (tab: QueueStatusTab) =>
    tab === "all"
      ? (
          ["received", "in_review", "question", "closed"] as ReportStatus[]
        ).reduce((sum, s) => sum + (counts[s] ?? 0), 0)
      : (counts[tab] ?? 0);
  const tabLabel = (tab: QueueStatusTab) =>
    tab === "all"
      ? t("s02.filters.all")
      : tab === "received"
        ? t("ui.status.received")
        : tab === "in_review"
          ? t("ui.status.inReview")
          : tab === "question"
            ? t("s02.tabs.question")
            : t("ui.status.closed");

  const wide = useMediaQuery("(min-width: 1280px)");
  /** Phones get cards and a status dropdown; the table needs at least a tablet's width. */
  const tableWidth = useMediaQuery("(min-width: 768px)", true);
  const preview = items.find((item) => item.id === previewId) ?? null;
  /** With the preview open, the columns it repeats (why, evidence, status) step out of the table. */
  const previewOpen = wide && preview !== null;
  const set = (patch: Partial<QueueTableFilters>) =>
    onFiltersChange({ ...filters, ...patch });

  function saveView(event: FormEvent) {
    event.preventDefault();
    const name = viewName.trim();
    if (!name) return;
    onSaveView?.(name);
    setViewName("");
    setNaming(false);
  }

  const columns: Column<QueueItem>[] = [
    {
      key: "urgency",
      header: t("s02.columns.urgency"),
      sortable: true,
      sortValue: (row) => URGENCIES.indexOf(row.urgency.level),
      render: (row) => (
        <span className={styles.nowrap}>
          <StatusBadge
            tone={urgencyTone(row.urgency.level)}
            label={t(`s02.urgency.${row.urgency.level}`)}
          />
        </span>
      ),
    },
    {
      key: "reasons",
      header: t("s02.columns.reasons"),
      render: (row) => <Reasons reasons={row.urgency.reasons} />,
    },
    {
      key: "reference",
      header: t("s02.columns.reference"),
      rowHeader: true,
      sortable: true,
      sortValue: (row) => row.receipt_code,
      render: (row) => (
        <span className={styles.ref}>
          <span className="eg-tnum">{row.receipt_code}</span>
          {row.simulated ? (
            <span className={styles.simulated}>{t("s02.simulated")}</span>
          ) : null}
        </span>
      ),
    },
    {
      key: "category",
      header: t("s02.columns.category"),
      sortable: true,
      sortValue: (row) => t(CATEGORY_KEY[row.category.value]),
      render: (row) => t(CATEGORY_KEY[row.category.value]),
    },
    {
      key: "place",
      header: t("s02.columns.location"),
      sortable: true,
      sortValue: (row) => row.area?.lga_name ?? row.area?.state_name ?? null,
      render: (row) =>
        row.area ? (
          <span className={styles.place}>
            <span>{row.area.lga_name ?? row.area.state_name}</span>
            {row.area.lga_name ? (
              <span className={styles.sub}>{row.area.state_name}</span>
            ) : null}
          </span>
        ) : (
          <span className={styles.sub}>{t("s02.noPlace")}</span>
        ),
    },
    {
      key: "occurred",
      header: t("s02.columns.occurred"),
      sortable: true,
      sortValue: (row) => row.occurred_at ?? row.received_at,
      render: (row) => (
        <span className="eg-tnum">
          {formatWatDateTime(row.occurred_at ?? row.received_at, locale)}
        </span>
      ),
    },
    {
      key: "evidence",
      header: t("s02.columns.evidence"),
      sortable: true,
      sortValue: (row) =>
        row.media_counts.photo +
        row.media_counts.video +
        row.media_counts.audio,
      render: (row) => <Evidence counts={row.media_counts} />,
    },
    {
      key: "status",
      header: t("s02.columns.status"),
      sortable: true,
      sortValue: (row) => row.status,
      render: (row) => (
        <span className={styles.nowrap}>
          <StatusBadge status={badgeStatus(row.status)} />
        </span>
      ),
    },
  ];

  return (
    <div className={styles.page} data-testid={testId}>
      <div className={styles.tabs}>
        {tableWidth ? (
          <SegmentedControl
            label={t("s02.tabsLabel")}
            value={filters.status}
            onChange={(value) => set({ status: value as QueueStatusTab })}
            options={TABS.map((tab) => ({
              value: tab,
              label: `${tabLabel(tab)} ${countOf(tab)}`,
            }))}
            data-testid="s02-tabs"
          />
        ) : (
          <label className={styles.statusSelect}>
            <span>{t("s02.filters.status")}</span>
            <select
              value={filters.status}
              onChange={(e) =>
                set({ status: e.target.value as QueueStatusTab })
              }
              data-testid="s02-status-select"
            >
              {TABS.map((tab) => (
                <option
                  key={tab}
                  value={tab}
                >{`${tabLabel(tab)} (${countOf(tab)})`}</option>
              ))}
            </select>
          </label>
        )}
      </div>

      <div
        className={styles.filters}
        role="group"
        aria-label={t("s02.filters.label")}
      >
        <div
          className={styles.chipGroup}
          role="group"
          aria-label={t("s02.filters.urgency")}
        >
          {URGENCIES.map((level) => (
            <button
              key={level}
              type="button"
              className={styles.chip}
              aria-pressed={filters.urgency.includes(level)}
              onClick={() => set({ urgency: toggle(filters.urgency, level) })}
              data-testid={`s02-urgency-${level}`}
            >
              {t(`s02.urgency.${level}`)}
            </button>
          ))}
        </div>

        <label
          className={styles.selectChip}
          data-on={filters.category ? "" : undefined}
        >
          <span className="eg-sr-only">{t("s02.filters.category")}</span>
          <select
            value={filters.category}
            onChange={(e) => set({ category: e.target.value as Category | "" })}
            data-testid="s02-category"
          >
            <option value="">{t("s02.filters.anyCategory")}</option>
            {CATEGORY_ROWS.map((row) => (
              <option key={row.value} value={row.value}>
                {t(row.key)}
              </option>
            ))}
          </select>
        </label>

        <div
          className={styles.chipGroup}
          role="group"
          aria-label={t("s02.filters.channel")}
        >
          {CHANNELS.map((channel) => (
            <button
              key={channel}
              type="button"
              className={styles.chip}
              aria-pressed={filters.channel.includes(channel)}
              onClick={() => set({ channel: toggle(filters.channel, channel) })}
              data-testid={`s02-channel-${channel}`}
            >
              {t(`s02.channel.${channel}`)}
            </button>
          ))}
        </div>

        <button
          type="button"
          className={styles.chip}
          aria-pressed={filters.hasEvidence}
          onClick={() => set({ hasEvidence: !filters.hasEvidence })}
          data-testid="s02-has-media"
        >
          {t("s02.filters.hasEvidence")}
        </button>

        {isFiltered(filters) ? (
          <Button
            variant="quiet"
            onClick={() =>
              onFiltersChange({
                ...EMPTY_QUEUE_FILTERS,
                status: filters.status,
              })
            }
            data-testid="s02-reset"
          >
            {t("s02.filters.clear")}
          </Button>
        ) : null}
      </div>

      {onSaveView ? (
        <div className={styles.views}>
          <span className={styles.viewsLabel} id="s02-views">
            {t("s02.views.title")}
          </span>
          <ul className={styles.viewList} aria-labelledby="s02-views">
            {savedViews.map((view) => (
              <li key={view.name} className={styles.viewChip}>
                <button
                  type="button"
                  onClick={() => onFiltersChange(view.filters)}
                >
                  {view.name}
                </button>
                <button
                  type="button"
                  className={styles.viewRemove}
                  onClick={() => onRemoveView?.(view.name)}
                  aria-label={t("s02.views.remove", { name: view.name })}
                >
                  <CloseIcon size={14} />
                </button>
              </li>
            ))}
          </ul>
          {naming ? (
            <form className={styles.viewForm} onSubmit={saveView}>
              <label className="eg-sr-only" htmlFor="s02-view-name">
                {t("s02.views.name")}
              </label>
              <input
                id="s02-view-name"
                className={styles.viewInput}
                value={viewName}
                onChange={(e) => setViewName(e.target.value.slice(0, 40))}
                placeholder={t("s02.views.name")}
                autoFocus
                onKeyDown={(e) => {
                  if (e.key === "Escape") setNaming(false);
                }}
              />
              <Button
                type="submit"
                variant="secondary"
                disabled={!viewName.trim()}
              >
                {t("s02.views.saveConfirm")}
              </Button>
            </form>
          ) : (
            <Button
              variant="quiet"
              icon={<PlusIcon />}
              onClick={() => setNaming(true)}
              data-testid="s02-save-view"
            >
              {t("s02.views.save")}
            </Button>
          )}
        </div>
      ) : null}

      {error ? (
        <Banner
          tone="danger"
          title={error}
          critical
          action={
            onRetry ? (
              <Button
                variant="secondary"
                icon={<RetryIcon />}
                onClick={onRetry}
              >
                {t("staff.retry")}
              </Button>
            ) : undefined
          }
          data-testid="s02-error"
        />
      ) : null}

      {newCount > 0 ? (
        <div className={styles.newRow}>
          <button
            type="button"
            className={styles.newPill}
            onClick={onShowNew}
            data-testid="s02-new-pill"
          >
            {t("s02.newCases", { count: newCount })}
          </button>
        </div>
      ) : null}

      <div className={styles.work} data-preview={previewOpen ? "" : undefined}>
        <div className={styles.tableCol}>
          {loading && items.length === 0 && !error ? (
            <div
              className={styles.loadingRows}
              role="status"
              aria-busy="true"
              aria-label={t("staff.loading")}
              data-testid="s02-loading"
            >
              <Skeleton lines={8} height={44} delay={0} />
            </div>
          ) : !error && items.length === 0 ? (
            <EmptyState
              title={t("s02.empty")}
              action={
                isFiltered(filters) ? (
                  <Button
                    variant="secondary"
                    onClick={() =>
                      onFiltersChange({
                        ...EMPTY_QUEUE_FILTERS,
                        status: filters.status,
                      })
                    }
                  >
                    {t("s02.filters.clear")}
                  </Button>
                ) : undefined
              }
              data-testid="s02-empty"
            >
              {isFiltered(filters) ? null : t("s02.emptySubtitle")}
            </EmptyState>
          ) : items.length > 0 ? (
            <>
              {tableWidth ? (
                <DataTable
                  caption={t("s02.caption")}
                  captionHidden
                  columns={
                    previewOpen
                      ? columns.filter(
                          (c) =>
                            !["reasons", "evidence", "status"].includes(c.key),
                        )
                      : columns
                  }
                  rows={items}
                  rowKey={(row) => row.id}
                  selectedKey={previewId ?? undefined}
                  onRowFocus={(row) => setPreviewId(row.id)}
                  onRowActivate={(row) => onOpenCase(row.id)}
                  data-testid="s02-table"
                />
              ) : (
                <ul
                  className={styles.cards}
                  aria-label={t("s02.caption")}
                  data-testid="s02-cards"
                >
                  {items.map((item) => (
                    <li key={item.id}>
                      <Link
                        href={`/s/cases/${item.id}`}
                        className={styles.card}
                        onClick={(event) => {
                          event.preventDefault();
                          onOpenCase(item.id);
                        }}
                      >
                        <span className={styles.cardTop}>
                          <StatusBadge
                            tone={urgencyTone(item.urgency.level)}
                            label={t(`s02.urgency.${item.urgency.level}`)}
                          />
                          <StatusBadge status={badgeStatus(item.status)} />
                        </span>
                        <span className={`${styles.cardRef} eg-tnum`}>
                          {item.receipt_code}
                        </span>
                        <span>{t(CATEGORY_KEY[item.category.value])}</span>
                        <span className={styles.sub}>
                          {[item.area?.lga_name, item.area?.state_name]
                            .filter(Boolean)
                            .join(", ") || t("s02.noPlace")}
                          {" · "}
                          <span className="eg-tnum">
                            {formatWatDateTime(
                              item.occurred_at ?? item.received_at,
                              locale,
                            )}
                          </span>
                        </span>
                        <Reasons reasons={item.urgency.reasons} />
                      </Link>
                    </li>
                  ))}
                </ul>
              )}
              {tableWidth ? (
                <p className={styles.keys}>{t("s02.keys")}</p>
              ) : null}
              {data?.next_cursor ? (
                <div className={styles.more}>
                  <Button
                    variant="secondary"
                    onClick={onLoadMore}
                    loading={loadingMore}
                    data-testid="s02-load-more"
                  >
                    {t("s02.loadMore")}
                  </Button>
                </div>
              ) : null}
            </>
          ) : null}
        </div>

        {previewOpen && preview ? (
          <Preview item={preview} onOpen={() => onOpenCase(preview.id)} />
        ) : null}
      </div>
    </div>
  );
}

function Reasons({ reasons }: { reasons: QueueItem["urgency"]["reasons"] }) {
  const t = useT();
  if (reasons.length === 0) return null;
  const shown = reasons.slice(0, 2);
  return (
    <span className={styles.reasons}>
      {shown.map((reason) => (
        <span key={reason} className={styles.reason}>
          {t(`s02.reasons.${reason}`)}
        </span>
      ))}
      {reasons.length > shown.length ? (
        <span
          className={styles.reason}
          title={reasons
            .slice(2)
            .map((r) => t(`s02.reasons.${r}`))
            .join(", ")}
        >
          {t("s02.moreReasons", { count: reasons.length - shown.length })}
        </span>
      ) : null}
    </span>
  );
}

function Evidence({ counts }: { counts: QueueItem["media_counts"] }) {
  const t = useT();
  const parts = [
    {
      n: counts.photo,
      Icon: CameraIcon,
      label: t("s02.evidence.photo", { count: counts.photo }),
    },
    {
      n: counts.video,
      Icon: VideoIcon,
      label: t("s02.evidence.video", { count: counts.video }),
    },
    {
      n: counts.audio,
      Icon: MicIcon,
      label: t("s02.evidence.audio", { count: counts.audio }),
    },
  ].filter((p) => p.n > 0);
  if (parts.length === 0)
    return <span className={styles.sub}>{t("s02.evidence.none")}</span>;
  return (
    <span className={styles.evidence}>
      {parts.map(({ n, Icon, label }) => (
        <span key={label} className="eg-tnum">
          <Icon size={16} />
          <span aria-hidden="true">{n}</span>
          <span className="eg-sr-only">{label}</span>
        </span>
      ))}
    </span>
  );
}

/** Wide screens: what a reviewer needs to decide whether to open the case now. */
function Preview({ item, onOpen }: { item: QueueItem; onOpen: () => void }) {
  const t = useT();
  const { locale } = useLocale();
  const area = item.area;
  const place = area
    ? [area.polling_unit_name, area.ward_name, area.lga_name, area.state_name]
        .filter(Boolean)
        .join(", ")
    : t("s02.noPlace");
  const flags = [
    item.flags.possible_duplicate ? t("s02.flags.duplicate") : null,
    item.flags.result_sheet_flags > 0
      ? t("s02.flags.resultSheet", { count: item.flags.result_sheet_flags })
      : null,
    item.flags.possible_names ? t("s02.flags.names") : null,
    item.has_open_question ? t("s02.flags.question") : null,
    item.unread_messages > 0
      ? t("s02.flags.unread", { count: item.unread_messages })
      : null,
  ].filter(Boolean) as string[];

  return (
    <aside
      className={styles.preview}
      aria-label={t("s02.preview.title")}
      data-testid="s02-preview"
    >
      <div className={styles.previewHead}>
        <p className={styles.previewEyebrow}>{t("s02.preview.title")}</p>
        <p className={`${styles.previewRef} eg-tnum`}>{item.receipt_code}</p>
        <div className={styles.previewBadges}>
          <StatusBadge
            tone={urgencyTone(item.urgency.level)}
            label={t(`s02.urgency.${item.urgency.level}`)}
          />
          <StatusBadge status={badgeStatus(item.status)} />
        </div>
      </div>
      {item.urgency.reasons.length ? (
        <div className={styles.reasons}>
          {item.urgency.reasons.map((reason) => (
            <span key={reason} className={styles.reason}>
              {t(`s02.reasons.${reason}`)}
            </span>
          ))}
        </div>
      ) : null}
      <dl className={styles.facts}>
        <div>
          <dt>{t("s02.columns.category")}</dt>
          <dd>{t(CATEGORY_KEY[item.category.value])}</dd>
        </div>
        <div>
          <dt>{t("s02.preview.place")}</dt>
          <dd>{place}</dd>
        </div>
        <div>
          <dt>{t("s02.columns.occurred")}</dt>
          <dd className="eg-tnum">
            {item.occurred_at
              ? formatWatDateTime(item.occurred_at, locale)
              : t("s02.preview.notGiven")}
          </dd>
        </div>
        <div>
          <dt>{t("s02.preview.received")}</dt>
          <dd className="eg-tnum">
            {formatWatDateTime(item.received_at, locale)}
          </dd>
        </div>
        <div>
          <dt>{t("s02.filters.channel")}</dt>
          <dd>{t(`s02.channel.${item.channel}`)}</dd>
        </div>
        <div>
          <dt>{t("s02.columns.evidence")}</dt>
          <dd>
            <Evidence counts={item.media_counts} />
          </dd>
        </div>
      </dl>
      {flags.length ? (
        <ul className={styles.flags}>
          {flags.map((flag) => (
            <li key={flag}>{flag}</li>
          ))}
        </ul>
      ) : null}
      <Link
        href={`/s/cases/${item.id}`}
        className={styles.open}
        onClick={(event) => {
          event.preventDefault();
          onOpen();
        }}
        data-testid="s02-open"
      >
        {t("s02.preview.open")}
        <ArrowRightIcon size={18} />
      </Link>
    </aside>
  );
}
