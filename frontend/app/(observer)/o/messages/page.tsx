"use client";

import { useRouter } from "next/navigation";
import { useEffect, useMemo } from "react";
import { api } from "../../../../lib/api/client";
import type { ReportListResponse } from "../../../../lib/api/types";
import { useT } from "../../../../lib/i18n/client";
import { openPinSheet } from "../_components/ObserverRuntime";
import { useFocusTitle, useNetwork } from "../_lib/network";
import { serverRow } from "../_lib/rows";
import { useLoad } from "../_lib/useLoad";
import { useSignedIn } from "../_lib/useSignedIn";
import { MessagesView, type ListLoad } from "../_views/ListViews";

/** O-17 Messages: REP-02 `has_messages=true`, kept on the phone only for open questions and unread messages (G14). */
export default function MessagesPage() {
  const t = useT();
  const router = useRouter();
  const { session } = useSignedIn();
  const { offline } = useNetwork();
  useFocusTitle("o17");

  const list = useLoad<ReportListResponse>(() => api("REP-02", { query: { has_messages: true, limit: 100 } }), session?.code ?? "", {
    enabled: Boolean(session),
    offline,
    pollMs: 60_000,
  });

  useEffect(() => {
    if (list.status === "auth") openPinSheet();
  }, [list.status]);

  const rows = useMemo(() => {
    const items = (list.data?.items ?? []).filter((item) => item.has_open_question || item.unread_messages > 0);
    // Open questions first, oldest first so nothing waits too long; then unread, newest first.
    const questions = items.filter((item) => item.has_open_question).sort((a, b) => Date.parse(a.last_activity_at) - Date.parse(b.last_activity_at));
    const unread = items.filter((item) => !item.has_open_question).sort((a, b) => Date.parse(b.last_activity_at) - Date.parse(a.last_activity_at));
    return [...questions, ...unread].map((item) => {
      const row = serverRow(item, t);
      // G8: the latest reviewer words and the time they were written; without them, the unread count stays.
      const preview = item.last_message_preview;
      return {
        ...row,
        href: `${row.href}#o14-conversation`,
        place: item.area?.ward_name ?? row.place,
        preview: preview?.snippet,
        previewAt: preview?.created_at ?? null,
        unread: item.unread_messages,
      };
    });
  }, [list.data, t]);

  if (!session) return null;
  const load: ListLoad = offline ? "offline" : list.status === "ok" ? "ok" : list.status === "loading" ? "loading" : list.status === "unavailable" ? "unavailable" : list.status === "offline" ? "offline" : "error";

  return <MessagesView offline={offline} rows={offline ? [] : rows} load={load} stale={Boolean(list.stale) && !offline} onRetry={list.reload} onBack={() => router.push("/o")} />;
}
