"use client";

import { useState, type ReactNode } from "react";
import type { AlertStatus, AuditVerifyResponse, SecurityAlert } from "../../../../lib/api/types";
import { useLocale, useT } from "../../../../lib/i18n/client";
import {
  Banner,
  Button,
  DataTable,
  EmptyState,
  Field,
  Select,
  SegmentedControl,
  Sheet,
  Skeleton,
  StatusBadge,
  TextArea,
  useMediaQuery,
  type Column,
  type StatusTone,
} from "../../../../ui";
import { formatWatDateTime } from "../../../../ui/format";
import { RetryIcon } from "../../../../ui/icons";
import styles from "./SecurityView.module.css";

/** SEC-01 takes a note of up to 500 characters. */
export const ALERT_NOTE_MAX = 500;
/** AUD-01 exports at most 92 days (the end day minus the start day is under 92). */
export const EXPORT_MAX_DAYS = 92;

export const ALERT_STATUSES: AlertStatus[] = ["open", "acknowledged", "resolved", "false_positive"];
type NewStatus = "acknowledged" | "resolved" | "false_positive";
const NEW_STATUSES: NewStatus[] = ["acknowledged", "resolved", "false_positive"];

/** A save or export that came back: either fine, or the plain message to show. */
export type SecurityActionResult = { ok: true } | { ok: false; message: string };

export interface SecurityViewProps {
  alerts: SecurityAlert[];
  verification: AuditVerifyResponse | null;
  loading: boolean;
  verifying: boolean;
  error: string | null;
  /** Shown inside the verify card when the check itself could not run. */
  verifyError?: string | null;
  statusFilter: AlertStatus;
  onStatusFilterChange?: (status: AlertStatus) => void;
  hasMore?: boolean;
  loadingMore?: boolean;
  onLoadMore?: () => void;
  onRetry?: () => void;
  onUpdateAlert?: (id: string, status: NewStatus, version: number, note?: string) => Promise<SecurityActionResult>;
  onVerifyChain?: () => void;
  onExportAudit?: (format: "jsonl" | "csv", from: string, to: string) => Promise<SecurityActionResult>;
  /** Preview only: open the update sheet for this alert, or start with this export range and message. */
  initialEditing?: string;
  initialUpdateProblem?: string;
  initialExport?: { from?: string; to?: string; notice?: { tone: "danger" | "ok"; text: string } };
  "data-testid"?: string;
}

const SEVERITY_TONE: Record<SecurityAlert["severity"], StatusTone> = { high: "danger", medium: "attn", low: "info" };
const SEVERITY_RANK: Record<SecurityAlert["severity"], number> = { high: 3, medium: 2, low: 1 };
const STATUS_TONE: Record<AlertStatus, StatusTone> = { open: "attn", acknowledged: "info", resolved: "ok", false_positive: "wait" };

/** West Africa Time calendar day, as the date pickers expect it. */
function watDay(offsetDays = 0): string {
  return new Date(Date.now() + 3_600_000 + offsetDays * 86_400_000).toISOString().slice(0, 10);
}

function dayGap(from: string, to: string): number {
  return Math.round((Date.parse(`${to}T00:00:00Z`) - Date.parse(`${from}T00:00:00Z`)) / 86_400_000);
}

