"use client";

import { useEffect, useId, useMemo, useState, type FormEvent, useSyncExternalStore } from "react";
import type { StaffAccount, StaffRole, StaffStatus } from "../../../../lib/api/types";
import { localeTags, type Locale } from "../../../../lib/i18n/config";
import { useLocale, useT } from "../../../../lib/i18n/client";
import { Banner, Button, EmptyState, Field, SegmentedControl, Select, Sheet, Skeleton, StatusBadge, type StatusTone } from "../../../../ui";
import { formatWatDateTime } from "../../../../ui/format";
import { useMediaQuery } from "../../../../ui/hooks";
import { CopyIcon, PlusIcon, RetryIcon } from "../../../../ui/icons";
import styles from "./AdminStaffView.module.css";

export type OffboardReason = "access_ended" | "role_changed" | "credential_risk";

/** Roles an admin can give. Admin stands alone (the server refuses it with another role). */
const ROLE_ORDER: StaffRole[] = ["reviewer", "coordinator", "moderator", "org_admin"];
const OFFBOARD_REASONS: OffboardReason[] = ["access_ended", "role_changed", "credential_risk"];
const NAME_MIN = 2;
const NAME_MAX = 60;

/** What a dialog action reports back. The message is already in the reader's language. */
export type StaffActionResult = { ok: true } | { ok: false; message?: string; fields?: { email?: string; name?: string; roles?: string } };

export interface StaffInvite {
  url: string;
  expires_at: string;
  /** Who the link is for, shown beside it. */
  name: string;
}

/** Opens a dialog on first render. Used by the preview and by tests; the real page never sets it. */
export interface StaffDialogSeed {
  kind: "create" | "reset" | "offboard";
  staffId?: string;
  message?: string;
  fields?: { email?: string; name?: string; roles?: string };
  email?: string;
  name?: string;
  roles?: StaffRole[];
  reason?: OffboardReason;
}

type Dialog = { kind: "create" } | { kind: "reset"; staff: StaffAccount } | { kind: "offboard"; staff: StaffAccount };
type Filter = "all" | StaffStatus;

export interface AdminStaffViewProps {
  staffList: StaffAccount[];
  loading: boolean;
  error: string | null;
  /** The signed-in admin, so their own row cannot be offboarded. */
  currentUserId?: string | null;
  /** The one-time link from the last create. Shown once; the page clears it on close. */
  inviteResult: StaffInvite | null;
  onCreateStaff?: (email: string, displayName: string, roles: StaffRole[]) => Promise<StaffActionResult>;
  onReset2fa?: (staffId: string, version: number) => Promise<StaffActionResult>;
  onOffboard?: (staffId: string, reason: OffboardReason, version: number) => Promise<StaffActionResult>;
  onCloseInvite?: () => void;
  onRetry?: () => void;
  initialDialog?: StaffDialogSeed | null;
  "data-testid"?: string;
}

function formatDay(value: string, locale: Locale) {
  const tag = localeTags[locale];
  const supported = Intl.DateTimeFormat.supportedLocalesOf([tag]);
  // ADM-03 sends a full WAT timestamp; a bare date is read as midday WAT.
  const date = new Date(value.includes("T") ? value : `${value}T12:00:00+01:00`);
  if (Number.isNaN(date.getTime())) return value;
  return new Intl.DateTimeFormat(supported.length ? tag : "en-NG", { dateStyle: "medium", timeZone: "Africa/Lagos" }).format(date);
}

const statusTone: Record<"active" | "invited", StatusTone> = { active: "ok", invited: "wait" };

/** Offboarded is not a review state: dashed grey, never the blue "in review" tone. */
function StaffStatus({ status, label }: { status: StaffStatus; label: string }) {
  return status === "offboarded" ? <StatusBadge status="withdrawn" label={label} /> : <StatusBadge tone={statusTone[status]} label={label} />;
}

