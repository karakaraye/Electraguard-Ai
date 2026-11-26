"use client";

import { useCallback, useEffect, useState } from "react";
import { api } from "../../../../../lib/api/client";
import type { OrganisationSettings } from "../../../../../lib/api/types";
import { useT } from "../../../../../lib/i18n/client";
import { AdminSettingsView, type ExportResult, type SettingsChanges, type SettingsSaveResult } from "../../_views/AdminSettingsView";

/** The server states the number of records a shorter retention deletes only in its message ("…delete 1,234 records…"). */
function recordsFrom(message: string): number | null {
  const match = message.match(/delete\s+([\d,]+)\s+record/i);
  if (!match) return null;
  const value = Number(match[1].replace(/,/g, ""));
  return Number.isFinite(value) ? value : null;
}

/** S-11 organisation settings (ADM-04): each section saves on its own, with the settings version. */
export default function AdminSettingsPage() {
  const t = useT();
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [notice, setNotice] = useState<string | null>(null);
  const [settings, setSettings] = useState<OrganisationSettings | null>(null);
  const [reloadKey, setReloadKey] = useState(0);

  useEffect(() => {
    let cancelled = false;
    void (async () => {
      try {
        const res = await api("ADM-04.get", {});
        if (cancelled) return;
        if (res.ok) {
          setSettings(res.data);
          setError(null);
        } else setError(res.status === 404 ? t("staff.endpointNotReady") : res.error.message);
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

  const reload = useCallback(() => {
    setLoading(true);
    setReloadKey((key) => key + 1);
  }, []);

  const save = useCallback(
    async (changes: SettingsChanges, confirm?: boolean): Promise<SettingsSaveResult> => {
      if (!settings) return { ok: false, kind: "error", message: t("staff.networkError") };
      try {
        const res = await api("ADM-04.update", { body: { ...changes, version: settings.version, ...(confirm ? { confirm: true } : {}) } });
        if (res.ok) {
          setSettings(res.data);
          setNotice(null);
          return { ok: true };
        }
        if (res.status === 409 && res.error.code === "confirmation_required") return { ok: false, kind: "confirm", records: recordsFrom(res.error.message) };
        if (res.status === 409 && res.error.code === "stale_version") {
          setNotice(res.error.message);
          reload();
          return { ok: false, kind: "stale" };
        }
        if (res.status === 409 && res.error.code === "invalid_transition") return { ok: false, kind: "locked" };
        return { ok: false, kind: "error", message: res.error.message };
      } catch {
        return { ok: false, kind: "error", message: t("staff.networkError") };
      }
    },
    [settings, t, reload],
  );

  const exportAudit = useCallback(
    async (format: "jsonl" | "csv", from: string, to: string): Promise<ExportResult> => {
      try {
        const res = await api("AUD-01.export", { query: { format, from, to } });
        if (!res.ok) return { ok: false, message: res.error.message };
        const url = URL.createObjectURL(res.data);
        const link = document.createElement("a");
        link.href = url;
        link.download = `audit-export-${from}-to-${to}.${format}`;
        link.click();
        URL.revokeObjectURL(url);
        return { ok: true };
      } catch {
        return { ok: false, message: t("staff.networkError") };
      }
    },
    [t],
  );

  return <AdminSettingsView settings={settings} loading={loading} error={error} notice={notice} onSave={save} onExportAudit={exportAudit} onRetry={reload} />;
}