/** S-12 security and audit: the alerts timeline, the audit-chain check and the audit export. */
export function SecurityView({
  alerts,
  verification,
  loading,
  verifying,
  error,
  verifyError,
  statusFilter,
  onStatusFilterChange,
  hasMore,
  loadingMore,
  onLoadMore,
  onRetry,
  onUpdateAlert,
  onVerifyChain,
  onExportAudit,
  initialEditing,
  initialUpdateProblem,
  initialExport,
  "data-testid": testId = "security-view",
}: SecurityViewProps) {
  const t = useT();
  const { locale } = useLocale();
  const wide = useMediaQuery("(min-width: 768px)");

  const [editingId, setEditingId] = useState<string | null>(initialEditing ?? null);
  const [notice, setNotice] = useState<string | null>(null);

  const editing = alerts.find((alert) => alert.id === editingId) ?? null;

  /** Known words come from the message files; anything new from the server falls back to its own name. */
  const word = (key: string, raw: string) => {
    const text = t(key);
    return text === key ? raw.replace(/_/g, " ") : text;
  };
  const ruleName = (alert: SecurityAlert) => word(`s12.rule.${alert.rule}`, alert.rule);
  const subjectLine = (alert: SecurityAlert) => `${word(`s12.subject.${alert.subject.type}`, alert.subject.type)}: ${alert.subject.label}`;
  const when = (iso: string) => formatWatDateTime(iso, locale);

  const severityBadge = (alert: SecurityAlert) => (
    <StatusBadge tone={SEVERITY_TONE[alert.severity]} label={t(`s12.severity.${alert.severity}`)} />
  );
  const statusBadge = (alert: SecurityAlert) => (
    <StatusBadge tone={STATUS_TONE[alert.status]} label={t(`s12.status.${alert.status}`)} />
  );
  const updateButton = (alert: SecurityAlert) => (
    <Button variant="secondary" onClick={() => setEditingId(alert.id)} data-testid={`s12-update-${alert.id}`}>
      {t("s12.update")}
      <span className="eg-sr-only"> {ruleName(alert)}</span>
    </Button>
  );

  const columns: Column<SecurityAlert>[] = [
    {
      key: "severity",
      header: t("s12.col.severity"),
      sortable: true,
      sortValue: (alert) => SEVERITY_RANK[alert.severity],
      render: severityBadge,
    },
    {
      key: "rule",
      header: t("s12.col.rule"),
      rowHeader: true,
      render: (alert) => (
        <span className={styles.ruleCell}>
          <span className={styles.ruleName}>{ruleName(alert)}</span>
          <span className={styles.sub}>{subjectLine(alert)}</span>
        </span>
      ),
    },
    {
      key: "detector",
      header: t("s12.col.detector"),
      render: (alert) => t(`s12.detector.${alert.detector}`),
    },
    { key: "status", header: t("s12.col.status"), render: statusBadge },
    {
      key: "last_seen_at",
      header: t("s12.col.lastSeen"),
      sortable: true,
      sortValue: (alert) => Date.parse(alert.last_seen_at),
      render: (alert) => (
        <span className={styles.ruleCell}>
          <span className="eg-tnum">{when(alert.last_seen_at)}</span>
          <span className={`${styles.sub} eg-tnum`}>{t("s12.firstSeen")}: {when(alert.first_seen_at)}</span>
        </span>
      ),
    },
    { key: "action", header: t("s12.col.action"), render: updateButton },
  ];

  const filterOptions = ALERT_STATUSES.map((status) => ({ value: status, label: t(`s12.status.${status}`) }));

  return (
    <div className={styles.page} data-testid={testId}>
      <p className={styles.intro}>{t("s12.subtitle")}</p>

      {error ? (
        <Banner
          tone="danger"
          title={error}
          critical
          action={
            onRetry ? (
              <Button variant="secondary" icon={<RetryIcon />} onClick={onRetry}>
                {t("staff.retry")}
              </Button>
            ) : undefined
          }
        />
      ) : null}
      {notice ? <Banner tone="ok" title={notice} onDismiss={() => setNotice(null)} data-testid="s12-notice" /> : null}

      <VerifyCard verification={verification} verifying={verifying} error={verifyError ?? null} onVerify={onVerifyChain} />

      <section className={styles.alerts} aria-labelledby="s12-alerts" aria-busy={loading || undefined}>
        <div className={styles.alertsHead}>
          <div>
            <h2 id="s12-alerts" className={styles.sectionTitle}>{t("s12.alertsTitle")}</h2>
            <p className={styles.sub}>{t("s12.alertsHint")}</p>
          </div>
          {wide ? (
            <SegmentedControl
              label={t("s12.filterLabel")}
              value={statusFilter}
              onChange={(value) => onStatusFilterChange?.(value as AlertStatus)}
              options={filterOptions}
              data-testid="s12-filter"
            />
          ) : (
            <Select
              label={t("s12.filterLabel")}
              value={statusFilter}
              onChange={(event) => onStatusFilterChange?.(event.target.value as AlertStatus)}
              options={filterOptions}
              placeholder={false}
              className={styles.filterSelect}
              data-testid="s12-filter"
            />
          )}
        </div>

        {loading && alerts.length === 0 ? (
          <div className={styles.loading}>
            <Skeleton lines={5} height={44} delay={0} />
          </div>
        ) : alerts.length === 0 ? (
          error ? null : <EmptyState title={t(`s12.empty.${statusFilter}`)} data-testid="s12-empty" />
        ) : wide ? (
          <DataTable
            caption={t("s12.tableCaption")}
            captionHidden
            columns={columns}
            rows={alerts}
            rowKey={(alert) => alert.id}
            data-testid="s12-table"
          />
        ) : (
          <ul className={styles.cards} data-testid="s12-cards">
            {alerts.map((alert) => (
              <li key={alert.id} className={styles.card}>
                <div className={styles.badges}>
                  {severityBadge(alert)}
                  {statusBadge(alert)}
                </div>
                <h3 className={styles.ruleName}>{ruleName(alert)}</h3>
                <p className={styles.sub}>{subjectLine(alert)}</p>
                <p className={`${styles.sub} eg-tnum`}>
                  {t(`s12.detector.${alert.detector}`)} · {when(alert.last_seen_at)}
                </p>
                <div className={styles.cardAction}>{updateButton(alert)}</div>
              </li>
            ))}
          </ul>
        )}

        {hasMore ? (
          <div className={styles.more}>
            <Button variant="secondary" loading={loadingMore} onClick={onLoadMore}>
              {t("s12.loadMore")}
            </Button>
          </div>
        ) : null}
      </section>

      <ExportCard onExport={onExportAudit} initial={initialExport} />

      {editing ? (
        <UpdateSheet
          key={editing.id}
          alert={editing}
          ruleName={ruleName(editing)}
          subject={subjectLine(editing)}
          onClose={() => setEditingId(null)}
          onSave={async (status, note) => {
            const result = onUpdateAlert ? await onUpdateAlert(editing.id, status, editing.version, note) : ({ ok: true } as const);
            if (result.ok) {
              setEditingId(null);
              setNotice(t("s12.updated"));
            }
            return result;
          }}
          initialProblem={initialUpdateProblem}
          detailLabel={(key) => word(`s12.detail.${key}`, key)}
          when={when}
          severity={severityBadge(editing)}
          status={statusBadge(editing)}
        />
      ) : null}
    </div>
  );
}

