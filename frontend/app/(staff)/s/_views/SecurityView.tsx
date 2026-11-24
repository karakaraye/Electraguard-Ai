"use client";

import { useState } from "react";
import type { AlertStatus, AuditVerifyResponse, SecurityAlert } from "../../../../lib/api/types";
import { useT } from "../../../../lib/i18n/client";
import { Banner, Button, EmptyState, Field, StatusBadge } from "../../../../ui";
import styles from "./SecurityView.module.css";

export interface SecurityViewProps {
  alerts: SecurityAlert[];
  verification: AuditVerifyResponse | null;
  loading: boolean;
  verifying: boolean;
  error: string | null;
  statusFilter: AlertStatus | "all";
  onStatusFilterChange?: (status: AlertStatus | "all") => void;
  onUpdateAlert?: (id: string, status: "acknowledged" | "resolved" | "false_positive", version: number, note?: string) => void;
  onVerifyChain?: () => void;
  onExportAudit?: (format: "jsonl" | "csv", from: string, to: string) => void;
  "data-testid"?: string;
}

export function SecurityView({
  alerts,
  verification,
  loading,
  verifying,
  error,
  statusFilter,
  onStatusFilterChange,
  onUpdateAlert,
  onVerifyChain,
  onExportAudit,
  "data-testid": testId = "security-view",
}: SecurityViewProps) {
  const t = useT();

  const [activeAlertId, setActiveAlertId] = useState<string | null>(null);
  const [noteText, setNoteText] = useState("");

  const [exportFrom, setExportFrom] = useState(() => {
    const d = new Date();
    d.setDate(d.getDate() - 30);
    return d.toISOString().slice(0, 10);
  });
  const [exportTo, setExportTo] = useState(() => new Date().toISOString().slice(0, 10));

  const filteredAlerts = statusFilter === "all"
    ? alerts
    : alerts.filter((a) => a.status === statusFilter);

  const formatRuleName = (rule: string) => {
    return rule.split("_").map((w) => w.charAt(0).toUpperCase() + w.slice(1)).join(" ");
  };

  const getSeverityTone = (sev: "high" | "medium" | "low") => {
    switch (sev) {
      case "high":
        return "danger" as const;
      case "medium":
        return "attn" as const;
      case "low":
        return "info" as const;
    }
  };

  return (
    <div className={styles.container} data-testid={testId}>
      <header className={styles.header}>
        <h1 className={styles.title}>{t("s12.title")}</h1>
        <p className={styles.subtitle}>{t("s12.subtitle")}</p>
      </header>

      {error && <Banner tone="danger" title={error} critical />}

      {/* Audit Hash-Chain Verification Section */}
      <section className={styles.verifySection}>
        <div className={styles.verifyHeader}>
          <div>
            <h2 style={{ margin: 0, font: "var(--t-heading)" }}>{t("s12.auditVerify")}</h2>
            <p style={{ margin: "var(--sp-1) 0 0 0", font: "var(--t-small)", color: "var(--c-muted)" }}>
              {t("s12.subtitle")}
            </p>
          </div>
          <Button variant="primary" disabled={verifying} onClick={onVerifyChain}>
            {verifying ? t("staff.verifying") : t("s12.verifyNow")}
          </Button>
        </div>

        {verification && (
          <div className={styles.verifyGrid}>
            <div className={styles.verifyTile}>
              <span className={styles.tileLabel}>{t("s12.chainStatus")}</span>
              <div style={{ display: "flex", alignItems: "center", gap: "var(--sp-2)", marginTop: "var(--sp-1)" }}>
                <StatusBadge
                  tone={verification.intact ? "ok" : "danger"}
                  label={verification.intact ? t("staff.intact") : t("staff.compromised")}
                />
              </div>
            </div>

            <div className={styles.verifyTile}>
              <span className={styles.tileLabel}>{t("s12.eventsChecked", { count: verification.events_checked })}</span>
              <span className={styles.tileValue}>{verification.events_checked.toLocaleString()}</span>
              <span className={styles.tileDetail}>{t("staff.verifiedAt")}: {new Date(verification.checked_at).toLocaleTimeString()}</span>
            </div>

            <div className={styles.verifyTile}>
              <span className={styles.tileLabel}>Head Hash</span>
              <span className={styles.tileDetail} title={verification.head.hash}>
                {verification.head.hash.slice(0, 16)}…
              </span>
              <span className={styles.tileDetail}>
                {new Date(verification.head.at).toLocaleString()}
              </span>
            </div>

            {!verification.intact && verification.first_broken_event_id && (
              <div className={styles.verifyTile} style={{ borderColor: "var(--c-danger)" }}>
                <span className={styles.tileLabel} style={{ color: "var(--c-danger)" }}>
                  {t("s12.brokenEvent", { id: verification.first_broken_event_id })}
                </span>
                <span className={styles.tileDetail}>{verification.first_broken_event_id}</span>
              </div>
            )}
          </div>
        )}

        {onExportAudit && (
          <div style={{ borderTop: "1px solid var(--c-border)", paddingTop: "var(--sp-4)", display: "flex", gap: "var(--sp-3)", alignItems: "flex-end", flexWrap: "wrap" }}>
            <Field
              label={t("staff.from")}
              type="date"
              value={exportFrom}
              onChange={(e) => setExportFrom(e.target.value)}
            />
            <Field
              label={t("staff.to")}
              type="date"
              value={exportTo}
              onChange={(e) => setExportTo(e.target.value)}
            />
            <Button type="button" variant="quiet" onClick={() => onExportAudit("csv", exportFrom, exportTo)}>
              CSV
            </Button>
            <Button type="button" variant="quiet" onClick={() => onExportAudit("jsonl", exportFrom, exportTo)}>
              JSONL
            </Button>
          </div>
        )}
      </section>

      {/* Security Alerts Section */}
      <section className={styles.alertsSection}>
        <div className={styles.toolbar}>
          <h2 style={{ margin: 0, font: "var(--t-heading)" }}>
            {t("s12.alerts")} ({filteredAlerts.length})
          </h2>

          <div className={styles.filterGroup}>
            {(["all", "open", "acknowledged", "resolved", "false_positive"] as const).map((st) => (
              <Button
                key={st}
                variant={statusFilter === st ? "primary" : "quiet"}
                onClick={() => onStatusFilterChange?.(st)}
              >
                {st.replace("_", " ")}
              </Button>
            ))}
          </div>
        </div>

        {loading && alerts.length === 0 ? (
          <div style={{ textAlign: "center", padding: "var(--sp-8)", color: "var(--c-muted)" }}>
            {t("staff.loading")}
          </div>
        ) : filteredAlerts.length === 0 ? (
          <EmptyState title={t("staff.noAlerts")} />
        ) : (
          filteredAlerts.map((alert) => (
            <article key={alert.id} className={styles.alertCard}>
              <div className={styles.alertHeader}>
                <div>
                  <div className={styles.alertMeta}>
                    <StatusBadge
                      tone={getSeverityTone(alert.severity)}
                      label={alert.severity.toUpperCase()}
                    />
                    <StatusBadge
                      tone={alert.status === "open" ? "attn" : alert.status === "resolved" ? "ok" : "info"}
                      label={alert.status.replace("_", " ").toUpperCase()}
                    />
                    <span style={{ font: "var(--t-small)", color: "var(--c-muted)" }}>
                      {t("s12.detector")}: {alert.detector}
                    </span>
                  </div>
                  <h3 className={styles.alertRule}>{formatRuleName(alert.rule)}</h3>
                  <div className={styles.alertSubject}>
                    {alert.subject.type}: <strong>{alert.subject.label}</strong>
                  </div>
                </div>

                <div style={{ textAlign: "right", font: "var(--t-small)", color: "var(--c-muted)" }}>
                  <div>Seen: {new Date(alert.last_seen_at).toLocaleTimeString()}</div>
                  <div style={{ fontSize: "var(--t-caption)" }}>First: {new Date(alert.first_seen_at).toLocaleTimeString()}</div>
                </div>
              </div>

              {alert.details && (
                <div className={styles.alertDetails}>
                  {Object.entries(alert.details).map(([k, v]) => (
                    <div key={k}>
                      <span style={{ color: "var(--c-muted)" }}>{k}: </span>
                      <span>{String(v)}</span>
                    </div>
                  ))}
                </div>
              )}

              {activeAlertId === alert.id ? (
                <div style={{ display: "flex", flexDirection: "column", gap: "var(--sp-2)", marginTop: "var(--sp-2)" }}>
                  <Field
                    label={t("staff.note")}
                    type="text"
                    maxLength={500}
                    value={noteText}
                    onChange={(e) => setNoteText(e.target.value)}
                  />
                  <div style={{ display: "flex", gap: "var(--sp-2)" }}>
                    <Button
                      variant="primary"
                      onClick={() => {
                        onUpdateAlert?.(alert.id, "resolved", alert.version, noteText);
                        setActiveAlertId(null);
                        setNoteText("");
                      }}
                    >
                      {t("staff.resolve")}
                    </Button>
                    <Button
                      variant="quiet"
                      onClick={() => {
                        onUpdateAlert?.(alert.id, "false_positive", alert.version, noteText);
                        setActiveAlertId(null);
                        setNoteText("");
                      }}
                    >
                      {t("staff.falsePositive")}
                    </Button>
                    <Button variant="quiet" onClick={() => setActiveAlertId(null)}>
                      {t("ui.cancel")}
                    </Button>
                  </div>
                </div>
              ) : (
                <div className={styles.alertActions}>
                  {alert.status === "open" && (
                    <Button
                      variant="quiet"
                      onClick={() => onUpdateAlert?.(alert.id, "acknowledged", alert.version)}
                    >
                      {t("staff.acknowledge")}
                    </Button>
                  )}
                  {alert.status !== "resolved" && (
                    <Button
                      variant="quiet"
                      onClick={() => {
                        setActiveAlertId(alert.id);
                        setNoteText("");
                      }}
                    >
                      {t("s12.updateStatus")}
                    </Button>
                  )}
                </div>
              )}
            </article>
          ))
        )}
      </section>
    </div>
  );
}
