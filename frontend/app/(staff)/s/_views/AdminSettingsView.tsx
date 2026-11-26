"use client";

import { useEffect, useId, useState, type ComponentProps, type FormEvent, type ReactNode } from "react";
import type { OrganisationSettings, UpdateSettingsRequest } from "../../../../lib/api/types";
import { useLocale, useT } from "../../../../lib/i18n/client";
import { Banner, Button, Field, SegmentedControl, Sheet, Skeleton, StatusBadge, Switch } from "../../../../ui";
import { formatWatDateTime } from "../../../../ui/format";
import { DownloadIcon, LockIcon, RetryIcon } from "../../../../ui/icons";
import styles from "./AdminSettingsView.module.css";

export const RETENTION_MIN = 30;
export const RETENTION_MAX = 730;
export const DELAY_MIN = 60;
export const DELAY_MAX = 1440;
/** The audit export takes at most 92 days in one file. */
export const EXPORT_MAX_DAYS = 92;

/** The fields one card changes. The page adds the settings version. */
export type SettingsChanges = Partial<
  Pick<UpdateSettingsRequest, "intake_paused" | "retention_days" | "election_day" | "public_delay_minutes" | "party_labels" | "simulator_enabled">
>;

export type SettingsSaveResult =
  | { ok: true }
  /** The server wants a yes before deleting records. `records` is read from its answer; null if it gave no number. */
  | { ok: false; kind: "confirm"; records: number | null }
  /** Party labels cannot change once a result sheet exists. */
  | { ok: false; kind: "locked" }
  /** Someone else saved first; the page has reloaded the settings. */
  | { ok: false; kind: "stale" }
  | { ok: false; kind: "error"; message: string };

export type ExportResult = { ok: true } | { ok: false; message: string };

type Section = "intake" | "sim" | "retention" | "schedule" | "parties";

/** Opens parts of the screen in a given state on first render. Used by the preview and tests only. */
export interface SettingsSeed {
  dialog?: "pause" | "resume" | "retention";
  retentionDays?: string;
  records?: number | null;
  sheetMessage?: string;
  electionDay?: string;
  delay?: string;
  parties?: string;
  partiesLocked?: boolean;
  saved?: Section;
  auditFrom?: string;
  auditTo?: string;
}

export interface AdminSettingsViewProps {
  settings: OrganisationSettings | null;
  loading: boolean;
  error: string | null;
  /** A page-level note, for example that someone else changed the settings first. */
  notice?: string | null;
  onSave?: (changes: SettingsChanges, confirm?: boolean) => Promise<SettingsSaveResult>;
  onExportAudit?: (format: "jsonl" | "csv", from: string, to: string) => Promise<ExportResult>;
  onRetry?: () => void;
  seed?: SettingsSeed | null;
  "data-testid"?: string;
}

/** S-11 organisation settings: the controls that change how the whole organisation runs. */
export function AdminSettingsView({
  settings,
  loading,
  error,
  notice = null,
  onSave,
  onExportAudit,
  onRetry,
  seed = null,
  "data-testid": testId = "admin-settings-view",
}: AdminSettingsViewProps) {
  const t = useT();
  const [saved, setSaved] = useState<Section | null>(seed?.saved ?? null);

  useEffect(() => {
    if (!saved) return;
    const id = window.setTimeout(() => setSaved(null), 5000);
    return () => window.clearTimeout(id);
  }, [saved]);

  return (
    <div className={styles.page} data-testid={testId}>
      {error ? (
        <Banner
          tone="danger"
          title={error}
          critical
          action={onRetry ? <Button variant="secondary" icon={<RetryIcon />} onClick={onRetry}>{t("s11.retry")}</Button> : undefined}
        />
      ) : null}
      {notice ? <Banner tone="attn" title={notice} data-testid="s11-notice" /> : null}
      {settings?.intake_paused ? <Banner tone="danger" title={t("s11.intakeCard.banner")} critical data-testid="s11-paused-banner" /> : null}

      {loading && !settings && !error ? (
        <div className={styles.loading} role="status" aria-busy="true" aria-label={t("staff.loading")}>
          <Skeleton lines={8} height={44} delay={0} />
        </div>
      ) : null}

      {settings ? (
        <SettingsForm
          key={settings.version}
          settings={settings}
          seed={seed}
          saved={saved}
          onSaved={setSaved}
          onSave={onSave}
          onExportAudit={onExportAudit}
        />
      ) : null}
    </div>
  );
}

