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
import { useNow, type ReportStatus } from "../../../ui";
import { openPinSheet } from "./_components/ObserverRuntime";
import { useFocusTitle, useNetwork } from "./_lib/network";
import { updateFromMe, useObserverSession } from "./_lib/session";
import { HomeView, type HomeRow } from "./_views/HomeView";
import { setNavCounts } from "./_lib/navCounts";
import { STAGES, useChecklistDay, watDay } from "./_lib/checklist";
import { OUTBOX_BADGE } from "./_lib/status";
import { openNotices, useAreaToday, useNotices } from "./_lib/notices";
import { noticeTitle } from "../../../lib/notices";
import { useLocale } from "../../../lib/i18n/client";

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
  const { locale } = useLocale();
  const [draft, setDraft] = useState<IncidentDraft | null>(null);
  const [questions, setQuestions] = useState(0);
  const [unread, setUnread] = useState(0);
  const [discussions, setDiscussions] = useState<{ count: number } | null>(null);
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
      const [list, talks] = await Promise.all([api("REP-02", { query: { limit: 1 } }), api("DIS-01", { query: { status: "open", limit: 100 } })]);
      if (cancelled) return;
      if (list.ok) {
        setQuestions(list.data.counts.open_questions);
        setUnread(list.data.counts.unread_messages);
        setNavCounts({ questions: list.data.counts.open_questions, unread: list.data.counts.unread_messages });
      }
      // The Discussions row exists only with an invitation or a membership (O-18).
      if (talks.ok) {
        const mine = talks.data.items.filter((item) => item.membership === "invited" || item.membership === "member");
        setDiscussions(mine.length ? { count: mine.filter((item) => item.membership === "invited").length + mine.reduce((sum, item) => sum + item.unread_posts, 0) } : null);
      }
    })();
    return () => {
      cancelled = true;
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [session?.code, offline]);

  const clock = useNow();
  const { notices } = useNotices(session?.code ?? null, offline);
  const area = useAreaToday(session?.code ?? null, offline);
  const waitingNotices = useMemo(
    () => openNotices(notices, clock ?? 0).map((notice) => ({ id: notice.id, title: noticeTitle(notice, locale), type: notice.type })),
    [notices, locale, clock],
  );
  const lgaToday = area.data
    ? { lgaName: area.data.lga_name, updatedAt: area.data.updated_at, rows: area.data.by_category }
    : null;

  const today = useChecklistDay(session?.code ?? null, watDay());
  const checklist = useMemo(() => {
    // The first stage not yet received is "next"; the rest are "later".
    const nextIndex = STAGES.findIndex((stage) => today.stages[stage.slug]?.state !== "received");
    const stages = STAGES.map((stage, index) => ({
      slug: stage.slug,
      state: today.stages[stage.slug]?.state === "received" ? ("sent" as const) : index === nextIndex ? ("next" as const) : ("later" as const),
    }));
    return { unitLabel: today.unit?.label ?? null, stages };
  }, [today]);

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
      unreadCount={unread}
      discussions={discussions}
      notices={waitingNotices}
      lgaToday={lgaToday}
      pinSaved={flags.pin}
      draftKept={keptVisible && Boolean(draft)}
      draft={draft ? { category: draft.category_observer, startedAt: draft.created_at } : null}
      rows={rows}
      checklist={checklist}
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
      outbox={[...unsent, ...attention]
        .sort((a, b) => a.created_at - b.created_at)
        .map((item) => ({
          id: item.id,
          category: item.summary.category_observer,
          createdAt: item.created_at,
          status: OUTBOX_BADGE[item.state],
          // Only reports the server has never seen can be deleted; one being sent or unconfirmed may already be there.
          deletable: item.state === "queued" || item.state === "needs_attention",
        }))}
      onDeleteQueued={(id) => void removeItems([id])}
    />
  );
}
