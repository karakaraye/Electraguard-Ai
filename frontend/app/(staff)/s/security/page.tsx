"use client";

import { useEffect, useState, useTransition } from "react";
import { api } from "../../../../lib/api/client";
import type { AlertStatus, AuditVerifyResponse, SecurityAlert } from "../../../../lib/api/types";
import { useT } from "../../../../lib/i18n/client";
import { SecurityView } from "../_views/SecurityView";

export default function SecurityPage() {
  const t = useT();
  const [isPending, startTransition] = useTransition();
  const [loading, setLoading] = useState(true);
  const [verifying, setVerifying] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [alerts, setAlerts] = useState<SecurityAlert[]>([]);
  const [verification, setVerification] = useState<AuditVerifyResponse | null>(null);
  const [statusFilter, setStatusFilter] = useState<AlertStatus | "all">("all");
  const [reloadKey, setReloadKey] = useState(0);

  useEffect(() => {
    let cancelled = false;
    void (async () => {
      try {
        setError(null);
        const [resAlerts, resVerify] = await Promise.allSettled([
          api("SEC-01.list", {
            query:
              statusFilter === "all" || statusFilter === "false_positive"
                ? {}
                : { status: statusFilter },
          }),
          api("AUD-01.verify", { query: {} }),
        ]);

        if (cancelled) return;

        if (resAlerts.status === "fulfilled") {
          if (resAlerts.value.ok) setAlerts(resAlerts.value.data.items);
          else if (resAlerts.value.status === 404) setError(t("staff.endpointNotReady"));
          else setError(resAlerts.value.error.message);
        }

        if (resVerify.status === "fulfilled") {
          if (resVerify.value.ok) setVerification(resVerify.value.data);
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
  }, [t, statusFilter, reloadKey]);

  const handleUpdateAlert = (
    id: string,
    status: "acknowledged" | "resolved" | "false_positive",
    version: number,
    note?: string
  ) => {
    startTransition(async () => {
      try {
        setError(null);
        const res = await api("SEC-01.update", {
          params: { id },
          body: {
            status,
            version,
            note,
          },
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

  const handleVerifyChain = async () => {
    setVerifying(true);
    try {
      setError(null);
      const res = await api("AUD-01.verify", { query: {} });
      if (res.ok) {
        setVerification(res.data);
      } else {
        setError(res.error.message);
      }
    } catch {
      setError(t("staff.networkError"));
    } finally {
      setVerifying(false);
    }
  };

  const handleExportAudit = async (format: "jsonl" | "csv", from: string, to: string) => {
    try {
      const res = await api("AUD-01.export", {
        query: { format, from, to },
      });
      if (res.ok) {
        const url = URL.createObjectURL(res.data);
        const a = document.createElement("a");
        a.href = url;
        a.download = `audit-export-${from}-to-${to}.${format}`;
        a.click();
        URL.revokeObjectURL(url);
      } else {
        setError(res.error.message);
      }
    } catch {
      setError(t("staff.networkError"));
    }
  };

  return (
    <SecurityView
      alerts={alerts}
      verification={verification}
      loading={loading || isPending}
      verifying={verifying}
      error={error}
      statusFilter={statusFilter}
      onStatusFilterChange={setStatusFilter}
      onUpdateAlert={handleUpdateAlert}
      onVerifyChain={handleVerifyChain}
      onExportAudit={handleExportAudit}
    />
  );
}