/* ---------- Parsing helpers ---------- */

function wholeNumber(value: string, min: number, max: number): number | null {
  if (!/^\d+$/.test(value.trim())) return null;
  const n = Number(value.trim());
  return n >= min && n <= max ? n : null;
}

function parseLabels(value: string): string[] | null {
  const labels = value.split(",").map((p) => p.trim().toUpperCase()).filter(Boolean);
  const valid = labels.length >= 2 && labels.length <= 12 && labels.every((l) => /^[A-Z]{1,3}$/.test(l)) && new Set(labels).size === labels.length;
  return valid ? labels : null;
}

/** Today in Lagos as YYYY-MM-DD, shifted by some days. */
function lagosDay(shiftDays = 0) {
  const parts = new Intl.DateTimeFormat("en-CA", { timeZone: "Africa/Lagos", year: "numeric", month: "2-digit", day: "2-digit" }).format(
    new Date(Date.now() + shiftDays * 86_400_000),
  );
  return parts;
}

function SettingsForm({
  settings,
  seed,
  saved,
  onSaved,
  onSave,
  onExportAudit,
}: {
  settings: OrganisationSettings;
  seed: SettingsSeed | null;
  saved: Section | null;
  onSaved: (section: Section) => void;
  onSave?: AdminSettingsViewProps["onSave"];
  onExportAudit?: AdminSettingsViewProps["onExportAudit"];
}) {
  const t = useT();
  const { locale } = useLocale();

  return (
    <div className={styles.grid}>
      <IntakeCard settings={settings} seed={seed} saved={saved === "intake"} onSaved={() => onSaved("intake")} onSave={onSave} />
      <RetentionCard settings={settings} seed={seed} saved={saved === "retention"} onSaved={() => onSaved("retention")} onSave={onSave} />
      <ScheduleCard settings={settings} seed={seed} saved={saved === "schedule"} onSaved={() => onSaved("schedule")} onSave={onSave} />
      <PartiesCard settings={settings} seed={seed} saved={saved === "parties"} onSaved={() => onSaved("parties")} onSave={onSave} />
      <SimulatorCard settings={settings} saved={saved === "sim"} onSaved={() => onSaved("sim")} onSave={onSave} />
      <AuditCard seed={seed} onExport={onExportAudit} />
      <p className={`${styles.meta} eg-tnum`}>
        {t("s11.meta.version", { version: settings.version })}
        {" · "}
        {settings.updated_at
          ? settings.updated_by
            ? t("s11.meta.updatedBy", { name: settings.updated_by, when: formatWatDateTime(settings.updated_at, locale) })
            : t("s11.meta.updated", { when: formatWatDateTime(settings.updated_at, locale) })
          : t("s11.meta.never")}
      </p>
    </div>
  );
}

/* ---------- Shared pieces ---------- */

function Card({ id, title, hint, children, footer, wide }: { id: string; title: string; hint?: string; children: ReactNode; footer?: ReactNode; wide?: boolean }) {
  return (
    <section className={styles.card} data-wide={wide ? "" : undefined} aria-labelledby={id}>
      <div className={styles.cardHead}>
        <h2 id={id} className={styles.cardTitle}>{title}</h2>
        {hint ? <p className={styles.hint}>{hint}</p> : null}
      </div>
      {children}
      {footer ? <div className={styles.cardFoot}>{footer}</div> : null}
    </section>
  );
}