/* ---------- Verify the audit chain ---------- */

function VerifyCard({
  verification,
  verifying,
  error,
  onVerify,
}: {
  verification: AuditVerifyResponse | null;
  verifying: boolean;
  error: string | null;
  onVerify?: () => void;
}) {
  const t = useT();
  const { locale } = useLocale();
  const number = (value: number) => value.toLocaleString(locale === "en" ? "en-NG" : undefined);

  return (
    <section className={styles.panel} aria-labelledby="s12-verify" data-testid="s12-verify">
      <div className={styles.panelHead}>
        <div>
          <h2 id="s12-verify" className={styles.sectionTitle}>{t("s12.verifyTitle")}</h2>
          <p className={styles.sub}>{t("s12.verifyHint")}</p>
        </div>
        <Button variant="primary" loading={verifying} loadingLabel={t("s12.verifyRunning")} onClick={onVerify} data-testid="s12-verify-run">
          {t("s12.verifyRun")}
        </Button>
      </div>

      <div aria-live="polite" data-testid="s12-verify-result">
        {error ? (
          <p className={styles.problem} role="alert">{error}</p>
        ) : verification === null ? (
          <p className={styles.sub}>{t("s12.verifyNever")}</p>
        ) : verification.intact ? (
          <div className={styles.result} data-tone="ok">
            <div className={styles.resultHead}>
              <StatusBadge tone="ok" label={t("s12.verifyIntact")} size="lg" />
              <p className={`${styles.resultLine} eg-tnum`}>{t("s12.verifyOk", { count: number(verification.events_checked) })}</p>
            </div>
            <ChainFacts verification={verification} number={number} />
          </div>
        ) : (
          <div className={styles.result} data-tone="danger">
            <div className={styles.resultHead}>
              <StatusBadge tone="danger" label={t("s12.verifyBroken")} size="lg" />
              <p className={styles.resultLine}>{t("s12.verifyBrokenTitle")}</p>
            </div>
            <dl className={styles.facts}>
              <div>
                <dt>{t("s12.verifyBrokenEvent")}</dt>
                <dd className={`${styles.hash} eg-tnum`}>{verification.first_broken_event_id ?? "—"}</dd>
              </div>
            </dl>
            <p className={styles.dangerText}>
              {t("s12.verifyBrokenText", { count: number(Math.max(0, verification.events_checked - 1)) })}
            </p>
            <ChainFacts verification={verification} number={number} />
          </div>
        )}
      </div>
    </section>
  );
}

