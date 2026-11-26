"use client";

import { useCallback, useEffect, useState } from "react";
import { api } from "../../../../../lib/api/client";
import type { CodeBatch, ObserverCodeRow, RevokeReason } from "../../../../../lib/api/types";
import { useT } from "../../../../../lib/i18n/client";
import { AdminCodesView, type CardSet, type CodesActionResult } from "../../_views/AdminCodesView";

/** Pages of 100, up to this many, so the search covers every code the organisation has. */
const MAX_PAGES = 20;

const listBatches = (cursor: string | undefined) => api("ADM-01.list", { query: { limit: 100, cursor } });
const listCodes = (cursor: string | undefined) => api("ADM-01.codes", { query: { limit: 100, cursor } });

export default function AdminCodesPage() {
  const t = useT();
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [batches, setBatches] = useState<CodeBatch[]>([]);
  const [codes, setCodes] = useState<ObserverCodeRow[]>([]);
  /**
   * The cards with their setup PINs. They live in this state only: the server shows a PIN once,
   * so nothing here is written to storage, the URL or a cache, and Done drops them.
   */
  const [cardSet, setCardSet] = useState<CardSet | null>(null);
  const [reloadKey, setReloadKey] = useState(0);

  const problem = useCallback(
    (status: number) => (status === 403 ? t("staff.forbidden") : status === 404 ? t("staff.endpointNotReady") : t("staff.networkError")),
    [t],
  );
  const reload = () => setReloadKey((k) => k + 1);

  useEffect(() => {
    let cancelled = false;
    void (async () => {
      const batchRows: CodeBatch[] = [];
      const codeRows: ObserverCodeRow[] = [];
      let failed: number | null = null;

      let cursor: string | undefined;
      for (let i = 0; i < MAX_PAGES && failed === null; i += 1) {
        const res: Awaited<ReturnType<typeof listBatches>> = await listBatches(cursor);
        if (!res.ok) {
          failed = res.status;
          break;
        }
        batchRows.push(...res.data.items);
        cursor = res.data.next_cursor ?? undefined;
        if (!cursor) break;
      }
      cursor = undefined;
      for (let i = 0; i < MAX_PAGES && failed === null; i += 1) {
        const res: Awaited<ReturnType<typeof listCodes>> = await listCodes(cursor);
        if (!res.ok) {
          failed = res.status;
          break;
        }
        codeRows.push(...res.data.items);
        cursor = res.data.next_cursor ?? undefined;
        if (!cursor) break;
      }

      if (cancelled) return;
      setLoading(false);
      if (failed === null) {
        setError(null);
        setBatches(batchRows);
        setCodes(codeRows);
      } else {
        setError(problem(failed));
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [problem, reloadKey]);

  /** Server answers every change can get, in plain words. */
  function failure(status: number, code: string, fields?: Record<string, unknown>): CodesActionResult {
    if (code === "confirmation_required") return { ok: false, message: t("s09.errors.confirmation") };
    if (code === "rate_limited") return { ok: false, message: t("s09.errors.rateLimited") };
    if (code === "request_in_progress") return { ok: false, message: t("s09.errors.inProgress") };
    if (code === "invalid_transition") {
      reload();
      return { ok: false, message: t("s09.errors.alreadyRevoked") };
    }
    if (status === 404 && code === "not_found") {
      reload();
      return { ok: false, message: t("s09.errors.notFound") };
    }
    if (status === 422) {
      const label = fields && "label" in fields;
      const count = fields && "count" in fields;
      return {
        ok: false,
        message: label || count ? undefined : t("s09.errors.invalid"),
        fields: { label: label ? t("s09.create.errors.label") : undefined, count: count ? t("s09.create.errors.count") : undefined },
      };
    }
    return { ok: false, message: problem(status) };
  }

  async function createBatch(label: string, count: number): Promise<CodesActionResult> {
    const res = await api("ADM-01.create", { body: { label, count } });
    if (!res.ok) return failure(res.status, res.error.code, "fields" in res.error ? (res.error.fields as Record<string, unknown> | undefined) : undefined);
    setCardSet({ cards: res.data.cards, kind: "batch", label: res.data.batch.label });
    reload();
    return { ok: true };
  }

  async function printBatch(batchId: string): Promise<CodesActionResult> {
    // The admin has just confirmed in the sheet that unclaimed setup PINs may be reset.
    const res = await api("ADM-01.print_data", { params: { id: batchId }, body: { confirm_reset_setup_pins: true } });
    if (!res.ok) return failure(res.status, res.error.code);
    setCardSet({ cards: res.data.cards, kind: "batch", label: res.data.batch.label });
    reload();
    return { ok: true };
  }

  async function revoke(code: string, reason: RevokeReason): Promise<CodesActionResult> {
    const res = await api("ADM-02.revoke", { params: { observer_code: code }, body: { reason } });
    if (!res.ok) return failure(res.status, res.error.code);
    reload();
    return { ok: true };
  }

  async function reissue(code: string, reason: RevokeReason): Promise<CodesActionResult> {
    const res = await api("ADM-02.reissue", { params: { observer_code: code }, body: { reason } });
    if (!res.ok) return failure(res.status, res.error.code);
    setCardSet({ cards: [res.data.card], kind: "single" });
    reload();
    return { ok: true };
  }

  async function resetPin(code: string): Promise<CodesActionResult> {
    const res = await api("ADM-02.reset_pin", { params: { observer_code: code }, body: {} });
    if (!res.ok) return failure(res.status, res.error.code);
    setCardSet({ cards: [res.data.card], kind: "single" });
    reload();
    return { ok: true };
  }

  return (
    <AdminCodesView
      batches={batches}
      codes={codes}
      cardSet={cardSet}
      loading={loading}
      error={error}
      onCreateBatch={createBatch}
      onPrintBatch={printBatch}
      onRevoke={revoke}
      onReissue={reissue}
      onResetPin={resetPin}
      onCloseCards={() => setCardSet(null)}
      onRetry={() => {
        setLoading(true);
        reload();
      }}
    />
  );
}
