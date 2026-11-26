"use client";

import { useCallback, useEffect, useState } from "react";
import { api } from "../../../../lib/api/client";
import type { AlertListQuery, AlertStatus, AuditVerifyResponse, SecurityAlert } from "../../../../lib/api/types";
import { useT } from "../../../../lib/i18n/client";
import { SecurityView, type SecurityActionResult } from "../_views/SecurityView";

export default function SecurityPage() {
  const t = useT();
  const [statusFilter, setStatusFilter] = useState<AlertStatus>("open");
  const [alerts, setAlerts] = useState<SecurityAlert[]>([]);
  const [cursor, setCursor] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);
  const [loadingMore, setLoadingMore] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [verification, setVerification] = useState<AuditVerifyResponse | null>(null);
  const [verifying, setVerifying] = useState(false);
  const [verifyError, setVerifyError] = useState<string | null>(null);
  const [attempt, setAttempt] = useState(0);

  /** Never show the server's own words: only our own plain sentences. */
  const problem = useCallback(
    (res: { status: number }) =>
      res.status === 403 ? t("staff.forbidden") : res.status === 404 ? t("staff.endpointNotReady") : t("staff.networkError"),
    [t],
  );

  useEffect(() => {
    let cancelled = false;
    void (async () => {
      setLoading(true);
      setError(null);
      // The API accepts false_positive here, but its published query type leaves it out.
      const res = await api("SEC-01.list", { query: { status: statusFilter } as AlertListQuery });
      if (cancelled) return;
      setLoading(false);
      if (!res.ok) {
        setAlerts([]);
        setCursor(null);
        setError(problem(res));
        return;
      }
      setAlerts(res.data.items);
      setCursor(res.data.next_cursor);
    })();
    return () => {
      cancelled = true;
    };
  }, [statusFilter, attempt, problem]);

  async function loadMore() {
    if (!cursor) return;
    setLoadingMore(true);
    const res = await api("SEC-01.list", { query: { status: statusFilter, cursor } as AlertListQuery });
    setLoadingMore(false);
    if (!res.ok) {
      setError(problem(res));
      return;
    }
    const seen = new Set(alerts.map((alert) => alert.id));
    setAlerts([...alerts, ...res.data.items.filter((alert) => !seen.has(alert.id))]);
    setCursor(res.data.next_cursor);
  }

  async function updateAlert(
    id: string,
    status: "acknowledged" | "resolved" | "false_positive",
    version: number,
    note?: string,
  ): Promise<SecurityActionResult> {
    const res = await api("SEC-01.update", { params: { id }, body: { status, version, ...(note ? { note } : {}) } });
    if (res.ok) {
      setAttempt((n) => n + 1);
      return { ok: true };
    }
    if (res.status === 409) {
      setAttempt((n) => n + 1);
      return { ok: false, message: t("s12.staleVersion") };
    }
    return { ok: false, message: problem(res) };
  }

  async function verifyChain() {
    setVerifying(true);
    setVerifyError(null);
    const res = await api("AUD-01.verify", { query: {} });
    setVerifying(false);
    if (!res.ok) {
      setVerifyError(problem(res));
      return;
    }
    setVerification(res.data);
  }

  async function exportAudit(format: "jsonl" | "csv", from: string, to: string): Promise<SecurityActionResult> {
    const res = await api("AUD-01.export", { query: { format, from, to } });
    if (!res.ok) {
      return { ok: false, message: res.status === 400 || res.status === 422 ? t("s12.exportRange") : problem(res) };
    }
    const url = URL.createObjectURL(res.data);
    const link = document.createElement("a");
    link.href = url;
    link.download = `audit-${from}-to-${to}.${format}`;
    link.click();
    URL.revokeObjectURL(url);
    return { ok: true };
  }

  return (
    <SecurityView
      alerts={alerts}
      verification={verification}
      loading={loading}
      verifying={verifying}
      error={error}
      verifyError={verifyError}
      statusFilter={statusFilter}
      onStatusFilterChange={setStatusFilter}
      hasMore={cursor !== null}
      loadingMore={loadingMore}
      onLoadMore={() => void loadMore()}
      onRetry={() => setAttempt((n) => n + 1)}
      onUpdateAlert={updateAlert}
      onVerifyChain={() => void verifyChain()}
      onExportAudit={exportAudit}
    />
  );
}
