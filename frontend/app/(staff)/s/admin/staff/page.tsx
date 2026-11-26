"use client";

import { useCallback, useEffect, useState } from "react";
import { api } from "../../../../../lib/api/client";
import type { StaffAccount, StaffRole } from "../../../../../lib/api/types";
import { useT } from "../../../../../lib/i18n/client";
import { AdminStaffView, type OffboardReason, type StaffActionResult, type StaffInvite } from "../../_views/AdminStaffView";

export default function AdminStaffPage() {
  const t = useT();
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [staffList, setStaffList] = useState<StaffAccount[]>([]);
  const [meId, setMeId] = useState<string | null>(null);
  /** The one-time link lives only in this state and is dropped when the admin closes the card. */
  const [invite, setInvite] = useState<StaffInvite | null>(null);
  const [reloadKey, setReloadKey] = useState(0);

  const problem = useCallback(
    (status: number) => (status === 403 ? t("staff.forbidden") : status === 404 ? t("staff.endpointNotReady") : t("staff.networkError")),
    [t],
  );
  const reload = () => setReloadKey((k) => k + 1);

  useEffect(() => {
    let cancelled = false;
    void (async () => {
      const res = await api("AUTH-07", {});
      if (!cancelled && res.ok && res.data.authenticated) setMeId(res.data.user.id);
    })();
    return () => {
      cancelled = true;
    };
  }, []);

  useEffect(() => {
    let cancelled = false;
    void (async () => {
      const res = await api("ADM-03.list", { query: {} });
      if (cancelled) return;
      setLoading(false);
      if (res.ok) {
        setError(null);
        setStaffList(res.data.items);
      } else {
        setError(problem(res.status));
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [problem, reloadKey]);

  /** Errors every change can hit, in plain words. */
  function failure(status: number, code: string): StaffActionResult | null {
    if (code === "stale_version") {
      reload();
      return { ok: false, message: t("s10.errors.stale") };
    }
    if (code === "invalid_transition") {
      reload();
      return { ok: false, message: t("s10.errors.alreadyOffboarded") };
    }
    if (code === "last_admin") return { ok: false, message: t("s10.errors.lastAdmin") };
    void status;
    return null;
  }

  async function createStaff(email: string, displayName: string, roles: StaffRole[]): Promise<StaffActionResult> {
    const res = await api("ADM-03.create", { body: { email, display_name: displayName, roles } });
    if (res.ok) {
      setInvite({ ...res.data.invite, name: displayName });
      reload();
      return { ok: true };
    }
    const fields = "fields" in res.error ? res.error.fields : undefined;
    if (res.status === 422 && fields) {
      return {
        ok: false,
        message: fields.email || fields.display_name || fields.roles ? undefined : t("s10.errors.invalid"),
        fields: {
          email: fields.email ? (fields.email.code === "duplicate" ? t("s10.errors.duplicate") : t("s10.errors.invalidEmail")) : undefined,
          name: fields.display_name ? t("s10.errors.invalidName") : undefined,
          roles: fields.roles ? t("s10.errors.invalidRoles") : undefined,
        },
      };
    }
    return failure(res.status, res.error.code) ?? { ok: false, message: problem(res.status) };
  }

  async function reset2fa(staffId: string, version: number): Promise<StaffActionResult> {
    const res = await api("ADM-03.reset_2fa", { params: { id: staffId }, body: { version } });
    if (res.ok) {
      reload();
      return { ok: true };
    }
    return failure(res.status, res.error.code) ?? { ok: false, message: problem(res.status) };
  }

  async function offboard(staffId: string, reason: OffboardReason, version: number): Promise<StaffActionResult> {
    const res = await api("ADM-03.offboard", { params: { id: staffId }, body: { reason, version } });
    if (res.ok) {
      reload();
      return { ok: true };
    }
    // The server answers "forbidden" both for a missing right and for offboarding yourself.
    if (res.status === 403 && staffId === meId) return { ok: false, message: t("s10.errors.selfOffboard") };
    return failure(res.status, res.error.code) ?? { ok: false, message: problem(res.status) };
  }

  return (
    <AdminStaffView
      staffList={staffList}
      loading={loading}
      error={error}
      currentUserId={meId}
      inviteResult={invite}
      onCreateStaff={createStaff}
      onReset2fa={reset2fa}
      onOffboard={offboard}
      onCloseInvite={() => setInvite(null)}
      onRetry={() => {
        setLoading(true);
        reload();
      }}
    />
  );
}
