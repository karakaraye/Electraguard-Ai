"use client";

import { useRouter } from "next/navigation";
import { useEffect, useState } from "react";
import { api, uuidv4 } from "../../../../lib/api/client";
import type { DiscussionSummary, Page } from "../../../../lib/api/types";
import { openPinSheet } from "../_components/ObserverRuntime";
import { useFocusTitle, useNetwork } from "../_lib/network";
import { useLoad } from "../_lib/useLoad";
import { useSignedIn } from "../_lib/useSignedIn";
import { DiscussionListView, type DiscussionListLoad } from "../_views/DiscussionViews";

/** O-18 Discussions list: DIS-01 (open), invitations answered with DIS-04 (live, never queued). */
export default function DiscussionsPage() {
  const router = useRouter();
  const { session } = useSignedIn();
  const { offline } = useNetwork();
  const [busy, setBusy] = useState<{ id: string; action: "accept" | "decline" } | null>(null);
  const [notice, setNotice] = useState<string | null>(null);
  const [hidden, setHidden] = useState<string[]>([]);
  useFocusTitle("o18");

  const list = useLoad<Page<DiscussionSummary>>(() => api("DIS-01", { query: { status: "open", limit: 100 } }), session?.code ?? "", {
    enabled: Boolean(session),
    offline,
    pollMs: 60_000,
    collection: true,
  });

  useEffect(() => {
    if (list.status === "auth") openPinSheet();
  }, [list.status]);

  if (!session) return null;
  const load: DiscussionListLoad = list.status === "ok" ? "ok" : list.status === "loading" ? "loading" : list.status === "unavailable" ? "unavailable" : list.status === "offline" ? "offline" : "error";

  return (
    <DiscussionListView
      offline={offline}
      load={offline && !list.data ? "offline" : load}
      items={(list.data?.items ?? []).filter((item) => !hidden.includes(item.id))}
      busy={busy}
      notice={notice}
      onAnswer={async (id, action) => {
        setBusy({ id, action });
        setNotice(null);
        const result = await api("DIS-04", { params: { id }, body: { action }, idempotency_key: uuidv4() });
        setBusy(null);
        if (result.ok) {
          if (action === "accept") router.push(`/o/discussions/${id}`);
          else setHidden((current) => [...current, id]);
          list.reload();
          return;
        }
        if (result.error.code === "discussion_closed") setNotice("o18.closed");
        else if (result.error.code === "invalid_transition" || result.status === 404) setNotice("o18.thread.removed");
        else setNotice(result.status === 0 ? "o18.needNetwork" : "common.error.server");
        if (result.status === 404 || result.error.code === "invalid_transition" || result.error.code === "discussion_closed") setHidden((current) => [...current, id]);
      }}
      onRetry={list.reload}
      onBack={() => router.push("/o")}
    />
  );
}