function SaveRow({ label, busy, disabled, saved, message }: { label: string; busy: boolean; disabled: boolean; saved: boolean; message?: string | null }) {
  const t = useT();
  return (
    <>
      <Button type="submit" variant="primary" loading={busy} disabled={disabled}>{label}</Button>
      <span className={styles.status} role="status">
        {message ? <span className={styles.problem}>{message}</span> : saved ? t("s11.saved") : ""}
      </span>
    </>
  );
}

/** A native date field. The browser already shows the chosen day, so it is not repeated. */
function DateField(props: Omit<ComponentProps<typeof Field>, "type">) {
  return (
    <div className={styles.dateField}>
      <Field {...props} type="date" />
    </div>
  );
}

/* ---------- Intake (danger switch with a confirm sheet) ---------- */

function IntakeCard({
  settings,
  seed,
  saved,
  onSaved,
  onSave,
}: {
  settings: OrganisationSettings;
  seed: SettingsSeed | null;
  saved: boolean;
  onSaved: () => void;
  onSave?: AdminSettingsViewProps["onSave"];
}) {
  const t = useT();
  const titleId = useId();
  const paused = settings.intake_paused;
  const [open, setOpen] = useState(seed?.dialog === "pause" || seed?.dialog === "resume");
  const [busy, setBusy] = useState(false);
  const [message, setMessage] = useState<string | null>(seed?.dialog === "pause" || seed?.dialog === "resume" ? (seed.sheetMessage ?? null) : null);

  async function confirm() {
    if (!onSave) return;
    setBusy(true);
    setMessage(null);
    const result = await onSave({ intake_paused: !paused });
    setBusy(false);
    if (result.ok) {
      setOpen(false);
      onSaved();
    } else if (result.kind === "error") setMessage(result.message);
    else if (result.kind === "stale") setOpen(false);
  }

  return (
    <Card id={titleId} title={t("s11.intakeCard.title")} hint={t("s11.intakeCard.hint")} wide>
      <div className={styles.switchRow}>
        <div className={styles.switchText}>
          <StatusBadge tone={paused ? "danger" : "ok"} label={paused ? t("s11.intakeCard.paused") : t("s11.intakeCard.open")} />
          <span id={`${titleId}-switch`} className={styles.switchLabel}>{t("s11.intakeCard.switch")}</span>
        </div>
        <Switch checked={paused} onToggle={() => setOpen(true)} labelledBy={`${titleId}-switch`} tone="danger" />
      </div>
      <p className={styles.status} role="status">{saved ? t("s11.saved") : ""}</p>
      {open ? (
        <Sheet
          open
          onClose={() => setOpen(false)}
          title={paused ? t("s11.intakeCard.resumeTitle") : t("s11.intakeCard.pauseTitle")}
          description={paused ? t("s11.intakeCard.resumeBody") : t("s11.intakeCard.pauseBody")}
          data-testid="s11-intake-sheet"
          footer={
            <>
              <Button variant="secondary" onClick={() => setOpen(false)}>{t("s11.cancel")}</Button>
              <Button variant={paused ? "primary" : "danger"} loading={busy} onClick={() => void confirm()} data-testid="s11-intake-confirm">
                {paused ? t("s11.intakeCard.resumeConfirm") : t("s11.intakeCard.pauseConfirm")}
              </Button>
            </>
          }
        >
          {message ? <Banner tone="danger" title={message} critical /> : null}
        </Sheet>
      ) : null}
    </Card>
  );
}

/* ---------- Retention (shortening asks first, with the count) ---------- */