/** S-10 staff accounts: who can sign in, with which roles, and the safe ways to change that. */
export function AdminStaffView({
  staffList,
  loading,
  error,
  currentUserId = null,
  inviteResult,
  onCreateStaff,
  onReset2fa,
  onOffboard,
  onCloseInvite,
  onRetry,
  initialDialog = null,
  "data-testid": testId = "admin-staff-view",
}: AdminStaffViewProps) {
  const t = useT();
  const { locale } = useLocale();
  const tableWidth = useMediaQuery("(min-width: 768px)", true);
  const [filter, setFilter] = useState<Filter>("all");
  const [notice, setNotice] = useState<string | null>(null);
  const [dialog, setDialog] = useState<Dialog | null>(() => {
    if (!initialDialog) return null;
    if (initialDialog.kind === "create") return { kind: "create" };
    const staff = staffList.find((s) => s.id === initialDialog.staffId) ?? staffList[0];
    return staff ? { kind: initialDialog.kind, staff } : null;
  });

  const counts = useMemo(() => {
    const c = { all: staffList.length, active: 0, invited: 0, offboarded: 0 };
    for (const s of staffList) c[s.status] += 1;
    return c;
  }, [staffList]);
  const filterOptions = [
    { value: "all", label: `${t("s10.filter.all")} ${counts.all}` },
    { value: "active", label: `${t("s10.filter.active")} ${counts.active}` },
    { value: "invited", label: `${t("s10.filter.invited")} ${counts.invited}` },
    { value: "offboarded", label: `${t("s10.filter.offboarded")} ${counts.offboarded}` },
  ];
  const rows = filter === "all" ? staffList : staffList.filter((s) => s.status === filter);
  const showSkeleton = loading && staffList.length === 0 && !error;

  return (
    <div className={styles.page} data-testid={testId}>
      {error ? (
        <Banner
          tone="danger"
          title={error}
          critical
          action={onRetry ? <Button variant="secondary" icon={<RetryIcon />} onClick={onRetry}>{t("s10.retry")}</Button> : undefined}
        />
      ) : null}
      {notice ? <Banner tone="ok" title={notice} onDismiss={() => setNotice(null)} data-testid="s10-notice" /> : null}
      {inviteResult ? <InviteCard invite={inviteResult} onDone={() => onCloseInvite?.()} /> : null}

      <section className={styles.panel} aria-labelledby="s10-list">
        <div className={styles.head}>
          <h2 id="s10-list" className={styles.title}>{t("s10.staffList", { count: counts.all })}</h2>
          <div className={styles.headEnd}>
            {staffList.length > 0 ? (
              tableWidth ? (
                <SegmentedControl
                  label={t("s10.filter.label")}
                  value={filter}
                  onChange={(value) => setFilter(value as Filter)}
                  options={filterOptions}
                  data-testid="s10-filter"
                />
              ) : (
                <Select
                  label={t("s10.filter.label")}
                  value={filter}
                  onChange={(event) => setFilter(event.target.value as Filter)}
                  options={filterOptions}
                  placeholder={false}
                  className={styles.filterSelect}
                  data-testid="s10-filter"
                />
              )
            ) : null}
            <Button variant="primary" icon={<PlusIcon />} onClick={() => setDialog({ kind: "create" })} data-testid="s10-add">
              {t("s10.createStaff")}
            </Button>
          </div>
        </div>

        {showSkeleton ? (
          <div className={styles.loading} role="status" aria-busy="true" aria-label={t("staff.loading")}>
            <Skeleton lines={5} height={44} delay={0} />
          </div>
        ) : rows.length === 0 ? (
          error ? null : (
            <EmptyState title={staffList.length === 0 ? t("s10.empty") : t("s10.emptyFilter")} data-testid="s10-empty" />
          )
        ) : tableWidth ? (
          <div className={styles.scroller}>
            <table className={styles.table}>
              <caption className="eg-sr-only">{t("s10.caption")}</caption>
              <thead>
                <tr>
                  <th scope="col">{t("s10.columns.name")}</th>
                  <th scope="col">{t("s10.columns.roles")}</th>
                  <th scope="col">{t("s10.columns.status")}</th>
                  <th scope="col">{t("s10.columns.twofa")}</th>
                  <th scope="col">{t("s10.columns.lastSignIn")}</th>
                  <th scope="col"><span className="eg-sr-only">{t("s10.columns.actions")}</span></th>
                </tr>
              </thead>
              <tbody>
                {rows.map((st) => (
                  <tr key={st.id} data-off={st.status === "offboarded" ? "" : undefined}>
                    <th scope="row" className={styles.who}>
                      <Who staff={st} self={st.id === currentUserId} />
                    </th>
                    <td><Roles roles={st.roles} /></td>
                    <td><StaffStatus status={st.status} label={t(`s10.status.${st.status}`)} /></td>
                    <td><TwoFa on={st.totp_enrolled} /></td>
                    <td className={`${styles.nowrap} eg-tnum`}>
                      {st.last_sign_in_on ? formatDay(st.last_sign_in_on, locale) : <span className={styles.sub}>{t("s10.neverSignedIn")}</span>}
                    </td>
                    <td className={styles.actionsCell}>
                      <RowActions staff={st} self={st.id === currentUserId} onReset={() => setDialog({ kind: "reset", staff: st })} onOffboard={() => setDialog({ kind: "offboard", staff: st })} />
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        ) : (
          <ul className={styles.cards} aria-label={t("s10.caption")}>
            {rows.map((st) => (
              <li key={st.id} className={styles.cardRow} data-off={st.status === "offboarded" ? "" : undefined}>
                <Who staff={st} self={st.id === currentUserId} />
                <Roles roles={st.roles} />
                <div className={styles.badges}>
                  <StaffStatus status={st.status} label={t(`s10.status.${st.status}`)} />
                  <TwoFa on={st.totp_enrolled} />
                </div>
                <p className={`${styles.sub} eg-tnum`}>
                  {t("s10.columns.lastSignIn")}: {st.last_sign_in_on ? formatDay(st.last_sign_in_on, locale) : t("s10.neverSignedIn")}
                </p>
                <RowActions staff={st} self={st.id === currentUserId} onReset={() => setDialog({ kind: "reset", staff: st })} onOffboard={() => setDialog({ kind: "offboard", staff: st })} />
              </li>
            ))}
          </ul>
        )}
      </section>

      {dialog?.kind === "create" ? (
        <CreateSheet
          seed={initialDialog?.kind === "create" ? initialDialog : null}
          onClose={() => setDialog(null)}
          onSubmit={onCreateStaff}
        />
      ) : null}
      {dialog?.kind === "reset" ? (
        <ResetSheet
          staff={dialog.staff}
          seed={initialDialog?.kind === "reset" ? initialDialog : null}
          onClose={() => setDialog(null)}
          onSubmit={async () => {
            const result = (await onReset2fa?.(dialog.staff.id, dialog.staff.version)) ?? { ok: true as const };
            if (result.ok) setNotice(t("s10.reset.done", { name: dialog.staff.display_name }));
            return result;
          }}
        />
      ) : null}
      {dialog?.kind === "offboard" ? (
        <OffboardSheet
          staff={dialog.staff}
          seed={initialDialog?.kind === "offboard" ? initialDialog : null}
          onClose={() => setDialog(null)}
          onSubmit={async (reason) => {
            const result = (await onOffboard?.(dialog.staff.id, reason, dialog.staff.version)) ?? { ok: true as const };
            if (result.ok) setNotice(t("s10.offboardDialog.done", { name: dialog.staff.display_name }));
            return result;
          }}
        />
      ) : null}
    </div>
  );
}

/* ---------- Row pieces ---------- */

function Who({ staff, self }: { staff: StaffAccount; self: boolean }) {
  const t = useT();
  return (
    <span className={styles.whoStack}>
      <span className={styles.name}>
        {staff.display_name}
        {self ? <span className={styles.you}>{t("s10.you")}</span> : null}
      </span>
      <span className={styles.sub}>{staff.email}</span>
    </span>
  );
}

function Roles({ roles }: { roles: StaffRole[] }) {
  const t = useT();
  return (
    <span className={styles.roles}>
      {roles.map((role) => (
        <span key={role} className={styles.roleTag}>{t(`staff.roles.${role}`)}</span>
      ))}
    </span>
  );
}

function TwoFa({ on }: { on: boolean }) {
  const t = useT();
  return <StatusBadge tone={on ? "ok" : "attn"} label={on ? t("s10.twofa.on") : t("s10.twofa.off")} />;
}

/** Only the actions that can be used: no lone dash for offboarded people, no disabled Offboard for yourself. */
function RowActions({ staff, self, onReset, onOffboard }: { staff: StaffAccount; self: boolean; onReset: () => void; onOffboard: () => void }) {
  const t = useT();
  if (staff.status === "offboarded") return null;
  return (
    <div className={styles.rowActions}>
      <Button variant="secondary" onClick={onReset} aria-label={t("s10.reset2faFor", { name: staff.display_name })} data-testid={`s10-reset-${staff.id}`}>
        {t("s10.reset2fa")}
      </Button>
      {self ? (
        <span className={styles.selfNote}>{t("s10.selfNote")}</span>
      ) : (
        <Button
          variant="secondary"
          onClick={onOffboard}
          aria-label={t("s10.offboardFor", { name: staff.display_name })}
          data-testid={`s10-offboard-${staff.id}`}
        >
          {t("s10.offboard")}
        </Button>
      )}
    </div>
  );
}

/* ---------- Invite (shown once) ---------- */

function InviteCard({ invite, onDone }: { invite: StaffInvite; onDone: () => void }) {
  const t = useT();
  const { locale } = useLocale();
  // The page address is only known in the browser; the server render has none.
  const origin = useSyncExternalStore(
    () => () => {},
    () => window.location.origin,
    () => "",
  );
  const [copied, setCopied] = useState<"yes" | "failed" | null>(null);

  useEffect(() => {
    if (copied !== "yes") return;
    const id = window.setTimeout(() => setCopied(null), 2500);
    return () => window.clearTimeout(id);
  }, [copied]);

  async function copy() {
    try {
      await navigator.clipboard.writeText(origin + invite.url);
      setCopied("yes");
    } catch {
      setCopied("failed");
    }
  }

  return (
    <section className={styles.invite} aria-labelledby="s10-invite" data-testid="s10-invite">
      <h2 id="s10-invite" className={styles.title}>{t("s10.invite.title")}</h2>
      <p className={styles.body}>{t("s10.invite.body", { name: invite.name, when: formatWatDateTime(invite.expires_at, locale) })}</p>
      <div className={styles.linkRow}>
        <output className={styles.link} aria-label={t("s10.invite.label")}>{origin + invite.url}</output>
        <Button variant="secondary" icon={<CopyIcon size={16} />} onClick={() => void copy()} data-testid="s10-copy">
          {copied === "yes" ? t("s10.invite.copied") : t("s10.invite.copy")}
        </Button>
      </div>
      <p className={styles.copyState} role="status">{copied === "failed" ? t("s10.invite.copyFailed") : ""}</p>
      <div>
        <Button variant="primary" onClick={onDone} data-testid="s10-invite-done">{t("s10.invite.done")}</Button>
      </div>
    </section>
  );
}

/* ---------- Dialogs ---------- */

function emailLooksValid(value: string) {
  return /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(value.trim());
}

function CreateSheet({
  seed,
  onClose,
  onSubmit,
}: {
  seed: StaffDialogSeed | null;
  onClose: () => void;
  onSubmit?: AdminStaffViewProps["onCreateStaff"];
}) {
  const t = useT();
  const formId = useId();
  const [email, setEmail] = useState(seed?.email ?? "");
  const [name, setName] = useState(seed?.name ?? "");
  const [roles, setRoles] = useState<StaffRole[]>(seed?.roles ?? ["reviewer"]);
  const [busy, setBusy] = useState(false);
  const [message, setMessage] = useState<string | null>(seed?.message ?? null);
  const [fields, setFields] = useState<{ email?: string; name?: string; roles?: string }>(seed?.fields ?? {});

  function toggle(role: StaffRole) {
    setFields((f) => ({ ...f, roles: undefined }));
    if (role === "org_admin") return setRoles(roles.includes("org_admin") ? [] : ["org_admin"]);
    const rest = roles.filter((r) => r !== "org_admin");
    setRoles(rest.includes(role) ? rest.filter((r) => r !== role) : [...rest, role]);
  }

  async function submit(event: FormEvent) {
    event.preventDefault();
    const problems: { email?: string; name?: string; roles?: string } = {};
    if (!emailLooksValid(email)) problems.email = t("s10.errors.invalidEmail");
    const trimmed = name.trim();
    if (trimmed.length < NAME_MIN || trimmed.length > NAME_MAX) problems.name = t("s10.errors.invalidName");
    if (roles.length === 0) problems.roles = t("s10.errors.invalidRoles");
    setFields(problems);
    setMessage(null);
    if (Object.keys(problems).length > 0 || !onSubmit) return;
    setBusy(true);
    const result = await onSubmit(email.trim(), trimmed, roles);
    setBusy(false);
    if (result.ok) return onClose();
    setMessage(result.message ?? null);
    setFields(result.fields ?? {});
  }

  return (
    <Sheet
      open
      onClose={onClose}
      title={t("s10.create.title")}
      description={t("s10.create.description")}
      data-testid="s10-create-sheet"
      footer={
        <>
          <Button variant="secondary" onClick={onClose}>{t("s10.cancel")}</Button>
          <Button type="submit" form={formId} variant="primary" loading={busy} data-testid="s10-create-submit">{t("s10.create.submit")}</Button>
        </>
      }
    >
      <form id={formId} className={styles.form} onSubmit={(e) => void submit(e)} noValidate>
        {message ? <Banner tone="danger" title={message} critical data-testid="s10-create-error" /> : null}
        <Field
          label={t("s10.create.email")}
          type="email"
          inputMode="email"
          autoComplete="off"
          autoCapitalize="none"
          spellCheck={false}
          value={email}
          error={fields.email}
          onChange={(e) => {
            setEmail(e.target.value);
            setFields((f) => ({ ...f, email: undefined }));
          }}
          data-testid="s10-email"
        />
        <Field
          label={t("s10.create.name")}
          hint={t("s10.create.nameHint")}
          autoComplete="off"
          maxLength={NAME_MAX}
          value={name}
          error={fields.name}
          onChange={(e) => {
            setName(e.target.value);
            setFields((f) => ({ ...f, name: undefined }));
          }}
          data-testid="s10-name"
        />
        <fieldset className={styles.roleSet} aria-describedby={`${formId}-roles-hint`}>
          <legend className={styles.legend}>{t("s10.create.roles")}</legend>
          <p id={`${formId}-roles-hint`} className={styles.sub}>{t("s10.create.rolesHint")}</p>
          <div className={styles.roleGrid}>
            {ROLE_ORDER.map((role) => {
              const blocked = role !== "org_admin" && roles.includes("org_admin");
              return (
                <label key={role} className={styles.roleOption} data-checked={roles.includes(role) ? "" : undefined} data-blocked={blocked ? "" : undefined}>
                  <input type="checkbox" checked={roles.includes(role)} onChange={() => toggle(role)} data-testid={`s10-role-${role}`} />
                  <span>{t(`staff.roles.${role}`)}</span>
                </label>
              );
            })}
          </div>
          {fields.roles ? <p className={styles.fieldError} role="alert">{fields.roles}</p> : null}
        </fieldset>
      </form>
    </Sheet>
  );
}

function ResetSheet({
  staff,
  seed,
  onClose,
  onSubmit,
}: {
  staff: StaffAccount;
  seed: StaffDialogSeed | null;
  onClose: () => void;
  onSubmit: () => Promise<StaffActionResult>;
}) {
  const t = useT();
  const [busy, setBusy] = useState(false);
  const [message, setMessage] = useState<string | null>(seed?.message ?? null);

  async function confirm() {
    setBusy(true);
    setMessage(null);
    const result = await onSubmit();
    setBusy(false);
    if (result.ok) onClose();
    else setMessage(result.message ?? null);
  }

  return (
    <Sheet
      open
      onClose={onClose}
      title={t("s10.reset.title", { name: staff.display_name })}
      description={t("s10.reset.body", { name: staff.display_name })}
      data-testid="s10-reset-sheet"
      footer={
        <>
          <Button variant="secondary" onClick={onClose}>{t("s10.cancel")}</Button>
          <Button variant="danger" loading={busy} onClick={() => void confirm()} data-testid="s10-reset-confirm">{t("s10.reset.confirm")}</Button>
        </>
      }
    >
      {message ? <Banner tone="danger" title={message} critical data-testid="s10-reset-error" /> : null}
    </Sheet>
  );
}

function OffboardSheet({
  staff,
  seed,
  onClose,
  onSubmit,
}: {
  staff: StaffAccount;
  seed: StaffDialogSeed | null;
  onClose: () => void;
  onSubmit: (reason: OffboardReason) => Promise<StaffActionResult>;
}) {
  const t = useT();
  const [reason, setReason] = useState<OffboardReason>(seed?.reason ?? "access_ended");
  const [busy, setBusy] = useState(false);
  const [message, setMessage] = useState<string | null>(seed?.message ?? null);

  async function confirm() {
    setBusy(true);
    setMessage(null);
    const result = await onSubmit(reason);
    setBusy(false);
    if (result.ok) onClose();
    else setMessage(result.message ?? null);
  }

  return (
    <Sheet
      open
      onClose={onClose}
      title={t("s10.offboardDialog.title", { name: staff.display_name })}
      description={t("s10.offboardDialog.body", { name: staff.display_name })}
      data-testid="s10-offboard-sheet"
      footer={
        <>
          <Button variant="secondary" onClick={onClose}>{t("s10.cancel")}</Button>
          <Button variant="danger" loading={busy} onClick={() => void confirm()} data-testid="s10-offboard-confirm">{t("s10.offboardDialog.confirm")}</Button>
        </>
      }
    >
      <div className={styles.form}>
        {message ? <Banner tone="danger" title={message} critical data-testid="s10-offboard-error" /> : null}
        <Select
          label={t("s10.offboardDialog.reason")}
          placeholder={false}
          value={reason}
          onChange={(e) => setReason(e.target.value as OffboardReason)}
          options={OFFBOARD_REASONS.map((value) => ({ value, label: t(`s10.offboardDialog.reasons.${value}`) }))}
          data-testid="s10-offboard-reason"
        />
      </div>
    </Sheet>
  );
}