function ChainFacts({ verification, number }: { verification: AuditVerifyResponse; number: (value: number) => string }) {
  const t = useT();
  const { locale } = useLocale();
  return (
    <>
    <dl className={styles.facts}>
      <div>
        <dt>{t("s12.headHash")}</dt>
        <dd className={`${styles.hash} eg-tnum`} data-testid="s12-head-hash">{verification.head.hash}</dd>
      </div>
      <div>
        <dt>{t("s12.headEvents")}</dt>
        <dd className="eg-tnum">{number(verification.head.event_count)}</dd>
      </div>
    </dl>
    <p className={`${styles.sub} eg-tnum`}>{t("s12.checkedAt", { time: formatWatDateTime(verification.checked_at, locale) })}</p>
    </>
  );
}

/* ---------- Update one alert ---------- */

function UpdateSheet({
  alert,
  ruleName,
  subject,
  severity,
  status,
  detailLabel,
  when,
  initialProblem,
  onClose,
  onSave,
}: {
  alert: SecurityAlert;
  ruleName: string;
  subject: string;
  severity: ReactNode;
  status: ReactNode;
  detailLabel: (key: string) => string;
  when: (iso: string) => string;
  initialProblem?: string;
  onClose: () => void;
  onSave: (status: NewStatus, note: string | undefined) => Promise<SecurityActionResult>;
}) {
  const t = useT();
  const [choice, setChoice] = useState<NewStatus>(alert.status === "open" ? "acknowledged" : alert.status === "acknowledged" ? "resolved" : "acknowledged");
  const [note, setNote] = useState("");
  const [saving, setSaving] = useState(false);
  const [problem, setProblem] = useState<string | null>(initialProblem ?? null);

  async function save() {
    setSaving(true);
    setProblem(null);
    const text = note.trim();
    const result = await onSave(choice, text ? text : undefined);
    setSaving(false);
    if (!result.ok) setProblem(result.message);
  }

  const valueText = (value: string | number | boolean) =>
    typeof value === "boolean" ? (value ? t("common.yes") : t("common.no")) : String(value);

  return (
    <Sheet
      open
      onClose={onClose}
      title={t("s12.updateTitle")}
      closeOnBrowserBack={false}
      footer={
        <div className={styles.sheetActions}>
          <Button variant="primary" loading={saving} onClick={() => void save()} data-testid="s12-save">
            {t("s12.save")}
          </Button>
          <Button variant="quiet" onClick={onClose}>{t("ui.cancel")}</Button>
        </div>
      }
      data-testid="s12-sheet"
    >
      <div className={styles.sheetBody}>
        <div className={styles.sheetSummary}>
          <div className={styles.badges}>
            {severity}
            {status}
          </div>
          <p className={styles.ruleName}>{ruleName}</p>
          <p className={styles.sub}>{subject}</p>
          <p className={`${styles.sub} eg-tnum`}>{t("s12.firstSeen")}: {when(alert.first_seen_at)}</p>
          <p className={`${styles.sub} eg-tnum`}>{t("s12.lastSeen")}: {when(alert.last_seen_at)}</p>
        </div>

        {Object.keys(alert.details).length > 0 ? (
          <div>
            <h3 className={styles.miniTitle}>{t("s12.detailsTitle")}</h3>
            <dl className={styles.details}>
              {Object.entries(alert.details).map(([key, value]) => (
                <div key={key}>
                  <dt>{detailLabel(key)}</dt>
                  <dd className="eg-tnum">{valueText(value)}</dd>
                </div>
              ))}
            </dl>
          </div>
        ) : null}

        {problem ? <p className={styles.problem} role="alert">{problem}</p> : null}

        <Select
          label={t("s12.newStatus")}
          value={choice}
          onChange={(event) => setChoice(event.target.value as NewStatus)}
          options={NEW_STATUSES.map((value) => ({ value, label: t(`s12.status.${value}`) }))}
          placeholder={false}
          data-testid="s12-new-status"
        />
        <TextArea
          label={t("s12.noteLabel")}
          hint={t("s12.noteHint")}
          optional
          rows={4}
          maxLength={ALERT_NOTE_MAX}
          value={note}
          onChange={(event) => setNote(event.target.value)}
          data-testid="s12-note"
        />
      </div>
    </Sheet>
  );
}

