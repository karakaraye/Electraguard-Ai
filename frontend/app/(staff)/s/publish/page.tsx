"use client";

import { useEffect, useState } from "react";
import { api } from "../../../../lib/api/client";
import type { SnapshotRecord } from "../../../../lib/api/types";
import { useT } from "../../../../lib/i18n/client";
import { PublishView } from "../_views/PublishView";

export default function PublishPage() {
  const t = useT();

  const [snapshots, setSnapshots] = useState<SnapshotRecord[]>([]);
  const [selectedId, setSelectedId] = useState<string | null>(null);
  const [hourlySchedule, setHourlySchedule] = useState(false);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  // Fetch snapshots list
  useEffect(() => {
    let cancelled = false;
    void (async () => {
      try {
        const res = await api("PUB-01.list", { query: {} });
        if (cancelled) return;
        if (!res.ok) {
          if (res.status === 404) {
            setError(t("staff.endpointNotReady"));
          } else {
            setError(res.error?.message || t("staff.networkError"));
          }
          return;
        }

        setSnapshots(res.data.items);
        if (!selectedId && res.data.items.length > 0) {
          setSelectedId(res.data.items[0].id);
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
  }, [selectedId, t]);

  const selectedSnapshot = snapshots.find((s) => s.id === selectedId) || null;

  const handleCreateSnapshot = async (cutoff?: string) => {
    setError(null);
    try {
      const res = await api("PUB-01.create", {
        body: cutoff ? { cutoff } : {},
      });
      if (!res.ok) {
        if (res.status === 404) {
          setError(t("staff.endpointNotReady"));
        } else {
          setError(res.error?.message || t("staff.networkError"));
        }
        return;
      }

      setSnapshots([res.data, ...snapshots]);
      setSelectedId(res.data.id);
    } catch {
      setError(t("staff.networkError"));
    }
  };

  const handleApprove = async (id: string, version: number) => {
    setError(null);
    try {
      const res = await api("PUB-01.approve", {
        params: { id },
        body: { version },
      });
      if (!res.ok) {
        setError(res.error?.message || t("staff.networkError"));
        return;
      }
      setSnapshots(snapshots.map((s) => (s.id === id ? res.data : s)));
    } catch {
      setError(t("staff.networkError"));
    }
  };

  const handleDiscard = async (id: string, version: number) => {
    setError(null);
    try {
      const res = await api("PUB-01.discard", {
        params: { id },
        body: { version },
      });
      if (!res.ok) {
        setError(res.error?.message || t("staff.networkError"));
        return;
      }
      setSnapshots(snapshots.map((s) => (s.id === id ? res.data : s)));
    } catch {
      setError(t("staff.networkError"));
    }
  };

  const handleToggleSchedule = async (hourly: boolean) => {
    setError(null);
    try {
      const res = await api("PUB-01.schedule", {
        body: { hourly, version: 1 },
      });
      if (res.ok) {
        setHourlySchedule(res.data.hourly);
      }
    } catch {
      // Ignored
    }
  };

  return (
    <PublishView
      snapshots={snapshots}
      selectedSnapshot={selectedSnapshot}
      hourlySchedule={hourlySchedule}
      loading={loading}
      error={error}
      onCreateSnapshot={handleCreateSnapshot}
      onApproveSnapshot={handleApprove}
      onDiscardSnapshot={handleDiscard}
      onToggleSchedule={handleToggleSchedule}
      onSelectSnapshot={setSelectedId}
    />
  );
}