function RetentionCard({
  settings,
  seed,
  saved,
  onSaved,
  onSave,
}: {
  settings: OrganisationSettings;
  seed: SettingsSeed | null;
  saved: boolean;
  onSaved: () => void;
  onSave?: AdminSettingsViewProps["onSave"];
}) {
  const t = useT();
  const titleId = useId();
  const [draft, setDraft] = useState(seed?.retentionDays ?? String(settings.retention_days));
  const [fieldError, setFieldError] = useState<string | null>(null);
  const [message, setMessage] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const [confirmFor, setConfirmFor] = useState<{ days: number; records: number | null } | null>(
    seed?.dialog === "retention" ? { days: Number(seed.retentionDays ?? settings.retention_days), records: seed.records ?? null } : null,
  );
  const [sheetMessage, setSheetMessage] = useState<string | null>(seed?.dialog === "retention" ? (seed.sheetMessage ?? null) : null);

  const days = wholeNumber(draft, RETENTION_MIN, RETENTION_MAX);
  const dirty = draft.trim() !== String(settings.retention_days);

  async function submit(event: FormEvent) {
    event.preventDefault();
    setMessage(null);
    if (days === null) return setFieldError(t("s11.retentionCard.error"));
    setFieldError(null);
    if (!onSave || !dirty) return;
    setBusy(true);
    const result = await onSave({ retention_days: days });
    setBusy(false);
    if (result.ok) onSaved();
    else if (result.kind === "confirm") {
      setSheetMessage(null);
      setConfirmFor({ days, records: result.records });
    } else if (result.kind === "error") setMessage(result.message);
  }

  async function confirmShorten() {
    if (!onSave || !confirmFor) return;
    setBusy(true);
    setSheetMessage(null);
    const result = await onSave({ retention_days: confirmFor.days }, true);
    setBusy(false);
    if (result.ok) {
      setConfirmFor(null);
      onSaved();
    } else if (result.kind === "error") setSheetMessage(result.message);
    else if (result.kind === "stale") setConfirmFor(null);
  }

  return (
    <form onSubmit={(e) => void submit(e)} noValidate className={styles.formCard}>
      <Card
        id={titleId}
        title={t("s11.retentionCard.title")}
        hint={t("s11.retentionCard.hint")}
        footer={<SaveRow label={t("s11.retentionCard.save")} busy={busy && !confirmFor} disabled={!dirty} saved={saved} message={message} />}
      >
        <Field
          label={t("s11.retentionCard.label")}
          type="number"
          inputMode="numeric"
          min={RETENTION_MIN}
          max={RETENTION_MAX}
          numeric
          value={draft}
          error={fieldError ?? undefined}
          onChange={(e) => {
            setDraft(e.target.value);
            setFieldError(null);
          }}
          data-testid="s11-retention"
        />
      </Card>
      {confirmFor ? (
        <Sheet
          open
          onClose={() => setConfirmFor(null)}
          title={t("s11.retentionCard.confirmTitle")}
          description={
            confirmFor.records === null
              ? t("s11.retentionCard.confirmUnknown", { days: confirmFor.days, current: settings.retention_days })
              : t("s11.retentionCard.confirmBody", { days: confirmFor.days, current: settings.retention_days, count: confirmFor.records })
          }
          data-testid="s11-retention-sheet"
          footer={
            <>
              <Button variant="secondary" onClick={() => setConfirmFor(null)}>{t("s11.cancel")}</Button>
              <Button variant="danger" loading={busy} onClick={() => void confirmShorten()} data-testid="s11-retention-confirm">
                {t("s11.retentionCard.confirm")}
              </Button>
            </>
          }
        >
          {sheetMessage ? <Banner tone="danger" title={sheetMessage} critical /> : null}
        </Sheet>
      ) : null}
    </form>
  );
}

/* ---------- Election day and public delay ---------- */