/* ---------- Export ---------- */

function ExportCard({
  onExport,
  initial,
}: {
  onExport?: (format: "jsonl" | "csv", from: string, to: string) => Promise<SecurityActionResult>;
  initial?: SecurityViewProps["initialExport"];
}) {
  const t = useT();
  const [from, setFrom] = useState(() => initial?.from ?? watDay(-30));
  const [to, setTo] = useState(() => initial?.to ?? watDay());
  const [format, setFormat] = useState<"jsonl" | "csv">("jsonl");
  const [busy, setBusy] = useState(false);
  const [message, setMessage] = useState<{ tone: "danger" | "ok"; text: string } | null>(initial?.notice ?? null);

  async function run() {
    const gap = dayGap(from, to);
    if (!from || !to || Number.isNaN(gap) || gap < 0 || gap >= EXPORT_MAX_DAYS) {
      setMessage({ tone: "danger", text: t("s12.exportRange") });
      return;
    }
    if (!onExport) return;
    setBusy(true);
    setMessage(null);
    const result = await onExport(format, from, to);
    setBusy(false);
    setMessage(result.ok ? { tone: "ok", text: t("s12.exportDone") } : { tone: "danger", text: result.message });
  }

  return (
    <section className={styles.panel} aria-labelledby="s12-export" data-testid="s12-export">
      <div>
        <h2 id="s12-export" className={styles.sectionTitle}>{t("s12.exportTitle")}</h2>
        <p className={styles.sub}>{t("s12.exportHint")}</p>
      </div>
      <div className={styles.exportForm}>
        <Field label={t("s12.exportFrom")} type="date" value={from} max={to || undefined} onChange={(event) => setFrom(event.target.value)} numeric data-testid="s12-export-from" />
        <Field label={t("s12.exportTo")} type="date" value={to} min={from || undefined} onChange={(event) => setTo(event.target.value)} numeric data-testid="s12-export-to" />
        <Select
          label={t("s12.exportFormat")}
          value={format}
          onChange={(event) => setFormat(event.target.value as "jsonl" | "csv")}
          options={[
            { value: "jsonl", label: t("s12.exportJsonl") },
            { value: "csv", label: t("s12.exportCsv") },
          ]}
          placeholder={false}
          data-testid="s12-export-format"
        />
        <Button variant="secondary" loading={busy} onClick={() => void run()} className={styles.exportButton} data-testid="s12-export-run">
          {t("s12.exportRun")}
        </Button>
      </div>
      <div aria-live="polite">
        {message ? (
          <p className={message.tone === "danger" ? styles.problem : styles.good} role={message.tone === "danger" ? "alert" : undefined}>
            {message.text}
          </p>
        ) : null}
      </div>
    </section>
  );
}
