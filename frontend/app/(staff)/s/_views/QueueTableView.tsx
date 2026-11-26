"use client";

import Link from "next/link";
import { useEffect, useLayoutEffect, useMemo, useRef, useState, type FormEvent, type KeyboardEvent } from "react";
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
  Count,
  EmptyState,
  SegmentedControl,
  Skeleton,
  StatusBadge,
  StatusShape,
  Tag,
  type ReportStatus as BadgeStatus,
  type StatusTone,
} from "../../../../ui";
import { formatWatDateTime } from "../../../../ui/format";
import { useMediaQuery } from "../../../../ui/hooks";
import { animate } from "../../../../ui/motion";
import {
  CameraIcon,
  ChevronDownIcon,
  CloseIcon,
  MicIcon,
  RetryIcon,
  SlidersIcon,
  SortDownIcon,
  SortUpIcon,
  VideoIcon,
} from "../../../../ui/icons";
import { StaffPopover } from "../../../../ui/StaffShell/Popover";
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
  /** Text from the header search that narrows the rows. */
  search?: string;
  onClearSearch?: () => void;
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

/** Filters other than status and priority, which have their own controls. */
function moreFilterCount(f: QueueTableFilters): number {
  return (f.category ? 1 : 0) + f.channel.length + (f.hasEvidence ? 1 : 0);
}

function isFiltered(f: QueueTableFilters): boolean {
  return f.urgency.length > 0 || moreFilterCount(f) > 0;
}

function toggle<T>(list: T[], value: T): T[] {
  return list.includes(value)
    ? list.filter((v) => v !== value)
    : [...list, value];
}

const clockFormat = new Intl.DateTimeFormat("en-GB", {
  hour: "2-digit",
  minute: "2-digit",
  hourCycle: "h23",
  timeZone: "Africa/Lagos",
});

type SortKey = "urgency" | "reference" | "time";
type Sort = { key: SortKey; dir: 1 | -1 };

/** Priority as a shape and a word, so it never depends on colour alone. */
function Priority({ level }: { level: Urgency }) {
  const t = useT();
  return (
    <span className={styles.pri} data-level={level}>
      <StatusShape tone={urgencyTone(level)} size={12} />
      {t(`s02.urgency.${level}`)}
    </span>
  );
}

