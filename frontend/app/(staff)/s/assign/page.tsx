"use client";

import { useEffect, useState } from "react";
import { api } from "../../../../lib/api/client";
import type { AssignmentListResponse } from "../../../../lib/api/types";
import { useT } from "../../../../lib/i18n/client";
import { AssignView } from "../_views/AssignView";

export default function AssignPage() {
  const t = useT();

  const [data, setData] = useState<AssignmentListResponse | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [assigning, setAssigning] = useState(false);
  const [successMessage, setSuccessMessage] = useState<string | null>(null);

  const loadAssignments = async () => {
    try {
      const res = await api("ASG-01", { query: { assigned: "any" } });
      if (!res.ok) {
        if (res.status === 404) {
          setError(t("staff.endpointNotReady"));
        } else {
          setError(res.error?.message || t("staff.networkError"));
        }
        return;
      }
      setData(res.data);
    } catch {
      setError(t("staff.networkError"));
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    let cancelled = false;
    void (async () => {
      try {
        const res = await api("ASG-01", { query: { assigned: "any" } });
        if (cancelled) return;
        if (!res.ok) {
          if (res.status === 404) {
            setError(t("staff.endpointNotReady"));
          } else {
            setError(res.error?.message || t("staff.networkError"));
          }
          return;
        }
        setData(res.data);
      } catch {
        if (!cancelled) setError(t("staff.networkError"));
      } finally {
        if (!cancelled) setLoading(false);
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [t]);

  const handleAssignBulk = async (
    items: Array<{ report_id: string; reviewer_id: string; version: number }>
  ) => {
    setAssigning(true);
    setError(null);
    setSuccessMessage(null);
    try {
      const res = await api("ASG-02", {
        body: { items },
      });

      if (!res.ok) {
        if (res.status === 404) {
          setError(t("staff.endpointNotReady"));
        } else {
          setError(res.error?.message || t("staff.networkError"));
        }
        return;
      }

      const succeeded = res.data.results.filter((r) => r.ok).length;
      const failed = res.data.results.filter((r) => !r.ok);

      if (succeeded > 0) {
        setSuccessMessage(t("s04.assignedSuccess", { count: succeeded }));
      }
      if (failed.length > 0) {
        const firstErr = failed[0].error?.message || "Error";
        setError(t("s04.assignedError", { error: firstErr }));
      }

      await loadAssignments();
    } catch {
      setError(t("staff.networkError"));
    } finally {
      setAssigning(false);
    }
  };

  return (
    <AssignView
      data={data}
      loading={loading}
      error={error}
      assigning={assigning}
      successMessage={successMessage}
      onAssignBulk={handleAssignBulk}
    />
  );
}