function ScheduleCard({
  settings,
  seed,
  saved,
  onSaved,
  onSave,
}: {
  settings: OrganisationSettings;
  seed: SettingsSeed | null;
  saved: boolean;
  onSaved: () => void;
  onSave?: AdminSettingsViewProps["onSave"];
}) {
  const t = useT();
  const titleId = useId();
  const [day, setDay] = useState(seed?.electionDay ?? settings.election_day ?? "");
  const [delay, setDelay] = useState(seed?.delay ?? String(settings.public_delay_minutes));
  const [delayError, setDelayError] = useState<string | null>(null);
  const [message, setMessage] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

  const minutes = wholeNumber(delay, DELAY_MIN, DELAY_MAX);
  const dirty = day !== (settings.election_day ?? "") || delay.trim() !== String(settings.public_delay_minutes);

  async function submit(event: FormEvent) {
    event.preventDefault();
    setMessage(null);
    if (minutes === null) return setDelayError(t("s11.scheduleCard.delayError"));
    setDelayError(null);
    if (!onSave || !dirty) return;
    setBusy(true);
    const result = await onSave({ election_day: day || null, public_delay_minutes: minutes });
    setBusy(false);
    if (result.ok) onSaved();
    else if (result.kind === "error") setMessage(result.message);
  }

  return (
    <form onSubmit={(e) => void submit(e)} noValidate className={styles.formCard}>
      <Card
        id={titleId}
        title={t("s11.scheduleCard.title")}
        footer={<SaveRow label={t("s11.scheduleCard.save")} busy={busy} disabled={!dirty} saved={saved} message={message} />}
      >
        <div className={styles.fields}>
          <DateField
            label={t("s11.scheduleCard.electionDay")}
            hint={t("s11.scheduleCard.electionDayHint")}
            value={day}
            onChange={(e) => setDay(e.target.value)}
            data-testid="s11-election-day"
          />

          <Field
            label={t("s11.scheduleCard.delay")}
            hint={t("s11.scheduleCard.delayHint")}
            type="number"
            inputMode="numeric"
            min={DELAY_MIN}
            max={DELAY_MAX}
            numeric
            value={delay}
            error={delayError ?? undefined}
            onChange={(e) => {
              setDelay(e.target.value);
              setDelayError(null);
            }}
            data-testid="s11-delay"
          />
        </div>
      </Card>
    </form>
  );
}

/* ---------- Party labels (locked once a result sheet exists) ---------- */

function PartiesCard({
  settings,
  seed,
  saved,
  onSaved,
  onSave,
}: {
  settings: OrganisationSettings;
  seed: SettingsSeed | null;
  saved: boolean;
  onSaved: () => void;
  onSave?: AdminSettingsViewProps["onSave"];
}) {
  const t = useT();
  const titleId = useId();
  const [draft, setDraft] = useState(seed?.parties ?? settings.party_labels.join(", "));
  const [locked, setLocked] = useState(seed?.partiesLocked ?? false);
  const [fieldError, setFieldError] = useState<string | null>(null);
  const [message, setMessage] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

  const labels = parseLabels(draft);
  const dirty = (labels ?? []).join(",") !== settings.party_labels.join(",") || labels === null;

  async function submit(event: FormEvent) {
    event.preventDefault();
    setMessage(null);
    if (labels === null) return setFieldError(t("s11.partiesCard.error"));
    setFieldError(null);
    if (!onSave || !dirty || locked) return;
    setBusy(true);
    const result = await onSave({ party_labels: labels });
    setBusy(false);
    if (result.ok) onSaved();
    else if (result.kind === "locked") setLocked(true);
    else if (result.kind === "error") setMessage(result.message);
  }

  return (
    <form onSubmit={(e) => void submit(e)} noValidate className={styles.formCard}>
      <Card
        id={titleId}
        title={t("s11.partiesCard.title")}
        hint={t("s11.partiesCard.hint")}
        footer={locked ? undefined : <SaveRow label={t("s11.partiesCard.save")} busy={busy} disabled={!dirty} saved={saved} message={message} />}
      >
        <Field
          label={t("s11.partiesCard.label")}
          autoCapitalize="characters"
          autoComplete="off"
          spellCheck={false}
          disabled={locked}
          value={draft}
          error={fieldError ?? undefined}
          onChange={(e) => {
            setDraft(e.target.value);
            setFieldError(null);
          }}
          data-testid="s11-parties"
        />
        {locked ? (
          <p className={styles.locked} data-testid="s11-parties-locked">
            <LockIcon size={18} />
            <span>{t("s11.partiesCard.locked")}</span>
          </p>
        ) : null}
      </Card>
    </form>
  );
}

/* ---------- Practice simulator ---------- */

