"use client";

import { useRouter } from "next/navigation";
import { useEffect, useMemo, useState } from "react";
import { api } from "../../../lib/api/client";
import { loadDraft, saveDraft, type IncidentDraft } from "../../../lib/drafts";
import { itemToDraft } from "./_lib/rebuild";
import {
  adoptWaitingItems,
  removeItems,
  returnToDraft,
  sendNow,
  useOutbox,
  type OutboxItem,
} from "../../../lib/outbox";
import type { ReportStatus } from "../../../ui";
import { openPinSheet } from "./_components/ObserverRuntime";
import { useFocusTitle, useNetwork } from "./_lib/network";
import { updateFromMe, useObserverSession } from "./_lib/session";
import { HomeView, type HomeRow } from "./_views/HomeView";

function takeFlag(key: string): boolean {
  try {
    const value = window.sessionStorage.getItem(key);
    window.sessionStorage.removeItem(key);
    return value === "1";
  } catch {
    return false;
  }
}

const ITEM_STATUS: Record<OutboxItem["state"], ReportStatus> = {
  queued: "on-phone",
  sending: "sending",
  unconfirmed: "not-confirmed",
  needs_attention: "needs-attention",
  waiting_code: "waiting-code",
  received: "received",
};

const SERVER_STATUS: Record<string, ReportStatus> = {
  received: "received",
  in_review: "in-review",
  question: "question",
  closed: "closed",
  withdrawn: "withdrawn",
};

export function HomeScreen() {
  const router = useRouter();
  const { session, ready, expired } = useObserverSession();
  const outbox = useOutbox();
  const { offline, back } = useNetwork();
  const [draft, setDraft] = useState<IncidentDraft | null>(null);
  const [questions, setQuestions] = useState(0);
  const [flags] = useState(() => (typeof window === "undefined" ? { pin: false, kept: false } : { pin: takeFlag("eg.pinSaved"), kept: takeFlag("eg.draftKept") }));
  const [keptVisible, setKeptVisible] = useState(flags.kept);

  useFocusTitle("home");

  useEffect(() => {
    if (ready && !session) router.replace("/o/start");
  }, [ready, session, router]);

  useEffect(() => {
    if (!keptVisible) return;
    const timer = window.setTimeout(() => setKeptVisible(false), 6_000);
    return () => window.clearTimeout(timer);
  }, [keptVisible]);

  useEffect(() => {
    if (!session) return;
    void loadDraft(session.code).then(setDraft);
  }, [session, outbox.draftIds]);

  // AUTH-07 (session, intake pause, clock) and REP-02 counts, online only.
  useEffect(() => {
    if (!session || offline) return;
    let cancelled = false;
    void (async () => {
      const me = await api("AUTH-07", {});
      if (cancelled || !me.ok) return;
      updateFromMe(me.data);
      if (!me.data.authenticated) {
        router.replace("/o/start?view=sign-in");
        return;
      }
      const list = await api("REP-02", { query: { limit: 1 } });
      if (!cancelled && list.ok) setQuestions(list.data.counts.open_questions);
    })();
    return () => {
      cancelled = true;
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [session?.code, offline]);

  const mine = useMemo(() => outbox.items.filter((item) => item.owner === session?.code), [outbox.items, session?.code]);
  const waiting = useMemo(() => outbox.items.filter((item) => item.state === "waiting_code"), [outbox.items]);
  const unsent = mine.filter((item) => item.state === "queued" || item.state === "unconfirmed" || item.state === "sending");
  const attention = mine.filter((item) => item.state === "needs_attention");
  const pendingUploads = mine.filter((item) => item.state === "received" && item.media.some((m) => m.state === "waiting" || m.state === "uploading"));

  const rows: HomeRow[] = useMemo(() => {
    const local: HomeRow[] = mine
      .filter((item) => item.state !== "received")
      .map((item) => ({
        href: `/o/reports/${item.id}`,
        category: item.summary.category_observer,
        place: item.summary.ward_name ?? item.summary.place_label ?? "",
        at: item.summary.occurred_at ?? item.created_at,
        status: ITEM_STATUS[item.state],
      }));
    const received: HomeRow[] = outbox.received
      .filter((entry) => entry.owner === session?.code)
      .sort((a, b) => Date.parse(b.received_at) - Date.parse(a.received_at))
      .slice(0, 10)
      .map((entry) => ({
        href: `/o/reports/${entry.id}`,
        category: entry.category_observer,
        place: entry.ward_name ?? "",
        at: entry.occurred_at ?? entry.received_at,
        reference: entry.receipt_code,
        status: SERVER_STATUS[entry.status] ?? "received",
      }));
    return [...local, ...received];
  }, [mine, outbox.received, session?.code]);

  if (!session) return null;

  const intakePaused = session.intake_paused || mine.some((item) => item.wait_reason === "intake_paused");

  return (
    <HomeView
      code={session.code}
      offline={offline}
      networkBack={back}
      queuedCount={unsent.length}
      waitingCodeCount={waiting.length}
      intakePaused={intakePaused}
      unsentCount={unsent.length + pendingUploads.length}
      needsAttentionCount={attention.length}
      questionCount={questions}
      pinSaved={flags.pin}
      draftKept={keptVisible && Boolean(draft)}
      draft={draft ? { category: draft.category_observer, startedAt: draft.created_at } : null}
      rows={rows}
      onReport={() => router.push(draft ? `/o/new/${draft.last_step}` : "/o/new/what")}
      onContinue={() => draft && router.push(`/o/new/${draft.last_step}`)}
      onSendNow={() => {
        if (expired || outbox.paused === "auth") openPinSheet();
        else void sendNow();
      }}
      onFix={async () => {
        const item = attention[0];
        if (!item) return;
        if (draft) {
          router.push(`/o/new/${draft.last_step}`);
          return;
        }
        const rebuilt = itemToDraft(item);
        if (!rebuilt) return;
        await returnToDraft(item, rebuilt);
        await saveDraft({ ...rebuilt, last_step: "check" });
        router.push("/o/new/check");
      }}
      onSendWaiting={() => void adoptWaitingItems(session.code).then(() => sendNow())}
      onDeleteWaiting={() => void removeItems(waiting.map((item) => item.id))}
    />
  );
}