/** S-02 review queue: status tabs, priority, filters, the case table and, on wide screens, a preview. */
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
  search = "",
  onClearSearch,
  initialPreviewId,
  "data-testid": testId = "queue-table-view",
}: QueueTableViewProps) {
  const t = useT();
  const { locale } = useLocale();
  const [previewId, setPreviewId] = useState<string | null>(
    initialPreviewId ?? null,
  );
  const [sort, setSort] = useState<Sort>({ key: "urgency", dir: 1 });
  const bodyRef = useRef<HTMLTableSectionElement>(null);

  const rawItems = useMemo(() => data?.items ?? [], [data]);
  const items = useMemo(() => {
    const factor = sort.dir;
    const value = (row: QueueItem): string | number =>
      sort.key === "urgency"
        ? URGENCIES.indexOf(row.urgency.level)
        : sort.key === "reference"
          ? row.receipt_code
          : Date.parse(row.occurred_at ?? row.received_at);
    // Priority keeps the server's order inside a level (newest first); other sorts are plain.
    return sort.key === "urgency" && sort.dir === 1
      ? rawItems
      : [...rawItems].sort((a, b) => {
          const va = value(a);
          const vb = value(b);
          if (va === vb) return 0;
          return (va < vb ? -1 : 1) * factor;
        });
  }, [rawItems, sort]);

  // When the "n new" pill is pressed, the rows already on screen step down to make room (FLIP:
  // measured, then moved back to where they were and released), and the new rows fade in.
  const tops = useRef<Map<string, number>>(new Map());
  const revealing = useRef(false);
  useLayoutEffect(() => {
    const rows = Array.from(bodyRef.current?.querySelectorAll<HTMLElement>("tr[data-row-key]") ?? []);
    const next = new Map<string, number>();
    for (const row of rows) next.set(row.dataset.rowKey ?? "", row.getBoundingClientRect().top + window.scrollY);
    if (revealing.current && tops.current.size > 0) {
      revealing.current = false;
      for (const row of rows) {
        const key = row.dataset.rowKey ?? "";
        const was = tops.current.get(key);
        if (was === undefined) {
          animate(row, [{ opacity: 0 }, { opacity: 1 }], { duration: 240, easing: "out" });
        } else {
          const dy = was - (next.get(key) ?? was);
          if (Math.abs(dy) > 1) animate(row, [{ transform: `translateY(${dy}px)` }, { transform: "translateY(0)" }], { duration: 240, easing: "out" });
        }
      }
    }
    tops.current = next;
  });

  // Rows that were not here at the last render glow once (a cue, not a jump).
  const seen = useRef<Set<string> | null>(null);
  const [fresh, setFresh] = useState<Set<string>>(new Set());
  useEffect(() => {
    const ids = new Set(rawItems.map((item) => item.id));
    if (seen.current && ids.size > 0) {
      const added = [...ids].filter((id) => !seen.current!.has(id));
      if (added.length > 0 && seen.current.size > 0) {
        const start = window.setTimeout(() => setFresh(new Set(added)), 0);
        const stop = window.setTimeout(() => setFresh(new Set()), 1800);
        seen.current = ids;
        return () => {
          window.clearTimeout(start);
          window.clearTimeout(stop);
        };
      }
    }
    seen.current = ids;
  }, [rawItems]);

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

  const wide = useMediaQuery("(min-width: 1400px)");
  const roomy = useMediaQuery("(min-width: 640px)", true);
  /** Phones get cards; the table needs at least a tablet's width. */
  const tableWidth = useMediaQuery("(min-width: 768px)", true);
  const preview = items.find((item) => item.id === previewId) ?? null;
  const previewOpen = wide && preview !== null && tableWidth;
  const set = (patch: Partial<QueueTableFilters>) =>
    onFiltersChange({ ...filters, ...patch });

  const resetMore = () =>
    onFiltersChange({
      ...filters,
      category: "",
      channel: [],
      hasEvidence: false,
    });
  const resetAll = () => {
    onFiltersChange({ ...EMPTY_QUEUE_FILTERS, status: filters.status });
    onClearSearch?.();
  };

  const tokens: Array<{ key: string; label: string; value: string; remove: () => void }> = [];
  if (search)
    tokens.push({
      key: "search",
      label: t("s02.filters.search"),
      value: search,
      remove: () => onClearSearch?.(),
    });
  if (filters.category)
    tokens.push({
      key: "category",
      label: t("s02.filters.category"),
      value: t(CATEGORY_KEY[filters.category]),
      remove: () => set({ category: "" }),
    });
  for (const channel of filters.channel)
    tokens.push({
      key: `channel-${channel}`,
      label: t("s02.filters.channel"),
      value: t(`s02.channel.${channel}`),
      remove: () => set({ channel: filters.channel.filter((c) => c !== channel) }),
    });
  if (filters.hasEvidence)
    tokens.push({
      key: "evidence",
      label: t("s02.columns.evidence"),
      value: t("s02.filters.hasEvidence"),
      remove: () => set({ hasEvidence: false }),
    });

  const priorityValue = filters.urgency.length === 1 ? filters.urgency[0] : "any";
  const filtering = isFiltered(filters) || Boolean(search);
  const priorityOptions = [
    { value: "any", label: t("s02.filters.any") },
    ...URGENCIES.map((level) => ({
      value: level as string,
      label: t(`s02.urgency.${level}`),
    })),
  ];

  function onTabKey(event: KeyboardEvent, index: number) {
    const next =
      event.key === "ArrowRight"
        ? (index + 1) % TABS.length
        : event.key === "ArrowLeft"
          ? (index - 1 + TABS.length) % TABS.length
          : event.key === "Home"
            ? 0
            : event.key === "End"
              ? TABS.length - 1
              : -1;
    if (next < 0) return;
    event.preventDefault();
    set({ status: TABS[next] });
    (event.currentTarget.parentElement?.children[next] as HTMLElement | undefined)?.focus();
  }

  function onRowKey(event: KeyboardEvent<HTMLElement>, row: QueueItem, index: number) {
    if (event.altKey || event.ctrlKey || event.metaKey) return;
    const focusRow = (next: number) => {
      const rows = bodyRef.current?.querySelectorAll<HTMLElement>("[data-row]");
      rows?.[Math.max(0, Math.min((rows?.length ?? 1) - 1, next))]?.focus();
    };
    switch (event.key) {
      case "Enter":
      case " ":
        event.preventDefault();
        onOpenCase(row.id);
        break;
      case "ArrowDown":
      case "j":
        event.preventDefault();
        focusRow(index + 1);
        break;
      case "ArrowUp":
      case "k":
        event.preventDefault();
        focusRow(index - 1);
        break;
      case "Home":
        event.preventDefault();
        focusRow(0);
        break;
      case "End":
        event.preventDefault();
        focusRow(items.length - 1);
        break;
    }
  }

  const sortHead = (key: SortKey, label: string) => {
    const active = sort.key === key;
    return (
      <th
        scope="col"
        aria-sort={active ? (sort.dir === 1 ? "ascending" : "descending") : "none"}
        data-sorted={active || undefined}
        className={key === "time" ? styles.thTime : undefined}
      >
        <button
          type="button"
          className={styles.sortButton}
          onClick={() =>
            setSort(active ? { key, dir: sort.dir === 1 ? -1 : 1 } : { key, dir: 1 })
          }
          data-testid={`s02-sort-${key}`}
        >
          {label}
          {active ? (
            sort.dir === 1 ? <SortDownIcon size={14} /> : <SortUpIcon size={14} />
          ) : null}
        </button>
      </th>
    );
  };

  return (
    <div className={styles.page} data-testid={testId}>
      <div
        className={styles.tabs}
        role="tablist"
        aria-label={t("s02.tabsLabel")}
        data-testid="s02-tabs"
      >
        {TABS.map((tab, index) => {
          const selected = filters.status === tab;
          return (
            <button
              key={tab}
              type="button"
              role="tab"
              aria-selected={selected}
              tabIndex={selected ? 0 : -1}
              className={styles.tab}
              onClick={() => set({ status: tab })}
              onKeyDown={(event) => onTabKey(event, index)}
              data-testid={`s02-tab-${tab}`}
            >
              {tabLabel(tab)}
              <Count value={countOf(tab)} />
            </button>
          );
        })}
      </div>

      <div
        className={styles.filters}
        role="group"
        aria-label={t("s02.filters.label")}
      >
        {roomy ? (
          <div className={styles.priority}>
            <span className={styles.priorityLabel}>{t("s02.filters.priority")}</span>
            <SegmentedControl
              label={t("s02.filters.priority")}
              value={priorityValue}
              onChange={(value) =>
                set({ urgency: value === "any" ? [] : [value as Urgency] })
              }
              options={priorityOptions}
              data-testid="s02-priority"
            />
          </div>
        ) : (
          <StaffPopover
            label={t("s02.filters.priority")}
            trigger={(props) => (
              <button
                type="button"
                className={styles.control}
                {...props}
                data-testid="s02-priority-button"
              >
                {t("s02.filters.priority")}:{" "}
                {priorityOptions.find((o) => o.value === priorityValue)?.label}
                <ChevronDownIcon size={16} />
              </button>
            )}
          >
            {(close) => (
              <ul className={styles.viewList}>
                {priorityOptions.map((option) => (
                  <li key={option.value}>
                    <button
                      type="button"
                      className={styles.viewApply}
                      aria-pressed={priorityValue === option.value}
                      data-on={priorityValue === option.value || undefined}
                      onClick={() => {
                        set({
                          urgency:
                            option.value === "any"
                              ? []
                              : [option.value as Urgency],
                        });
                        close();
                      }}
                    >
                      {option.label}
                    </button>
                  </li>
                ))}
              </ul>
            )}
          </StaffPopover>
        )}

        <StaffPopover
          label={t("s02.filters.panel")}
          trigger={(props) => (
            <button
              type="button"
              className={styles.control}
              {...props}
              data-testid="s02-filters-button"
            >
              <SlidersIcon size={18} />
              {t("s02.filters.more")}
              {moreFilterCount(filters) > 0 ? (
                <Count value={moreFilterCount(filters)} tone="needs" />
              ) : null}
            </button>
          )}
        >
          {() => (
            <div className={styles.panel}>
              <label className={styles.panelField}>
                <span>{t("s02.filters.category")}</span>
                <select
                  className={styles.select}
                  value={filters.category}
                  onChange={(e) =>
                    set({ category: e.target.value as Category | "" })
                  }
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
              <fieldset className={styles.panelField}>
                <legend>{t("s02.filters.channel")}</legend>
                {CHANNELS.map((channel) => (
                  <label key={channel} className={styles.check}>
                    <input
                      type="checkbox"
                      checked={filters.channel.includes(channel)}
                      onChange={() =>
                        set({ channel: toggle(filters.channel, channel) })
                      }
                      data-testid={`s02-channel-${channel}`}
                    />
                    {t(`s02.channel.${channel}`)}
                  </label>
                ))}
              </fieldset>
              <label className={styles.check}>
                <input
                  type="checkbox"
                  checked={filters.hasEvidence}
                  onChange={() => set({ hasEvidence: !filters.hasEvidence })}
                  data-testid="s02-has-media"
                />
                {t("s02.filters.hasEvidence")}
              </label>
              {moreFilterCount(filters) > 0 ? (
                <button
                  type="button"
                  className={styles.linkButton}
                  onClick={resetMore}
                >
                  {t("s02.filters.clearAll")}
                </button>
              ) : null}
            </div>
          )}
        </StaffPopover>

        {tokens.map((token) => (
          <span key={token.key} className={styles.token}>
            <em>{token.label}</em> {token.value}
            <button
              type="button"
              onClick={token.remove}
              aria-label={t("s02.filters.removeToken", {
                name: `${token.label} ${token.value}`,
              })}
            >
              <CloseIcon size={14} />
            </button>
          </span>
        ))}
        {filtering ? (
          <button
            type="button"
            className={styles.clear}
            onClick={resetAll}
            data-testid="s02-reset"
          >
            {t("s02.filters.clearAll")}
          </button>
        ) : null}

        {onSaveView ? (
          <SavedViews
            views={savedViews}
            onApply={(view) => onFiltersChange(view.filters)}
            onSave={onSaveView}
            onRemove={onRemoveView}
          />
        ) : null}
      </div>

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
            onClick={() => {
              revealing.current = true;
              onShowNew?.();
            }}
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
                filtering ? (
                  <Button variant="secondary" onClick={resetAll}>
                    {t("s02.filters.clear")}
                  </Button>
                ) : undefined
              }
              data-testid="s02-empty"
            >
              {filtering ? null : t("s02.emptySubtitle")}
            </EmptyState>
          ) : items.length > 0 ? (
            <>
              {tableWidth ? (
                <div
                  className={styles.tableCard}
                  role="region"
                  aria-label={t("s02.caption")}
                  data-testid="s02-table"
                >
                  <table className={styles.table}>
                    <caption className="eg-sr-only">{t("s02.caption")}</caption>
                    <colgroup>
                      <col className={styles.colPri} />
                      <col className={styles.colRef} />
                      <col />
                      <col className={styles.colPlace} />
                      <col className={styles.colTime} />
                      <col className={styles.colStatus} />
                    </colgroup>
                    <thead>
                      <tr>
                        {sortHead("urgency", t("s02.columns.priority"))}
                        {sortHead("reference", t("s02.columns.reference"))}
                        <th scope="col">{t("s02.columns.category")}</th>
                        <th scope="col">{t("s02.columns.location")}</th>
                        {sortHead("time", t("s02.columns.time"))}
                        <th scope="col">{t("s02.columns.status")}</th>
                      </tr>
                    </thead>
                    <tbody ref={bodyRef}>
                      {items.map((row, index) => (
                        <tr
                          key={row.id}
                          data-row
                          data-row-key={row.id}
                          tabIndex={0}
                          aria-selected={previewId === row.id}
                          data-new={fresh.has(row.id) || undefined}
                          onClick={() => onOpenCase(row.id)}
                          onFocus={() => setPreviewId(row.id)}
                          onKeyDown={(event) => onRowKey(event, row, index)}
                        >
                          <td>
                            <Priority level={row.urgency.level} />
                          </td>
                          <th scope="row" className={`${styles.ref} eg-tnum`}>
                            {row.receipt_code}
                          </th>
                          <td>
                            <span className={styles.place}>
                              <span className={styles.ward}>
                                {t(CATEGORY_KEY[row.category.value])}
                              </span>
                              {row.simulated ? (
                                <span className={styles.sub}>
                                  {t("s02.simulated")}
                                </span>
                              ) : null}
                            </span>
                          </td>
                          <td>
                            <Place item={row} />
                          </td>
                          <td
                            className={`${styles.time} eg-tnum`}
                            title={formatWatDateTime(
                              row.occurred_at ?? row.received_at,
                              locale,
                            )}
                          >
                            {clockFormat.format(
                              new Date(row.occurred_at ?? row.received_at),
                            )}
                          </td>
                          <td>
                            <StatusBadge status={badgeStatus(row.status)} />
                          </td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              ) : (
                <ul
                  className={styles.cards}
                  aria-label={t("s02.caption")}
                  data-testid="s02-cards"
                >
                  {items.map((item) => (
                    <li key={item.id} data-new={fresh.has(item.id) || undefined}>
                      <Link
                        href={`/s/cases/${item.id}`}
                        className={styles.card}
                        onClick={(event) => {
                          event.preventDefault();
                          onOpenCase(item.id);
                        }}
                      >
                        <span className={styles.cardTop}>
                          <Priority level={item.urgency.level} />
                          <span className={`${styles.cardRef} eg-tnum`}>
                            {item.receipt_code}
                          </span>
                          <span className={`${styles.cardTime} eg-tnum`}>
                            {clockFormat.format(
                              new Date(item.occurred_at ?? item.received_at),
                            )}
                          </span>
                        </span>
                        <span className={styles.cardTitle}>
                          {t(CATEGORY_KEY[item.category.value])}
                        </span>
                        <span className={styles.cardBottom}>
                          <span className={styles.cardPlace}>
                            {[item.area?.ward_name, item.area?.lga_name ?? item.area?.state_name]
                              .filter(Boolean)
                              .join(", ") || t("s02.noPlace")}
                          </span>
                          <StatusBadge status={badgeStatus(item.status)} />
                        </span>
                      </Link>
                    </li>
                  ))}
                </ul>
              )}
              {tableWidth ? (
                <p className={styles.keys}>
                  <span>
                    <kbd className={styles.kbd}>J</kbd>
                    <kbd className={styles.kbd}>K</kbd> {t("s02.keysMove")}{" "}
                    <kbd className={styles.kbd}>Enter</kbd> {t("s02.keysOpen")}
                  </span>
                  <span className={styles.shown}>
                    {t("s02.shown", {
                      shown: items.length,
                      total: countOf("all"),
                    })}
                  </span>
                </p>
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
          <Preview
            item={preview}
            onOpen={() => onOpenCase(preview.id)}
            onClose={() => setPreviewId(null)}
          />
        ) : null}
      </div>
    </div>
  );
}

/** Ward on the first line, local government area on the second. */
function Place({ item }: { item: QueueItem }) {
  const t = useT();
  const area = item.area;
  if (!area) return <span className={styles.sub}>{t("s02.noPlace")}</span>;
  const ward = area.ward_name ?? area.lga_name ?? area.state_name;
  const second = area.ward_name ? (area.lga_name ?? area.state_name) : area.lga_name ? area.state_name : null;
  return (
    <span className={styles.place}>
      <span className={styles.ward}>{ward}</span>
      {second ? <span className={styles.sub}>{second}</span> : null}
    </span>
  );
}

function SavedViews({
  views,
  onApply,
  onSave,
  onRemove,
}: {
  views: SavedQueueView[];
  onApply: (view: SavedQueueView) => void;
  onSave: (name: string) => void;
  onRemove?: (name: string) => void;
}) {
  const t = useT();
  const [name, setName] = useState("");

  function submit(event: FormEvent) {
    event.preventDefault();
    const trimmed = name.trim();
    if (!trimmed) return;
    onSave(trimmed);
    setName("");
  }

  return (
    <StaffPopover
      label={t("s02.views.title")}
      placement="below-end"
      className={styles.viewsRoot}
      trigger={(props) => (
        <button
          type="button"
          className={styles.control}
          {...props}
          data-testid="s02-views-button"
        >
          {t("s02.views.title")}
          <ChevronDownIcon size={16} />
        </button>
      )}
    >
      {(close) => (
        <div className={styles.panel}>
          {views.length === 0 ? (
            <p className={styles.panelEmpty}>{t("s02.views.empty")}</p>
          ) : (
            <ul className={styles.viewList}>
              {views.map((view) => (
                <li key={view.name} className={styles.viewRow}>
                  <button
                    type="button"
                    className={styles.viewApply}
                    onClick={() => {
                      onApply(view);
                      close();
                    }}
                  >
                    {view.name}
                  </button>
                  <button
                    type="button"
                    className={styles.viewRemove}
                    onClick={() => onRemove?.(view.name)}
                    aria-label={t("s02.views.remove", { name: view.name })}
                  >
                    <CloseIcon size={14} />
                  </button>
                </li>
              ))}
            </ul>
          )}
          <form className={styles.viewForm} onSubmit={submit}>
            <label className="eg-sr-only" htmlFor="s02-view-name">
              {t("s02.views.name")}
            </label>
            <input
              id="s02-view-name"
              className={styles.viewInput}
              value={name}
              onChange={(e) => setName(e.target.value.slice(0, 40))}
              placeholder={t("s02.views.name")}
              data-testid="s02-view-name"
            />
            <Button
              type="submit"
              variant="secondary"
              disabled={!name.trim()}
              data-testid="s02-save-view"
            >
              {t("s02.views.saveConfirm")}
            </Button>
          </form>
        </div>
      )}
    </StaffPopover>
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
function Preview({
  item,
  onOpen,
  onClose,
}: {
  item: QueueItem;
  onOpen: () => void;
  onClose: () => void;
}) {
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
        <h2 className={`${styles.previewRef} eg-tnum`}>{item.receipt_code}</h2>
        <button
          type="button"
          className={styles.previewClose}
          onClick={onClose}
          aria-label={t("s02.preview.close")}
        >
          <CloseIcon size={20} />
        </button>
      </div>
      <div className={styles.previewBadges}>
        <StatusBadge
          tone={urgencyTone(item.urgency.level)}
          label={t(`s02.urgency.${item.urgency.level}`)}
        />
        <StatusBadge status={badgeStatus(item.status)} />
      </div>
      {item.urgency.reasons.length ? (
        <div className={styles.reasons}>
          {item.urgency.reasons.map((reason) => (
            <Tag key={reason}>{t(`s02.reasons.${reason}`)}</Tag>
          ))}
        </div>
      ) : null}
      <dl className={styles.facts}>
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
            <li key={flag}>
              <StatusShape tone="attn" size={10} />
              {flag}
            </li>
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
      </Link>
      <p className={styles.orPress}>
        {t("s02.preview.orPress")} <kbd className={styles.kbd}>Enter</kbd>
      </p>
    </aside>
  );
}
