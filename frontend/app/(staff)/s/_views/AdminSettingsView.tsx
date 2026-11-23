"use client";

import { useState } from "react";
import type { OrganisationSettings, UpdateSettingsRequest } from "../../../../lib/api/types";
import { useT } from "../../../../lib/i18n/client";
import { Banner, Button, Field } from "../../../../ui";
import styles from "./AdminSettingsView.module.css";

export interface AdminSettingsViewProps {
  settings: OrganisationSettings | null;
  loading: boolean;
  error: string | null;
  saveSuccess?: boolean;
  confirmationNotice?: string | null;
  onSave?: (updates: UpdateSettingsRequest) => void;
  onExportAudit?: (format: "jsonl" | "csv", from: string, to: string) => void;
  "data-testid"?: string;
}

export function AdminSettingsView({
  settings,
  loading,
  error,
  saveSuccess = false,
  confirmationNotice = null,
  onSave,
  onExportAudit,
  "data-testid": testId = "admin-settings-view",
}: AdminSettingsViewProps) {
  const t = useT();

  return (
    <div className={styles.container} data-testid={testId}>
      <header className={styles.header}>
        <h1 className={styles.title}>{t("s11.title")}</h1>
        <p className={styles.subtitle}>{t("s11.subtitle")}</p>
      </header>

      {error && <Banner tone="danger" title={error} critical />}
      {saveSuccess && (
        <Banner tone="ok" title={t("staff.saveSuccess")} />
      )}

      {confirmationNotice && (
        <div className={styles.dangerBox}>
          <strong>{t("staff.confirmActionRequired")}</strong>
          <p style={{ margin: 0 }}>{confirmationNotice}</p>
        </div>
      )}

      {settings && (
        <AdminSettingsForm
          key={settings.version}
          settings={settings}
          loading={loading}
          onSave={onSave}
          onExportAudit={onExportAudit}
        />
      )}
    </div>
  );
}

