"use client";

import Link from "next/link";
import type { QueueItem, QueueResponse, Urgency } from "../../../../lib/api/types";
import { useT } from "../../../../lib/i18n/client";
import { Banner, EmptyState, MetricTile, StatusBadge, type StatusTone } from "../../../../ui";
import { CameraIcon, MicIcon, VideoIcon } from "../../../../ui/icons";
import styles from "./QueueView.module.css";

export interface QueueFilters {
  urgency?: string;
  status?: string;
  category?: string;
  channel?: string;
  hasEvidence?: boolean;
}

export interface QueueViewProps {
  data: QueueResponse | null;
  loading: boolean;
  error: string | null;
  selectedId?: string | null;
  filters: QueueFilters;
  onFilterChange: (filters: QueueFilters) => void;
  onSelectCase?: (id: string) => void;
  "data-testid"?: string;
}

export function QueueView({
  data,
  loading,
  error,
  selectedId,
  filters,
  onFilterChange,
  onSelectCase,
  "data-testid": testId = "queue-view",
}: QueueViewProps) {
  const t = useT();

  const handleUrgencyChange = (e: React.ChangeEvent<HTMLSelectElement>) => {
    onFilterChange({ ...filters, urgency: e.target.value || undefined });
  };

  const handleStatusChange = (e: React.ChangeEvent<HTMLSelectElement>) => {
    onFilterChange({ ...filters, status: e.target.value || undefined });
  };

  const urgencyTone = (level: Urgency): StatusTone => {
    switch (level) {
      case "urgent":
        return "danger";
      case "high":
        return "attn";
      case "normal":
      case "low":
      default:
        return "wait";
    }
  };

  const items = data?.items ?? [];
  const counts = data?.counts ?? { received: 0, in_review: 0, question: 0 };

  return (
    <div className={styles.container} data-testid={testId}>
      {/* Metrics Row */}
      <div className={styles.metrics}>
        <MetricTile
          value={counts.received ?? 0}
          label={t("s02.counts.received", { count: counts.received ?? 0 })}
          period={t("s05.today")}
        />
        <MetricTile
          value={counts.in_review ?? 0}
          label={t("s02.counts.inReview", { count: counts.in_review ?? 0 })}
          period={t("s05.today")}
        />
        <MetricTile
          value={counts.question ?? 0}
          label={t("s02.counts.question", { count: counts.question ?? 0 })}
          period={t("s05.today")}
        />
      </div>

      {/* Filter Bar */}
      <div className={styles.filterBar}>
        <div className={styles.filterGroup}>
          <label htmlFor="filter-urgency" className="eg-sr-only">
            {t("s02.filters.urgency")}
          </label>
          <select
            id="filter-urgency"
            className={styles.select}
            value={filters.urgency ?? ""}
            onChange={handleUrgencyChange}
          >
            <option value="">{t("s02.filters.all")} {t("s02.filters.urgency")}</option>
            <option value="urgent">{t("s02.urgency.urgent")}</option>
            <option value="high">{t("s02.urgency.high")}</option>
            <option value="normal">{t("s02.urgency.normal")}</option>
            <option value="low">{t("s02.urgency.low")}</option>
          </select>
        </div>

        <div className={styles.filterGroup}>
          <label htmlFor="filter-status" className="eg-sr-only">
            {t("s02.filters.status")}
          </label>
          <select
            id="filter-status"
            className={styles.select}
            value={filters.status ?? ""}
            onChange={handleStatusChange}
          >
            <option value="">{t("s02.filters.all")} {t("s02.filters.status")}</option>
            <option value="received">{t("ui.status.received")}</option>
            <option value="in_review">{t("ui.status.inReview")}</option>
            <option value="question">{t("ui.status.question")}</option>
            <option value="closed">{t("ui.status.closed")}</option>
          </select>
        </div>
      </div>

      {/* Error State */}
      {error && (
        <Banner tone="danger" title={error} critical />
      )}

      {/* Loading State */}
      {loading && !error && items.length === 0 && (
        <div style={{ padding: "var(--s-4)", textAlign: "center", color: "var(--ink-2)" }}>
          {t("staff.loading")}
        </div>
      )}

      {/* Empty State */}
      {!loading && !error && items.length === 0 && (
        <EmptyState
          title={t("s02.empty")}
          action={
            <button
              type="button"
              className="eg-btn eg-btn-quiet"
              onClick={() => onFilterChange({})}
            >
              {t("s02.filters.clear")}
            </button>
          }
        />
      )}

      {/* Queue List */}
      <div className={styles.queueList}>
        {items.map((item: QueueItem) => {
          const isSelected = selectedId === item.id;
          const urgencyLabel = t(`s02.urgency.${item.urgency.level}` as const);
          const badgeStatus =
            item.status === "in_review"
              ? "in-review"
              : item.status;

          return (
            <Link
              key={item.id}
              href={`/s/cases/${item.id}`}
              className={styles.queueCard}
              data-selected={isSelected}
              onClick={(e) => {
                if (onSelectCase) {
                  e.preventDefault();
                  onSelectCase(item.id);
                }
              }}
            >
              <div className={styles.cardTop}>
                <span className={styles.cardRef}>{item.receipt_code}</span>
                <div className={styles.badgeGroup}>
                  <StatusBadge
                    tone={urgencyTone(item.urgency.level)}
                    label={urgencyLabel}
                  />
                  <StatusBadge
                    status={badgeStatus as "received" | "in-review" | "question" | "closed" | "withdrawn"}
                  />
                </div>
              </div>

              {item.urgency.reasons.length > 0 && (
                <div className={styles.reasonsList}>
                  {item.urgency.reasons.map((reason) => (
                    <span key={reason} className={styles.reasonPill}>
                      {t(`s02.reasons.${reason}` as const)}
                    </span>
                  ))}
                </div>
              )}

              <div className={styles.cardMeta}>
                <span>
                  {item.area?.lga_name || item.area?.state_name || ""}
                  {item.area?.ward_name ? ` · ${item.area.ward_name}` : ""}
                </span>

                <div className={styles.mediaIcons}>
                  {item.media_counts.photo > 0 && (
                    <span title={`${item.media_counts.photo} photos`}>
                      <CameraIcon size={14} />
                    </span>
                  )}
                  {item.media_counts.video > 0 && (
                    <span title={`${item.media_counts.video} videos`}>
                      <VideoIcon size={14} />
                    </span>
                  )}
                  {item.media_counts.audio > 0 && (
                    <span title={`${item.media_counts.audio} audio`}>
                      <MicIcon size={14} />
                    </span>
                  )}
                  {item.flags.possible_duplicate && (
                    <span className={styles.flagPill}>Duplicate</span>
                  )}
                  {item.flags.result_sheet_flags > 0 && (
                    <span className={styles.flagPill}>Result flag</span>
                  )}
                </div>
              </div>
            </Link>
          );
        })}
      </div>
    </div>
  );
}
