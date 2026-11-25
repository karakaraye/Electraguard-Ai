"use client";

import { useCallback, useEffect, useState } from "react";
import { api } from "../../../../lib/api/client";
import type { AssignItemResult, AssignmentListResponse } from "../../../../lib/api/types";
import { useT } from "../../../../lib/i18n/client";
import { AssignView, type AssignScope, type AssignTarget } from "../_views/AssignView";

export default function AssignPage() {
  const t = useT();
  const [scope, setScope] = useState<AssignScope>("none");
  const [data, setData] = useState<AssignmentListResponse | null>(null);
  const [loading, setLoading] = useState(true);
  const [loadingMore, setLoadingMore] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [assigning, setAssigning] = useState(false);
  const [results, setResults] = useState<Record<string, AssignItemResult>>({});
  const [attempt, setAttempt] = useState(0);

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
      const res = await api("ASG-01", { query: { assigned: scope } });
      if (cancelled) return;
      setLoading(false);
      if (!res.ok) {
        setError(problem(res));
        return;
      }
      setResults({});
      setData(res.data);
    })();
    return () => {
      cancelled = true;
    };
  }, [scope, attempt, problem]);

  async function loadMore() {
    if (!data?.next_cursor) return;
    setLoadingMore(true);
    const res = await api("ASG-01", { query: { assigned: scope, cursor: data.next_cursor } });
    setLoadingMore(false);
    if (!res.ok) {
      setError(problem(res));
      return;
    }
    const ids = new Set(data.items.map((item) => item.id));
    setData({ ...res.data, items: [...data.items, ...res.data.items.filter((item) => !ids.has(item.id))] });
  }

  /** Rows keep their own result; nothing disappears until the list is refreshed. */
  async function assign(items: Array<{ report_id: string; reviewer_id: AssignTarget; version: number }>) {
    setAssigning(true);
    setError(null);
    const res = await api("ASG-02", { body: { items } });
    setAssigning(false);
    if (!res.ok) {
      setError(problem(res));
      return;
    }
    setResults((current) => {
      const next = { ...current };
      for (const result of res.data.results) next[result.report_id] = result;
      return next;
    });
    setData((current) =>
      current
        ? {
            ...current,
            items: current.items.map((item) => {
              const result = res.data.results.find((r) => r.report_id === item.id);
              return result?.ok ? { ...item, version: result.version, assigned_reviewer: result.assigned_reviewer } : item;
            }),
          }
        : current,
    );
  }

  return (
    <AssignView
      data={data}
      loading={loading}
      error={error}
      assigning={assigning}
      scope={scope}
      onScopeChange={setScope}
      results={results}
      onAssign={(items) => void assign(items)}
      onRefresh={() => setAttempt((n) => n + 1)}
      onLoadMore={() => void loadMore()}
      loadingMore={loadingMore}
    />
  );
}
