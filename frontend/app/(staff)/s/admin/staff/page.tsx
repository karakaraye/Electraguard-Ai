"use client";

import { useEffect, useState, useTransition } from "react";
import { api } from "../../../../../lib/api/client";
import type { StaffAccount, StaffRole } from "../../../../../lib/api/types";
import { useT } from "../../../../../lib/i18n/client";
import { AdminStaffView } from "../../_views/AdminStaffView";

export default function AdminStaffPage() {
  const t = useT();
  const [isPending, startTransition] = useTransition();
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [staffList, setStaffList] = useState<StaffAccount[]>([]);
  const [inviteResult, setInviteResult] = useState<{ url: string; expires_at: string } | null>(null);
  const [reloadKey, setReloadKey] = useState(0);

  useEffect(() => {
    let cancelled = false;
    void (async () => {
      try {
        setError(null);
        const res = await api("ADM-03.list", { query: {} });
        if (cancelled) return;
        if (res.ok) {
          setStaffList(res.data.items);
        } else if (res.status === 404) {
          setError(t("staff.endpointNotReady"));
        } else {
          setError(res.error.message);
        }
      } catch {
        if (!cancelled) setError(t("staff.networkError"));
      } finally {
        if (!cancelled) setLoading(false);
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [t, reloadKey]);

  const handleCreateStaff = (email: string, displayName: string, roles: StaffRole[]) => {
    startTransition(async () => {
      try {
        setError(null);
        const res = await api("ADM-03.create", {
          body: {
            email,
            display_name: displayName,
            roles,
          },
        });
        if (res.ok) {
          setInviteResult(res.data.invite);
          setReloadKey((k) => k + 1);
        } else {
          setError(res.error.message);
        }
      } catch {
        setError(t("staff.networkError"));
      }
    });
  };

  const handleReset2fa = (staffId: string, version: number) => {
    startTransition(async () => {
      try {
        setError(null);
        const res = await api("ADM-03.reset_2fa", {
          params: { id: staffId },
          body: { version },
        });
        if (res.ok) {
          setReloadKey((k) => k + 1);
        } else {
          setError(res.error.message);
        }
      } catch {
        setError(t("staff.networkError"));
      }
    });
  };

  const handleOffboard = (
    staffId: string,
    reason: "access_ended" | "role_changed" | "credential_risk",
    version: number
  ) => {
    startTransition(async () => {
      try {
        setError(null);
        const res = await api("ADM-03.offboard", {
          params: { id: staffId },
          body: { reason, version },
        });
        if (res.ok) {
          setReloadKey((k) => k + 1);
        } else {
          setError(res.error.message);
        }
      } catch {
        setError(t("staff.networkError"));
      }
    });
  };

  return (
    <AdminStaffView
      staffList={staffList}
      loading={loading || isPending}
      error={error}
      inviteResult={inviteResult}
      onCreateStaff={handleCreateStaff}
      onReset2fa={handleReset2fa}
      onOffboard={handleOffboard}
      onCloseInvite={() => setInviteResult(null)}
    />
  );
}
