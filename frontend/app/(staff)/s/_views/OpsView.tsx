"use client";

import { useState } from "react";
import type { Cluster, CoverageResponse, LateMaterialsResponse, OverviewResponse } from "../../../../lib/api/types";
import { useT } from "../../../../lib/i18n/client";
import { Banner, Button, EmptyState, MetricTile } from "../../../../ui";
import styles from "./OpsView.module.css";

export interface OpsViewProps {
  overview: OverviewResponse | null;
  clusters: Cluster[];
  coverage: CoverageResponse | null;
  lateMaterials: LateMaterialsResponse | null;
  loading: boolean;
  error: string | null;
  onReviewCluster?: (id: string, note?: string) => void;
  "data-testid"?: string;
}

export function OpsView({
  overview,
  clusters,
  coverage,
  lateMaterials,
  loading,
  error,
  onReviewCluster,
  "data-testid": testId = "ops-view",
}: OpsViewProps) {
  const t = useT();

  const [reviewNotes, setReviewNotes] = useState<Record<string, string>>({});

  const totals = overview?.totals;

  return (
    <div className={styles.container} data-testid={testId}>
      {error && <Banner tone="danger" title={error} critical />}

      {loading && !overview && (
        <div style={{ padding: "var(--s-4)", textAlign: "center", color: "var(--ink-2)" }}>
          {t("staff.loading")}
        </div>
      )}

      {/* Totals Grid */}
      {totals && (
        <div className={styles.totalsGrid}>
          <MetricTile
            value={totals.reports}
            label={t("s05.totals.totalReports")}
            period={t("s05.today")}
          />
          <MetricTile
            value={totals.incidents_after_links}
            label={t("s05.totals.incidents")}
            period={t("s05.today")}
          />
          <MetricTile
            value={totals.urgent_open}
            label={t("s05.totals.urgentOpen")}
            period={t("s05.today")}
          />
          <MetricTile
            value={totals.open_questions}
            label={t("s05.totals.openQuestions")}
            period={t("s05.today")}
          />
          <MetricTile
            value={totals.result_sheet_flags_open}
            label={t("s05.totals.resultFlags")}
            period={t("s05.today")}
          />
          <MetricTile
            value={totals.withdrawn}
            label={t("s05.totals.withdrawn")}
            period={t("s05.today")}
          />
        </div>
      )}

      {/* Result Sheet Consistency Check Banner */}
      <section className={styles.section}>
        <div className={styles.resultSheetBanner}>
          <p style={{ margin: 0 }}>{t("s05.resultSheetFlags.disclaimer")}</p>
        </div>
        <p style={{ color: "var(--ink-2)", fontSize: "0.875rem", margin: 0 }}>
          {t("s05.resultSheetFlags.openFlags", { count: totals?.result_sheet_flags_open || 0 })}
        </p>
      </section>

      {/* Cluster Warnings */}
      <section className={styles.section}>
        <div className={styles.sectionHeader}>
          <h2 className={styles.sectionTitle}>{t("s05.clusters.title")}</h2>
          <span className={styles.badgeAttn}>
            {clusters.filter((c) => c.status === "open").length} open
          </span>
        </div>

        {clusters.length === 0 ? (
          <EmptyState title="No active cluster warnings" />
        ) : (
          <div className={styles.clusterList}>
            {clusters.map((cluster) => {
              const isReviewed = cluster.status === "reviewed";
              const note = reviewNotes[cluster.id] || "";

              return (
                <div key={cluster.id} className={styles.clusterCard}>
                  <div className={styles.clusterTop}>
                    <div>
                      <strong>{cluster.category}</strong>
                      <span style={{ marginLeft: "var(--s-2)", color: "var(--ink-2)" }}>
                        {cluster.area.state_name} · {cluster.area.lga_name}
                      </span>
                    </div>
                    {isReviewed ? (
                      <span className={styles.badgeOk}>{t("s05.clusters.reviewedBadge")}</span>
                    ) : (
                      <span className={styles.badgeAttn}>
                        {t("s05.clusters.badge", { count: cluster.report_count, window: 60 })}
                      </span>
                    )}
                  </div>

                  <p style={{ fontSize: "0.875rem", margin: 0, color: "var(--ink-2)" }}>
                    {t("s05.clusters.baseline", { baseline: cluster.baseline })}
                  </p>

                  {!isReviewed && (
                    <div style={{ display: "flex", gap: "var(--s-2)", marginTop: "var(--s-2)" }}>
                      <input
                        type="text"
                        className="eg-input"
                        placeholder={t("s05.clusters.reviewNote")}
                        value={note}
                        onChange={(e) =>
                          setReviewNotes({ ...reviewNotes, [cluster.id]: e.target.value })
                        }
                        style={{ flex: 1 }}
                      />
                      <Button
                        type="button"
                        variant="secondary"
                        onClick={() => onReviewCluster?.(cluster.id, note || undefined)}
                      >
                        {t("s05.clusters.reviewButton")}
                      </Button>
                    </div>
                  )}
                </div>
              );
            })}
          </div>
        )}
      </section>

      {/* Coverage Gaps */}
      {coverage && (
        <section className={styles.section}>
          <div className={styles.sectionHeader}>
            <h2 className={styles.sectionTitle}>{t("s05.coverage.title")}</h2>
            <span style={{ fontSize: "0.875rem", color: "var(--ink-2)" }}>
              Stage: <strong>{coverage.stage}</strong>
            </span>
          </div>

          <div className={styles.tableWrapper}>
            <table className={styles.table}>
              <thead>
                <tr>
                  <th>LGA</th>
                  <th>Expected Units</th>
                  <th>With Checklist</th>
                  <th>Missing</th>
                  <th>&apos;No&apos; Answers</th>
                </tr>
              </thead>
              <tbody>
                {coverage.rows.map((row) => {
                  if ("lga_code" in row) {
                    return (
                      <tr key={row.lga_code}>
                        <td>
                          <strong>{row.lga_name}</strong>
                        </td>
                        <td>{row.expected_units}</td>
                        <td>{row.units_with_checklist}</td>
                        <td>{row.units_without}</td>
                        <td>{row.no_answers}</td>
                      </tr>
                    );
                  }
                  return (
                    <tr key={row.polling_unit_code}>
                      <td>
                        <strong>{row.polling_unit_name}</strong>
                      </td>
                      <td>1</td>
                      <td>{row.has_checklist ? 1 : 0}</td>
                      <td>{row.has_checklist ? 0 : 1}</td>
                      <td>{row.no_answers}</td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>

          {coverage.most_no_answers.length > 0 && (
            <div style={{ marginTop: "var(--s-3)" }}>
              <h3 style={{ fontSize: "1rem", margin: "0 0 var(--s-2)" }}>
                {t("s05.coverage.noAnswers")}
              </h3>
              <div className={styles.tableWrapper}>
                <table className={styles.table}>
                  <thead>
                    <tr>
                      <th>Polling Unit</th>
                      <th>Count of &apos;No&apos;</th>
                      <th>Questions</th>
                    </tr>
                  </thead>
                  <tbody>
                    {coverage.most_no_answers.map((unit) => (
                      <tr key={unit.polling_unit_code}>
                        <td>
                          <strong>{unit.polling_unit_name}</strong>
                          <span style={{ display: "block", fontSize: "0.75rem", color: "var(--ink-2)" }}>
                            {unit.polling_unit_code}
                          </span>
                        </td>
                        <td>{unit.no_count}</td>
                        <td>{unit.questions.join(", ")}</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            </div>
          )}
        </section>
      )}

      {/* Late Materials Risk Model */}
      {lateMaterials && (
        <section className={styles.section}>
          <div className={styles.sectionHeader}>
            <h2 className={styles.sectionTitle}>{t("s05.lateMaterials.title")}</h2>
            <span style={{ fontSize: "0.75rem", color: "var(--ink-2)" }}>
              Model: {lateMaterials.model_version} (Suggested predictions)
            </span>
          </div>

          {lateMaterials.rows.length === 0 ? (
            <p style={{ color: "var(--ink-2)" }}>No late-materials risk predictions generated.</p>
          ) : (
            <div className={styles.tableWrapper}>
              <table className={styles.table}>
                <thead>
                  <tr>
                    <th>Rank</th>
                    <th>LGA & Ward</th>
                    <th>Predicted Transit</th>
                    <th>Risk Level</th>
                    <th>Contributing Factors</th>
                  </tr>
                </thead>
                <tbody>
                  {lateMaterials.rows.map((row) => (
                    <tr key={row.polling_unit_code}>
                      <td>#{row.rank}</td>
                      <td>
                        <strong>{row.lga_name}</strong> · {row.ward_name}
                      </td>
                      <td>{t("s05.lateMaterials.hours", { hours: row.predicted_transit_hours })}</td>
                      <td>
                        <span
                          style={{
                            fontWeight: 600,
                            color:
                              row.risk === "high"
                                ? "var(--danger)"
                                : row.risk === "medium"
                                ? "var(--attn-ink)"
                                : "var(--ok)",
                          }}
                        >
                          {row.risk === "high"
                            ? t("s05.lateMaterials.riskHigh")
                            : row.risk === "medium"
                            ? t("s05.lateMaterials.riskMedium")
                            : t("s05.lateMaterials.riskLow")}
                        </span>
                      </td>
                      <td>{row.factors.join(", ")}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
        </section>
      )}

      {/* Reports by LGA */}
      {overview?.by_lga && (
        <section className={styles.section}>
          <div className={styles.sectionHeader}>
            <h2 className={styles.sectionTitle}>{t("s05.lgaBreakdown.title")}</h2>
          </div>
          <div className={styles.lgaGrid}>
            {overview.by_lga.map((lga) => (
              <div key={lga.lga_code} className={styles.lgaTile}>
                <strong>{lga.lga_name}</strong>
                <span className="eg-tnum" style={{ fontSize: "0.875rem" }}>
                  {t("s05.lgaBreakdown.count", { count: lga.count, urgent: lga.urgent })}
                </span>
              </div>
            ))}
          </div>
        </section>
      )}
    </div>
  );
}
