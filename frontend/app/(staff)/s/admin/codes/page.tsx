"use client";

import { useEffect, useState } from "react";
import { api } from "../../../../../lib/api/client";
import type { CodeBatch, CodeCard, ObserverCodeRow, RevokeReason } from "../../../../../lib/api/types";
import { useT } from "../../../../../lib/i18n/client";
import { AdminCodesView } from "../../_views/AdminCodesView";

export default function AdminCodesPage() {
  const t = useT();

  const [batches, setBatches] = useState<CodeBatch[]>([]);
  const [codes, setCodes] = useState<ObserverCodeRow[]>([]);
  const [activeCards, setActiveCards] = useState<CodeCard[] | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [reloadKey, setReloadKey] = useState(0);

  useEffect(() => {
    let cancelled = false;
    void (async () => {
      try {
        const [resBatches, resCodes] = await Promise.allSettled([
          api("ADM-01.list", { query: {} }),
          api("ADM-01.codes", { query: {} }),
        ]);

        if (cancelled) return;

        if (resBatches.status === "fulfilled") {
          if (resBatches.value.ok) setBatches(resBatches.value.data.items);
          else if (resBatches.value.status === 404) setError(t("staff.endpointNotReady"));
        }
        if (resCodes.status === "fulfilled") {
          if (resCodes.value.ok) setCodes(resCodes.value.data.items);
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

  const handleCreateBatch = async (label: string, count: number) => {
    setError(null);
    try {
      const res = await api("ADM-01.create", {
        body: { label, count },
      });
      if (!res.ok) {
        if (res.status === 404) setError(t("staff.endpointNotReady"));
        else setError(res.error?.message || t("staff.networkError"));
        return;
      }

      setBatches([res.data.batch, ...batches]);
      setActiveCards(res.data.cards);
      setReloadKey((k) => k + 1);
    } catch {
      setError(t("staff.networkError"));
    }
  };

  const handlePrintData = async (batchId: string) => {
    setError(null);
    try {
      const res = await api("ADM-01.print_data", {
        params: { id: batchId },
        body: { confirm_reset_setup_pins: true },
      });
      if (!res.ok) {
        if (res.status === 404) setError(t("staff.endpointNotReady"));
        else setError(res.error?.message || t("staff.networkError"));
        return;
      }

      setActiveCards(res.data.cards);
    } catch {
      setError(t("staff.networkError"));
    }
  };

  const handleRevoke = async (code: string, reason: RevokeReason) => {
    try {
      const res = await api("ADM-02.revoke", {
        params: { observer_code: code },
        body: { reason },
      });
      if (res.ok) {
        setCodes(codes.map((c) => (c.observer_code === code ? { ...c, status: "revoked" } : c)));
      }
    } catch {
      // Ignored
    }
  };

  const handleReissue = async (code: string, reason: RevokeReason) => {
    try {
      const res = await api("ADM-02.reissue", {
        params: { observer_code: code },
        body: { reason },
      });
      if (res.ok) {
        setActiveCards([res.data.card]);
        setReloadKey((k) => k + 1);
      }
    } catch {
      // Ignored
    }
  };

  const handleResetPin = async (code: string) => {
    try {
      const res = await api("ADM-02.reset_pin", {
        params: { observer_code: code },
        body: {},
      });
      if (res.ok) {
        setActiveCards([res.data.card]);
      }
    } catch {
      // Ignored
    }
  };

  return (
    <AdminCodesView
      batches={batches}
      codes={codes}
      activeCards={activeCards}
      loading={loading}
      error={error}
      onCreateBatch={handleCreateBatch}
      onPrintData={handlePrintData}
      onCloseCards={() => setActiveCards(null)}
      onRevokeCode={handleRevoke}
      onReissueCode={handleReissue}
      onResetPin={handleResetPin}
    />
  );
}