function SimulatorCard({
  settings,
  saved,
  onSaved,
  onSave,
}: {
  settings: OrganisationSettings;
  saved: boolean;
  onSaved: () => void;
  onSave?: AdminSettingsViewProps["onSave"];
}) {
  const t = useT();
  const titleId = useId();
  const [busy, setBusy] = useState(false);
  const [message, setMessage] = useState<string | null>(null);
  const on = settings.simulator_enabled;

  async function toggle() {
    if (!onSave || busy) return;
    setBusy(true);
    setMessage(null);
    const result = await onSave({ simulator_enabled: !on });
    setBusy(false);
    if (result.ok) onSaved();
    else if (result.kind === "error") setMessage(result.message);
  }

  return (
    <Card id={titleId} title={t("s11.simCard.title")} hint={t("s11.simCard.hint")}>
      <div className={styles.switchRow}>
        <div className={styles.switchText}>
          <span id={`${titleId}-switch`} className={styles.switchLabel}>{t("s11.simCard.switch")}</span>
          <span className={styles.hint}>{on ? t("s11.simCard.on") : t("s11.simCard.off")}</span>
        </div>
        <Switch checked={on} onToggle={() => void toggle()} labelledBy={`${titleId}-switch`} tone="ink" busy={busy} />
      </div>
      <p className={styles.status} role="status">
        {message ? <span className={styles.problem}>{message}</span> : saved ? t("s11.saved") : ""}
      </p>
    </Card>
  );
}

/* ---------- Audit export ---------- */

function AuditCard({ seed, onExport }: { seed: SettingsSeed | null; onExport?: AdminSettingsViewProps["onExportAudit"] }) {
  const t = useT();
  const titleId = useId();
  const [format, setFormat] = useState<"jsonl" | "csv">("jsonl");
  const [from, setFrom] = useState(seed?.auditFrom ?? lagosDay(-30));
  const [to, setTo] = useState(seed?.auditTo ?? lagosDay(0));
  const [busy, setBusy] = useState(false);
  const [message, setMessage] = useState<string | null>(null);
  const [started, setStarted] = useState(false);

  const span = from && to ? (Date.parse(to) - Date.parse(from)) / 86_400_000 : NaN;
  const rangeOk = Number.isFinite(span) && span >= 0 && span < EXPORT_MAX_DAYS;

  async function submit(event: FormEvent) {
    event.preventDefault();
    setStarted(false);
    if (!rangeOk) return setMessage(t("s11.auditCard.rangeError"));
    setMessage(null);
    if (!onExport) return;
    setBusy(true);
    const result = await onExport(format, from, to);
    setBusy(false);
    if (result.ok) setStarted(true);
    else setMessage(result.message);
  }

  return (
    <form onSubmit={(e) => void submit(e)} noValidate className={styles.formCard} data-wide="">
      <Card
        id={titleId}
        title={t("s11.auditCard.title")}
        hint={t("s11.auditCard.hint")}
        wide
        footer={
          <>
            <Button type="submit" variant="secondary" icon={<DownloadIcon />} loading={busy} data-testid="s11-audit-download">
              {t("s11.auditCard.download")}
            </Button>
            <span className={styles.status} role="status">
              {message ? <span className={styles.problem}>{message}</span> : started ? t("s11.auditCard.started") : ""}
            </span>
          </>
        }
      >
        <div className={styles.auditFields}>
          <SegmentedControl
            label={t("s11.auditCard.format")}
            value={format}
            onChange={(value) => setFormat(value as "jsonl" | "csv")}
            options={[
              { value: "jsonl", label: "JSONL" },
              { value: "csv", label: "CSV" },
            ]}
            data-testid="s11-audit-format"
          />
          <DateField label={t("s11.auditCard.from")} value={from} max={to || undefined} onChange={(e) => setFrom(e.target.value)} data-testid="s11-audit-from" />
          <DateField label={t("s11.auditCard.to")} value={to} min={from || undefined} onChange={(e) => setTo(e.target.value)} data-testid="s11-audit-to" />
        </div>
      </Card>
    </form>
  );
}
