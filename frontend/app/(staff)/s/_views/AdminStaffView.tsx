"use client";

import { useState } from "react";
import type { StaffAccount, StaffRole } from "../../../../lib/api/types";
import { useT } from "../../../../lib/i18n/client";
import { Banner, Button, EmptyState, Field } from "../../../../ui";
import { CopyIcon } from "../../../../ui/icons";
import styles from "./AdminStaffView.module.css";

export interface AdminStaffViewProps {
  staffList: StaffAccount[];
  loading: boolean;
  error: string | null;
  inviteResult: { url: string; expires_at: string } | null;
  onCreateStaff?: (email: string, displayName: string, roles: StaffRole[]) => void;
  onReset2fa?: (staffId: string, version: number) => void;
  onOffboard?: (staffId: string, reason: "access_ended" | "role_changed" | "credential_risk", version: number) => void;
  onCloseInvite?: () => void;
  "data-testid"?: string;
}

export function AdminStaffView({
  staffList,
  loading,
  error,
  inviteResult,
  onCreateStaff,
  onReset2fa,
  onOffboard,
  onCloseInvite,
  "data-testid": testId = "admin-staff-view",
}: AdminStaffViewProps) {
  const t = useT();

  const [showCreate, setShowCreate] = useState(false);
  const [newEmail, setNewEmail] = useState("");
  const [newName, setNewName] = useState("");
  const [newRoles, setNewRoles] = useState<StaffRole[]>(["reviewer"]);
  const [copied, setCopied] = useState(false);

  const [offboardTarget, setOffboardTarget] = useState<StaffAccount | null>(null);
  const [offboardReason, setOffboardReason] = useState<"access_ended" | "role_changed" | "credential_risk">("access_ended");

  const handleRoleToggle = (role: StaffRole) => {
    if (role === "org_admin") {
      setNewRoles(["org_admin"]);
      return;
    }
    const withoutAdmin = newRoles.filter((r) => r !== "org_admin");
    if (withoutAdmin.includes(role)) {
      if (withoutAdmin.length > 1) {
        setNewRoles(withoutAdmin.filter((r) => r !== role));
      }
    } else {
      setNewRoles([...withoutAdmin, role]);
    }
  };

  const handleCreateSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    if (!newEmail.trim() || !newName.trim() || !onCreateStaff) return;
    onCreateStaff(newEmail, newName, newRoles);
    setNewEmail("");
    setNewName("");
    setShowCreate(false);
  };

  const handleCopyInvite = async () => {
    if (!inviteResult?.url) return;
    try {
      await navigator.clipboard.writeText(window.location.origin + inviteResult.url);
      setCopied(true);
      setTimeout(() => setCopied(false), 2000);
    } catch {
      // Ignored
    }
  };

  return (
    <div className={styles.container} data-testid={testId}>
      {error && <Banner tone="danger" title={error} critical />}

      <div className={styles.topSection}>
        <div>
          <h2 style={{ margin: 0, font: "var(--t-heading)" }}>
            {t("s10.staffList", { count: staffList.length })}
          </h2>
        </div>
        <Button variant="primary" onClick={() => setShowCreate(!showCreate)}>
          {t("s10.createStaff")}
        </Button>
      </div>

      {/* Invite Modal / Box */}
      {inviteResult && (
        <section className={styles.inviteModal}>
          <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center" }}>
            <strong>{t("s10.inviteUrl")}</strong>
            <Button type="button" variant="quiet" onClick={onCloseInvite}>
              {t("ui.close")}
            </Button>
          </div>
          <p style={{ margin: 0, fontSize: "0.875rem" }}>
            Hand this one-time link to the staff member. It expires at {inviteResult.expires_at}.
          </p>
          <div className={styles.inviteUrlBox}>
            <span>{typeof window !== "undefined" ? window.location.origin : ""}{inviteResult.url}</span>
            <Button type="button" variant="secondary" onClick={handleCopyInvite}>
              <CopyIcon size={14} />
              <span>{copied ? "Copied" : t("s10.copyInvite")}</span>
            </Button>
          </div>
        </section>
      )}

      {/* Create Staff Form */}
      {showCreate && (
        <div className={styles.card}>
          <h3 className={styles.cardTitle}>{t("s10.createStaff")}</h3>
          <form onSubmit={handleCreateSubmit} style={{ display: "flex", flexDirection: "column", gap: "var(--s-3)" }}>
            <Field
              id="staff-email"
              label={t("s10.email")}
              type="email"
              required
              value={newEmail}
              onChange={(e) => setNewEmail(e.target.value)}
            />
            <Field
              id="staff-display-name"
              label={t("s10.displayName")}
              required
              maxLength={60}
              value={newName}
              onChange={(e) => setNewName(e.target.value)}
            />

            <div>
              <span style={{ fontWeight: 600, fontSize: "0.875rem", display: "block", marginBottom: "var(--s-1)" }}>
                {t("s10.roles")}
              </span>
              <p style={{ margin: "0 0 var(--s-2)", fontSize: "0.75rem", color: "var(--ink-2)" }}>
                {t("s10.roleAdminAlone")}
              </p>
              <div style={{ display: "flex", gap: "var(--s-4)", flexWrap: "wrap" }}>
                {(["reviewer", "moderator", "coordinator", "org_admin"] as StaffRole[]).map((role) => (
                  <label key={role} style={{ display: "flex", alignItems: "center", gap: "var(--s-1)" }}>
                    <input
                      type="checkbox"
                      checked={newRoles.includes(role)}
                      onChange={() => handleRoleToggle(role)}
                    />
                    <span>{t(`staff.roles.${role}` as const)}</span>
                  </label>
                ))}
              </div>
            </div>

            <div style={{ display: "flex", gap: "var(--s-2)" }}>
              <Button type="submit" variant="primary" disabled={!newEmail.trim() || !newName.trim()}>
                {t("common.save")}
              </Button>
              <Button type="button" variant="quiet" onClick={() => setShowCreate(false)}>
                {t("ui.cancel")}
              </Button>
            </div>
          </form>
        </div>
      )}

      {/* Staff Accounts Table */}
      <div className={styles.card}>
        {loading && staffList.length === 0 && (
          <div style={{ padding: "var(--s-4)", textAlign: "center", color: "var(--ink-2)" }}>
            {t("staff.loading")}
          </div>
        )}

        {!loading && staffList.length === 0 && (
          <EmptyState title="No staff members registered" />
        )}

        {staffList.length > 0 && (
          <div className={styles.tableWrapper}>
            <table className={styles.table}>
              <thead>
                <tr>
                  <th>Staff Member</th>
                  <th>Email</th>
                  <th>Roles</th>
                  <th>Status</th>
                  <th>2FA Enrolled</th>
                  <th>Actions</th>
                </tr>
              </thead>
              <tbody>
                {staffList.map((st) => (
                  <tr key={st.id}>
                    <td><strong>{st.display_name}</strong></td>
                    <td>{st.email}</td>
                    <td>
                      {st.roles.map((r) => (
                        <span key={r} className={styles.roleTag}>
                          {t(`staff.roles.${r}` as const)}
                        </span>
                      ))}
                    </td>
                    <td>
                      <span
                        style={{
                          fontWeight: 600,
                          color:
                            st.status === "active"
                              ? "var(--ok)"
                              : st.status === "invited"
                              ? "var(--attn-ink)"
                              : "var(--danger)",
                        }}
                      >
                        {st.status.toUpperCase()}
                      </span>
                    </td>
                    <td>{st.totp_enrolled ? "Yes" : "No"}</td>
                    <td>
                      <div style={{ display: "flex", gap: "var(--s-2)" }}>
                        {st.status !== "offboarded" && (
                          <>
                            <Button
                              type="button"
                              variant="quiet"
                              onClick={() => onReset2fa?.(st.id, st.version)}
                            >
                              {t("s10.reset2fa")}
                            </Button>
                            <Button
                              type="button"
                              variant="quiet"
                              onClick={() => setOffboardTarget(st)}
                            >
                              {t("s10.offboard")}
                            </Button>
                          </>
                        )}
                      </div>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </div>

      {/* Offboard Confirmation */}
      {offboardTarget && (
        <div className={styles.card} style={{ border: "2px solid var(--danger)" }}>
          <h3 style={{ margin: 0, color: "var(--danger)" }}>
            Offboard {offboardTarget.display_name}?
          </h3>
          <p style={{ margin: 0, fontSize: "0.875rem" }}>
            {t("s10.offboardWarning")}
          </p>
          <div>
            <label htmlFor="offboard-reason">
              <strong>{t("s10.offboardReason")}</strong>
            </label>
            <select
              id="offboard-reason"
              className="eg-select"
              value={offboardReason}
              onChange={(e) =>
                setOffboardReason(e.target.value as "access_ended" | "role_changed" | "credential_risk")
              }
              style={{ display: "block", marginTop: "var(--s-1)" }}
            >
              <option value="access_ended">Access ended</option>
              <option value="role_changed">Role changed</option>
              <option value="credential_risk">Credential risk</option>
            </select>
          </div>
          <div style={{ display: "flex", gap: "var(--s-2)", marginTop: "var(--s-2)" }}>
            <Button
              type="button"
              variant="danger"
              onClick={() => {
                onOffboard?.(offboardTarget.id, offboardReason, offboardTarget.version);
                setOffboardTarget(null);
              }}
            >
              Confirm Offboard
            </Button>
            <Button type="button" variant="quiet" onClick={() => setOffboardTarget(null)}>
              {t("ui.cancel")}
            </Button>
          </div>
        </div>
      )}
    </div>
  );
}
