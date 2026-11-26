"use client";

import { useRouter } from "next/navigation";
import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { api } from "../../../../lib/api/client";
import type { QueueItem, QueueQuery, QueueResponse, ReportStatus } from "../../../../lib/api/types";
import { useT } from "../../../../lib/i18n/client";
import { useStaffHeaderState } from "../_lib/header";
import {
  EMPTY_QUEUE_FILTERS,
  QueueTableView,
  type QueueTableFilters,
  type SavedQueueView,
} from "../_views/QueueTableView";

/** How often the queue checks for new cases. New ones wait behind a pill; rows never jump (I-18). */
const POLL_MS = 30_000;
const VIEWS_KEY = "eg.s02.savedViews";

function toQuery(filters: QueueTableFilters, cursor?: string): QueueQuery {
  return {
    status: filters.status === "all" ? undefined : [filters.status as ReportStatus],
    urgency: filters.urgency.length ? filters.urgency : undefined,
    category: filters.category ? [filters.category] : undefined,
    channel: filters.channel.length ? filters.channel : undefined,
    has_evidence: filters.hasEvidence || undefined,
    cursor,
  };
}

function readViews(): SavedQueueView[] {
  try {
    const raw = window.localStorage.getItem(VIEWS_KEY);
    const parsed = raw ? (JSON.parse(raw) as SavedQueueView[]) : [];
    return Array.isArray(parsed) ? parsed.filter((v) => v && typeof v.name === "string" && v.filters) : [];
  } catch {
    return [];
  }
}

function writeViews(views: SavedQueueView[]) {
  try {
    window.localStorage.setItem(VIEWS_KEY, JSON.stringify(views));
  } catch {
    // Saved views are a convenience on this browser only; the queue works without them.
  }
}

export default function QueuePage() {
  const router = useRouter();
  const t = useT();

  const { search } = useStaffHeaderState();
  const [filters, setFilters] = useState<QueueTableFilters>(EMPTY_QUEUE_FILTERS);
  const [data, setData] = useState<QueueResponse | null>(null);
  const [loading, setLoading] = useState(true);
  const [loadingMore, setLoadingMore] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [pending, setPending] = useState<QueueItem[]>([]);
  const [views, setViews] = useState<SavedQueueView[]>([]);
  const [attempt, setAttempt] = useState(0);
  const known = useRef(new Set<string>());

  const problem = useCallback(
    (res: { status: number }) =>
      res.status === 403 ? t("staff.forbidden") : res.status === 404 ? t("staff.endpointNotReady") : t("staff.networkError"),
    [t],
  );

  useEffect(() => {
    const id = window.setTimeout(() => setViews(readViews()), 0);
    return () => window.clearTimeout(id);
  }, []);

  // First page for the current filters.
  useEffect(() => {
    let cancelled = false;
    void (async () => {
      setLoading(true);
      setError(null);
      setPending([]);
      const res = await api("Q-01", { query: toQuery(filters) });
      if (cancelled) return;
      setLoading(false);
      if (!res.ok) {
        setError(problem(res));
        return;
      }
      known.current = new Set(res.data.items.map((item) => item.id));
      setData(res.data);
    })();
    return () => {
      cancelled = true;
    };
  }, [filters, attempt, problem]);

  // Look for new cases without moving the rows the reviewer is reading.
  useEffect(() => {
    if (!data) return;
    const id = window.setInterval(async () => {
      if (document.visibilityState !== "visible") return;
      const res = await api("Q-01", { query: toQuery(filters) });
      if (!res.ok) return;
      const fresh = res.data.items.filter((item) => !known.current.has(item.id));
      if (fresh.length) {
        setPending((current) => {
          const ids = new Set(current.map((item) => item.id));
          return [...current, ...fresh.filter((item) => !ids.has(item.id))];
        });
      }
    }, POLL_MS);
    return () => window.clearInterval(id);
  }, [data, filters]);

  async function loadMore() {
    if (!data?.next_cursor || loadingMore) return;
    setLoadingMore(true);
    const res = await api("Q-01", { query: toQuery(filters, data.next_cursor) });
    setLoadingMore(false);
    if (!res.ok) {
      setError(problem(res));
      return;
    }
    const more = res.data.items.filter((item) => !known.current.has(item.id));
    more.forEach((item) => known.current.add(item.id));
    setData({ ...data, items: [...data.items, ...more], next_cursor: res.data.next_cursor, counts: res.data.counts });
  }

  function showNew() {
    if (!data || pending.length === 0) return;
    pending.forEach((item) => known.current.add(item.id));
    setData({ ...data, items: [...pending, ...data.items] });
    setPending([]);
  }

  function saveView(name: string) {
    const next = [...views.filter((v) => v.name !== name), { name, filters }];
    setViews(next);
    writeViews(next);
  }

  function removeView(name: string) {
    const next = views.filter((v) => v.name !== name);
    setViews(next);
    writeViews(next);
  }

  // The header search narrows the loaded rows by case reference.
  const shown = useMemo(() => {
    const needle = search.trim().toLowerCase();
    if (!data || !needle) return data;
    return { ...data, items: data.items.filter((item) => item.receipt_code.toLowerCase().includes(needle)) };
  }, [data, search]);

  return (
    <QueueTableView
      data={shown}
      loading={loading}
      loadingMore={loadingMore}
      error={error}
      filters={filters}
      onFiltersChange={setFilters}
      onLoadMore={() => void loadMore()}
      onRetry={() => setAttempt((n) => n + 1)}
      newCount={pending.length}
      onShowNew={showNew}
      savedViews={views}
      onSaveView={saveView}
      onRemoveView={removeView}
      onOpenCase={(id) => router.push(`/s/cases/${id}`)}
    />
  );
}
