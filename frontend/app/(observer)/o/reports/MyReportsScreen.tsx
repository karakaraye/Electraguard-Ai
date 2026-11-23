"use client";

import { useRouter } from "next/navigation";
import { useEffect, useMemo, useState } from "react";
import { api } from "../../../../lib/api/client";
import type { ReportListItem, ReportListResponse } from "../../../../lib/api/types";
import { useT } from "../../../../lib/i18n/client";
import { useOutbox } from "../../../../lib/outbox";
import { openPinSheet } from "../_components/ObserverRuntime";
import { useFocusTitle, useNetwork } from "../_lib/network";
import { usePending } from "../_lib/pending";
import { needsYou, onPhone, outboxRow, pendingRow, receivedRow, serverRow } from "../_lib/rows";
import { useLoad } from "../_lib/useLoad";
import { useSignedIn } from "../_lib/useSignedIn";
import { MyReportsView, type ListLoad, type ListRow, type ReportsFilter } from "../_views/ListViews";

/** O-13 My reports: REP-02 merged with what is still on this phone. */
export function MyReportsScreen() {
  const t = useT();
  const router = useRouter();
  const { session } = useSignedIn();
  const outbox = useOutbox();
  const pending = usePending();
  const { offline } = useNetwork();
  const [filter, setFilter] = useState<ReportsFilter>("all");
  // Extra pages belong to one first-page answer; a fresh first page starts again.
  const [extra, setExtra] = useState<{ base: number | null; items: ReportListItem[]; cursor: string | null }>({ base: null, items: [], cursor: null });
  const [loadingMore, setLoadingMore] = useState(false);

  useFocusTitle("o13");

  const list = useLoad<ReportListResponse>(() => api("REP-02", { query: { limit: 50 } }), session?.code ?? "", {
    enabled: Boolean(session),
    offline,
    pollMs: 60_000,
  });

  useEffect(() => {
    if (list.status === "auth") openPinSheet();
  }, [list.status]);

  const fresh = extra.base !== null && extra.base === list.updatedAt;
  const more = fresh ? extra.items : [];
  const cursor = fresh ? extra.cursor : (list.data?.next_cursor ?? null);

  const code = session?.code;
  const rows = useMemo(() => {
    const local: ListRow[] = [
      ...outbox.items.filter((item) => item.owner === code && item.state !== "received").map(outboxRow),
      ...pending.filter((item) => item.owner === code).flatMap((item) => pendingRow(item) ?? []),
    ];
    const server = list.data ? [...list.data.items, ...more].map((item) => serverRow(item, t)) : null;
    // Offline or before the first answer: the minimal received index (G9) stands in for server rows.
    const known = server ?? outbox.received.filter((entry) => entry.owner === code).sort((a, b) => Date.parse(b.received_at) - Date.parse(a.received_at)).map(receivedRow);
    const ids = new Set(known.map((row) => row.key));
    const all = [...local.filter((row) => !ids.has(row.key)), ...known];
    const rank = (row: ListRow) => (needsYou(row) ? 0 : onPhone(row) ? 1 : 2);
    return all.map((row, index) => ({ row, index })).sort((a, b) => rank(a.row) - rank(b.row) || a.index - b.index).map(({ row }) => row);
  }, [outbox.items, outbox.received, pending, list.data, more, code, t]);

  const counts: Record<ReportsFilter, number> = {
    all: Math.max(rows.length, (list.data?.counts.total ?? 0) + rows.filter((row) => onPhone(row) && !row.reference).length),
    needsYou: rows.filter(needsYou).length,
    onPhone: rows.filter(onPhone).length,
  };
  const shown = filter === "needsYou" ? rows.filter(needsYou) : filter === "onPhone" ? rows.filter(onPhone) : rows;
  const load: ListLoad = offline ? "offline" : list.status === "ok" ? "ok" : list.status === "loading" ? "loading" : list.status === "unavailable" ? "unavailable" : list.status === "offline" ? "offline" : "error";

  if (!session) return null;

  return (
    <MyReportsView
      offline={offline}
      queuedCount={rows.filter(onPhone).length}
      filter={filter}
      onFilter={setFilter}
      counts={counts}
      rows={shown}
      load={load === "ok" && rows.length === 0 && counts.all > 0 ? "ok" : load}
      stale={Boolean(list.stale) && !offline}
      updatedAt={list.updatedAt}
      hasMore={Boolean(cursor) && !offline}
      loadingMore={loadingMore}
      onMore={async () => {
        if (!cursor) return;
        setLoadingMore(true);
        const page = await api("REP-02", { query: { limit: 50, cursor } });
        setLoadingMore(false);
        if (page.ok) setExtra({ base: list.updatedAt, items: [...more, ...page.data.items], cursor: page.data.next_cursor });
      }}
      onRetry={list.reload}
      onReport={() => router.push("/o/new/what")}
      onBack={() => router.push("/o")}
    />
  );
}
