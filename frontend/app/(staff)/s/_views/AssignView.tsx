"use client";

import { useState } from "react";
import type { AssignmentListResponse, ReviewerWorkload, Urgency } from "../../../../lib/api/types";
import { useT } from "../../../../lib/i18n/client";
import { Banner, Button, EmptyState, StatusBadge } from "../../../../ui";
import styles from "./AssignView.module.css";

export interface AssignViewProps {
  data: AssignmentListResponse | null;
  loading: boolean;
  error: string | null;
  assigning: boolean;
  successMessage?: string | null;
  onAssignBulk?: (items: Array<{ report_id: string; reviewer_id: string; version: number }>) => void;
  "data-testid"?: string;
}

export function AssignView({
  data,
  loading,
  error,
  assigning,
  successMessage,
  onAssignBulk,
  "data-testid": testId = "assign-view",
}: AssignViewProps) {
  const t = useT();

  const [selectedIds, setSelectedIds] = useState<Set<string>>(new Set());
  const [targetReviewer, setTargetReviewer] = useState<string>("suggested");

  const items = data?.items || [];
  const reviewers: ReviewerWorkload[] = data?.reviewers || [];

  const handleToggleSelect = (id: string) => {
    const next = new Set(selectedIds);
    if (next.has(id)) next.delete(id);
    else next.add(id);
    setSelectedIds(next);
  };

  const handleSelectAll = () => {
    if (selectedIds.size === items.length) {
      setSelectedIds(new Set());
    } else {
      setSelectedIds(new Set(items.map((it) => it.id)));
    }
  };

  const handleBulkSubmit = () => {
    if (!onAssignBulk || selectedIds.size === 0) return;
    const toAssign = items
      .filter((it) => selectedIds.has(it.id))
      .map((it) => ({
        report_id: it.id,
        reviewer_id:
          targetReviewer === "suggested"
            ? it.suggested_reviewer?.id || reviewers[0]?.id || ""
            : targetReviewer,
        version: it.version,
      }));
    onAssignBulk(toAssign);
    setSelectedIds(new Set());
  };

  const urgencyTone = (level: Urgency) => {
    switch (level) {
      case "urgent":
        return "danger" as const;
      case "high":
        return "attn" as const;
      default:
        return "wait" as const;
    }
  };

  return (
    <div className={styles.container} data-testid={testId}>
      {error && <Banner tone="danger" title={error} critical />}
      {successMessage && <Banner tone="ok" title={successMessage} />}

      {/* Reviewer workload cards */}
      <div className={styles.topSection}>
        <div className={styles.reviewersCard}>
          <h2 className={styles.reviewersTitle}>
            {t("s04.reviewers", { count: reviewers.length })}
          </h2>
          <div className={styles.reviewersList}>
            {reviewers.map((rev) => (
              <div key={rev.id} className={styles.reviewerRow}>
                <div>
                  {rev.active_now && <span className={styles.activeDot} title={t("s04.activeNow")} />}
                  <strong>{rev.display_name}</strong>
                  {rev.areas.length > 0 && (
                    <span style={{ color: "var(--ink-2)", marginLeft: "var(--s-2)" }}>
                      ({rev.areas.join(", ")})
                    </span>
                  )}
                </div>
                <div>
                  <span className="eg-tnum">
                    {t("s04.openCases", { count: rev.open_cases, urgent: rev.urgent_open })}
                  </span>
                </div>
              </div>
            ))}
          </div>
        </div>
      </div>

      {/* Bulk assignment toolbar */}
      {items.length > 0 && (
        <div className={styles.bulkBar}>
          <div className={styles.bulkControls}>
            <input
              type="checkbox"
              id="select-all-cases"
              checked={selectedIds.size > 0 && selectedIds.size === items.length}
              onChange={handleSelectAll}
              aria-label={t("s04.selectAll")}
            />
            <label htmlFor="select-all-cases">
              {t("s04.selectAll")} ({selectedIds.size} / {items.length})
            </label>
          </div>

          <div className={styles.bulkControls}>
            <label htmlFor="target-reviewer" className="eg-sr-only">
              {t("s04.assignTo")}
            </label>
            <select
              id="target-reviewer"
              className="eg-select"
              value={targetReviewer}
              onChange={(e) => setTargetReviewer(e.target.value)}
            >
              <option value="suggested">{t("s04.takeSuggested")}</option>
              {reviewers.map((rev) => (
                <option key={rev.id} value={rev.id}>
                  {rev.display_name} ({rev.open_cases} open)
                </option>
              ))}
            </select>

            <Button
              type="button"
              variant="primary"
              disabled={selectedIds.size === 0 || assigning}
              loading={assigning}
              onClick={handleBulkSubmit}
            >
              {t("s04.bulkAssign", { count: selectedIds.size })}
            </Button>
          </div>
        </div>
      )}

      {/* Loading State */}
      {loading && !error && items.length === 0 && (
        <div style={{ padding: "var(--s-4)", textAlign: "center", color: "var(--ink-2)" }}>
          {t("staff.loading")}
        </div>
      )}

      {/* Empty State */}
      {!loading && !error && items.length === 0 && (
        <EmptyState title={t("s04.unassignedCount", { count: 0 })} />
      )}

      {/* Cases list */}
      <div className={styles.casesList}>
        {items.map((item) => {
          const isSelected = selectedIds.has(item.id);
          const urgencyLabel = t(`s02.urgency.${item.urgency.level}` as const);

          return (
            <div key={item.id} className={styles.caseRow}>
              <div>
                <input
                  type="checkbox"
                  checked={isSelected}
                  onChange={() => handleToggleSelect(item.id)}
                  aria-label={`Select case ${item.receipt_code}`}
                />
              </div>

              <div className={styles.caseInfo}>
                <div style={{ display: "flex", alignItems: "center", gap: "var(--s-2)", flexWrap: "wrap" }}>
                  <strong style={{ fontFamily: "monospace" }}>{item.receipt_code}</strong>
                  <StatusBadge
                    tone={urgencyTone(item.urgency.level)}
                    label={urgencyLabel}
                  />
                  {item.suggested_reviewer && (
                    <span className={styles.suggestedTag}>
                      {t("s04.suggestedBadge", { name: item.suggested_reviewer.display_name })}
                      <span style={{ color: "var(--ink-2)", fontWeight: 400 }}>
                        (
                        {item.suggested_reviewer.reason === "fewest_open_cases_in_area"
                          ? t("s04.reasonFewestInArea")
                          : item.suggested_reviewer.reason === "same_area"
                          ? t("s04.reasonArea")
                          : t("s04.reasonFewest")}
                        )
                      </span>
                    </span>
                  )}
                </div>

                <div className={styles.caseMeta}>
                  <span>{item.category.value}</span>
                  <span>·</span>
                  <span>
                    {item.area?.lga_name || item.area?.state_name || ""}
                    {item.area?.ward_name ? ` · ${item.area.ward_name}` : ""}
                  </span>
                  {item.assigned_reviewer && (
                    <span>
                      · Assigned to: <strong>{item.assigned_reviewer.display_name}</strong>
                    </span>
                  )}
                </div>
              </div>

              <div className={styles.caseActions}>
                <Button
                  type="button"
                  variant="secondary"
                  disabled={assigning}
                  onClick={() => {
                    const reviewerId = item.suggested_reviewer?.id || reviewers[0]?.id || "";
                    onAssignBulk?.([
                      {
                        report_id: item.id,
                        reviewer_id: reviewerId,
                        version: item.version,
                      },
                    ]);
                  }}
                >
                  {t("s04.takeSuggested")}
                </Button>
              </div>
            </div>
          );
        })}
      </div>
    </div>
  );
}
