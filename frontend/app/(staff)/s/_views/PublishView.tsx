"use client";

import { useState } from "react";
import type { Cell, SnapshotRecord } from "../../../../lib/api/types";
import { useT } from "../../../../lib/i18n/client";
import { Banner, Button, EmptyState, Field } from "../../../../ui";
import { ShieldCheckIcon } from "../../../../ui/icons";
import styles from "./PublishView.module.css";

export interface PublishViewProps {
  snapshots: SnapshotRecord[];
  selectedSnapshot: SnapshotRecord | null;
  hourlySchedule: boolean;
  loading: boolean;
  error: string | null;
  onCreateSnapshot?: (cutoff?: string) => void;
  onApproveSnapshot?: (id: string, version: number) => void;
  onDiscardSnapshot?: (id: string, version: number) => void;
  onToggleSchedule?: (hourly: boolean) => void;
  onSelectSnapshot?: (id: string) => void;
  "data-testid"?: string;
}

export function PublishView({
  snapshots,
  selectedSnapshot,
  hourlySchedule,
  loading,
  error,
  onCreateSnapshot,
  onApproveSnapshot,
  onDiscardSnapshot,
  onToggleSchedule,
  onSelectSnapshot,
  "data-testid": testId = "publish-view",
}: PublishViewProps) {
  const t = useT();

  const [cutoffTime, setCutoffTime] = useState("");

  const renderCell = (cell: Cell | undefined) => {
    if (!cell || cell.suppressed) {
      return <span className={styles.suppressedCell}>{t("ui.metric.fewerThan", { threshold: 5 })}</span>;
    }
    return <span className="eg-tnum">{cell.count}</span>;
  };

  return (
    <div className={styles.container} data-testid={testId}>
      {error && <Banner tone="danger" title={error} critical />}

      <div className={styles.topSection}>
        {/* Create Snapshot Card */}
        <div className={styles.card}>
          <h2 className={styles.cardTitle}>{t("s07.createTitle")}</h2>
          <p style={{ margin: 0, fontSize: "0.875rem", color: "var(--ink-2)" }}>
            {t("s07.cutoffHint")}
          </p>

          <Field
            id="snapshot-cutoff"
            label={t("s07.cutoffLabel")}
            type="datetime-local"
            value={cutoffTime}
            onChange={(e) => setCutoffTime(e.target.value)}
          />

          <div>
            <Button
              type="button"
              variant="primary"
              onClick={() => onCreateSnapshot?.(cutoffTime || undefined)}
            >
              {t("s07.createButton")}
            </Button>
          </div>
        </div>

        {/* Hourly Auto Schedule Card */}
        <div className={styles.card}>
          <h2 className={styles.cardTitle}>{t("s07.scheduleTitle")}</h2>
          <p style={{ margin: 0, fontSize: "0.875rem", color: "var(--ink-2)" }}>
            {t("s07.scheduleHint")}
          </p>
          <div style={{ marginTop: "var(--s-2)" }}>
            <span style={{ fontWeight: 600, color: hourlySchedule ? "var(--ok)" : "var(--ink-2)" }}>
              {hourlySchedule ? t("s07.scheduleOn") : t("s07.scheduleOff")}
            </span>
          </div>
          <div>
            <Button
              type="button"
              variant="secondary"
              onClick={() => onToggleSchedule?.(!hourlySchedule)}
            >
              {hourlySchedule ? "Pause auto-publishing" : "Enable hourly release"}
            </Button>
          </div>
        </div>
      </div>

      {/* Snapshot History List */}
      <div className={styles.card}>
        <h2 className={styles.cardTitle}>{t("s07.snapshotsList")}</h2>
        {loading && snapshots.length === 0 && (
          <div style={{ padding: "var(--s-4)", textAlign: "center", color: "var(--ink-2)" }}>
            {t("staff.loading")}
          </div>
        )}

        {!loading && snapshots.length === 0 && (
          <EmptyState title="No snapshots published or drafted yet" />
        )}

        <div className={styles.snapshotHistory}>
          {snapshots.map((snap) => {
            const isSelected = selectedSnapshot?.id === snap.id;

            return (
              <div
                key={snap.id}
                className={styles.snapshotRow}
                data-selected={isSelected}
                onClick={() => onSelectSnapshot?.(snap.id)}
              >
                <div>
                  <strong>Cutoff: {snap.cutoff}</strong>
                  <div style={{ fontSize: "0.8125rem", color: "var(--ink-2)" }}>
                    Created by: {snap.created_by} · Status: <strong>{snap.status.toUpperCase()}</strong>
                  </div>
                </div>
                <div>
                  <span className="eg-tnum">Total: {renderCell(snap.preview.total)}</span>
                </div>
              </div>
            );
          })}
        </div>
      </div>

      {/* Selected Snapshot Preview */}
      {selectedSnapshot && (
        <section className={styles.previewSection}>
          <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", flexWrap: "wrap", gap: "var(--s-2)" }}>
            <h2 className={styles.cardTitle}>{t("s07.previewTitle")}</h2>
            <div style={{ display: "flex", gap: "var(--s-2)" }}>
              {selectedSnapshot.status === "draft" && (
                <>
                  <Button
                    type="button"
                    variant="primary"
                    onClick={() => onApproveSnapshot?.(selectedSnapshot.id, selectedSnapshot.version)}
                  >
                    {t("s07.approvePublish")}
                  </Button>
                  <Button
                    type="button"
                    variant="quiet"
                    onClick={() => onDiscardSnapshot?.(selectedSnapshot.id, selectedSnapshot.version)}
                  >
                    {t("s07.discard")}
                  </Button>
                </>
              )}
            </div>
          </div>

          <p style={{ margin: 0, fontSize: "0.8125rem", color: "var(--ink-2)" }}>
            {t("s07.suppressionNotice")}
          </p>

          {/* Excluded counts */}
          <div>
            <h3 style={{ fontSize: "1rem", margin: "0 0 var(--s-2)" }}>{t("s07.excludedTitle")}</h3>
            <div className={styles.excludedGrid}>
              <div className={styles.excludedItem}>
                <span className={styles.excludedCount}>{selectedSnapshot.excluded.not_closed}</span>
                <span style={{ fontSize: "0.75rem", color: "var(--ink-2)" }}>{t("s07.excludedNotClosed", { count: selectedSnapshot.excluded.not_closed })}</span>
              </div>
              <div className={styles.excludedItem}>
                <span className={styles.excludedCount}>{selectedSnapshot.excluded.withdrawn}</span>
                <span style={{ fontSize: "0.75rem", color: "var(--ink-2)" }}>{t("s07.excludedWithdrawn", { count: selectedSnapshot.excluded.withdrawn })}</span>
              </div>
              <div className={styles.excludedItem}>
                <span className={styles.excludedCount}>{selectedSnapshot.excluded.after_cutoff}</span>
                <span style={{ fontSize: "0.75rem", color: "var(--ink-2)" }}>{t("s07.excludedAfterCutoff", { count: selectedSnapshot.excluded.after_cutoff })}</span>
              </div>
            </div>
          </div>

          {/* State x Category Table */}
          <div className={styles.tableWrapper}>
            <table className={styles.table}>
              <thead>
                <tr>
                  <th>State</th>
                  <th>Total</th>
                  <th>Intimidation / Violence</th>
                  <th>Vote Buying</th>
                  <th>Late Materials</th>
                  <th>Equipment Failure</th>
                </tr>
              </thead>
              <tbody>
                {selectedSnapshot.preview.by_state.map((row) => (
                  <tr key={row.state_code}>
                    <td><strong>{row.state_name}</strong></td>
                    <td>{renderCell(row.total)}</td>
                    <td>{renderCell(row.by_category?.intimidation_violence)}</td>
                    <td>{renderCell(row.by_category?.vote_buying)}</td>
                    <td>{renderCell(row.by_category?.late_materials)}</td>
                    <td>{renderCell(row.by_category?.equipment_failure)}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>

          {/* Audit Chain Head */}
          {selectedSnapshot.preview.audit_chain_head && (
            <div style={{ display: "flex", alignItems: "center", gap: "var(--s-2)", fontSize: "0.8125rem", color: "var(--ink-2)" }}>
              <ShieldCheckIcon size={16} />
              <span>
                Audit chain verified: <strong>{selectedSnapshot.preview.audit_chain_head.hash.slice(0, 16)}…</strong> ({selectedSnapshot.preview.audit_chain_head.event_count} events)
              </span>
            </div>
          )}
        </section>
      )}
    </div>
  );
}