function AdminSettingsForm({
  settings,
  loading,
  onSave,
  onExportAudit,
}: {
  settings: OrganisationSettings;
  loading: boolean;
  onSave?: (updates: UpdateSettingsRequest) => void;
  onExportAudit?: (format: "jsonl" | "csv", from: string, to: string) => void;
}) {
  const t = useT();

  const [intakePaused, setIntakePaused] = useState(settings.intake_paused);
  const [retentionDays, setRetentionDays] = useState(String(settings.retention_days));
  const [electionDay, setElectionDay] = useState(settings.election_day ?? "");
  const [publicDelayMinutes, setPublicDelayMinutes] = useState(String(settings.public_delay_minutes));
  const [partyLabels, setPartyLabels] = useState(settings.party_labels.join(", "));
  const [simulatorEnabled, setSimulatorEnabled] = useState(settings.simulator_enabled);
  const [confirmShortening, setConfirmShortening] = useState(false);

  const [exportFrom, setExportFrom] = useState(() => {
    const d = new Date();
    d.setDate(d.getDate() - 30);
    return d.toISOString().slice(0, 10);
  });
  const [exportTo, setExportTo] = useState(() => new Date().toISOString().slice(0, 10));

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    if (!onSave) return;

    const parsedDays = parseInt(retentionDays, 10);
    const parsedDelay = parseInt(publicDelayMinutes, 10);
    const parsedParties = partyLabels
      .split(",")
      .map((p) => p.trim().toUpperCase())
      .filter(Boolean);

    onSave({
      version: settings.version,
      intake_paused: intakePaused,
      retention_days: isNaN(parsedDays) ? settings.retention_days : parsedDays,
      election_day: electionDay ? electionDay : null,
      public_delay_minutes: isNaN(parsedDelay) ? settings.public_delay_minutes : parsedDelay,
      party_labels: parsedParties.length > 0 ? parsedParties : settings.party_labels,
      simulator_enabled: simulatorEnabled,
      confirm: confirmShortening || undefined,
    });
  };

  return (
    <form onSubmit={handleSubmit} className={styles.card}>
      <div>
        <h2 className={styles.sectionTitle}>{t("staff.generalSettings")}</h2>
        <p className={styles.sectionDescription}>
          {t("s11.intakePauseHint")}
        </p>
      </div>

      <div className={styles.toggleRow}>
        <div className={styles.toggleMeta}>
          <span className={styles.toggleLabel}>{t("s11.intakePause")}</span>
          <span className={styles.toggleHint}>{t("s11.intakePauseHint")}</span>
        </div>
        <label style={{ display: "flex", alignItems: "center", gap: "var(--sp-2)", cursor: "pointer" }}>
          <input
            type="checkbox"
            checked={intakePaused}
            onChange={(e) => setIntakePaused(e.target.checked)}
          />
          <span>{intakePaused ? t("staff.paused") : t("staff.active")}</span>
        </label>
      </div>

      <div className={styles.toggleRow}>
        <div className={styles.toggleMeta}>
          <span className={styles.toggleLabel}>{t("staff.simulator")}</span>
          <span className={styles.toggleHint}>{t("staff.simulatorHint")}</span>
        </div>
        <label style={{ display: "flex", alignItems: "center", gap: "var(--sp-2)", cursor: "pointer" }}>
          <input
            type="checkbox"
            checked={simulatorEnabled}
            onChange={(e) => setSimulatorEnabled(e.target.checked)}
          />
          <span>{simulatorEnabled ? t("staff.enabled") : t("staff.disabled")}</span>
        </label>
      </div>

      <div className={styles.formGrid}>
        <Field
          label={t("s11.retention")}
          hint={t("staff.retentionRange")}
          type="number"
          min={30}
          max={730}
          value={retentionDays}
          onChange={(e) => setRetentionDays(e.target.value)}
        />

        <Field
          label={t("s11.electionDay")}
          hint={t("staff.electionDayHint")}
          type="date"
          value={electionDay}
          onChange={(e) => setElectionDay(e.target.value)}
        />

        <Field
          label={t("s11.publicDelay")}
          hint={t("staff.delayRange")}
          type="number"
          min={60}
          max={1440}
          value={publicDelayMinutes}
          onChange={(e) => setPublicDelayMinutes(e.target.value)}
        />

        <Field
          label={t("s11.partyLabels")}
          hint={t("staff.partyLabelsHint")}
          type="text"
          value={partyLabels}
          onChange={(e) => setPartyLabels(e.target.value)}
        />
      </div>

      <div style={{ display: "flex", alignItems: "center", gap: "var(--sp-2)", marginTop: "var(--sp-2)" }}>
        <input
          type="checkbox"
          id="confirm-retention-change"
          checked={confirmShortening}
          onChange={(e) => setConfirmShortening(e.target.checked)}
        />
        <label htmlFor="confirm-retention-change" style={{ font: "var(--t-small)", cursor: "pointer" }}>
          {t("s11.retentionConfirm")}
        </label>
      </div>

      <div className={styles.metaInfo}>
        <span>{t("staff.version")}: {settings.version}</span>
        {settings.updated_at && (
          <span style={{ marginLeft: "var(--sp-4)" }}>
            {t("staff.lastUpdated")}: {new Date(settings.updated_at).toLocaleString()}
            {settings.updated_by ? ` (${settings.updated_by})` : ""}
          </span>
        )}
      </div>

      <div className={styles.actions}>
        <Button type="submit" variant="primary" disabled={loading}>
          {loading ? t("staff.saving") : t("s11.saveSettings")}
        </Button>
      </div>

      {onExportAudit && (
        <div style={{ marginTop: "var(--sp-4)", borderTop: "1px solid var(--c-border)", paddingTop: "var(--sp-4)" }}>
          <h3 style={{ font: "var(--t-heading)", margin: "0 0 var(--sp-2) 0" }}>{t("s11.auditExport")}</h3>
          <div style={{ display: "flex", gap: "var(--sp-3)", alignItems: "flex-end", flexWrap: "wrap" }}>
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
        </div>
      )}
    </form>
  );
}
