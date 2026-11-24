"use client";

import { useEffect, useState, useTransition } from "react";
import { api } from "../../../../../lib/api/client";
import type { OrganisationSettings, UpdateSettingsRequest } from "../../../../../lib/api/types";
import { useT } from "../../../../../lib/i18n/client";
import { AdminSettingsView } from "../../_views/AdminSettingsView";

export default function AdminSettingsPage() {
  const t = useT();
  const [isPending, startTransition] = useTransition();
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [saveSuccess, setSaveSuccess] = useState(false);
  const [confirmationNotice, setConfirmationNotice] = useState<string | null>(null);
  const [settings, setSettings] = useState<OrganisationSettings | null>(null);
  const [reloadKey, setReloadKey] = useState(0);

  useEffect(() => {
    let cancelled = false;
    void (async () => {
      try {
        setError(null);
        const res = await api("ADM-04.get", {});
        if (cancelled) return;
        if (res.ok) {
          setSettings(res.data);
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

  const handleSave = (updates: UpdateSettingsRequest) => {
    startTransition(async () => {
      try {
        setError(null);
        setSaveSuccess(false);
        setConfirmationNotice(null);

        const res = await api("ADM-04.update", {
          body: updates,
        });

        if (res.ok) {
          setSettings(res.data);
          setSaveSuccess(true);
          setReloadKey((k) => k + 1);
        } else if (res.status === 409 && res.error.code === "confirmation_required") {
          setConfirmationNotice(res.error.message);
        } else {
          setError(res.error.message);
        }
      } catch {
        setError(t("staff.networkError"));
      }
    });
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
    <AdminSettingsView
      settings={settings}
      loading={loading || isPending}
      error={error}
      saveSuccess={saveSuccess}
      confirmationNotice={confirmationNotice}
      onSave={handleSave}
      onExportAudit={handleExportAudit}
    />
  );
}
