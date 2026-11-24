"use client";

import { useParams, useRouter } from "next/navigation";
import { useCallback, useEffect, useRef, useState } from "react";
import { api, uuidv4 } from "../../../../../lib/api/client";
import type { Discussion, Post } from "../../../../../lib/api/types";
import { useT } from "../../../../../lib/i18n/client";
import { useNow } from "../../../../../ui";
import { openPinSheet } from "../../_components/ObserverRuntime";
import { looksLikeName, textHash } from "../../_lib/name-check";
import { useFocusTitle, useNetwork } from "../../_lib/network";
import { dropPending, enqueue, onPendingDone, onPendingRefused, usePending, type PendingItem } from "../../_lib/pending";
import { useSignedIn } from "../../_lib/useSignedIn";
import { ThreadView, type ThreadPost } from "../../_views/DiscussionViews";

/** A run of 7+ digits (spaces and dashes allowed): likely a phone number (O-09 rule). */
const PHONE = /(?:\d[\s-]?){7,}/;

/** O-18 Thread: DIS-02 paged forward with `after`, posts through the queue (DIS-03.post), flag and leave live. */
export default function ThreadPage() {
  const t = useT();
  const router = useRouter();
  const params = useParams<{ id: string }>();
  const { session } = useSignedIn();
  const { offline } = useNetwork();
  const pending = usePending();
  const [discussion, setDiscussion] = useState<Discussion | null>(null);
  const [posts, setPosts] = useState<Post[]>([]);
  const [after, setAfter] = useState<string | null>(null);
  const [load, setLoad] = useState<"loading" | "ok" | "offline" | "error" | "removed">("loading");
  const [draft, setDraft] = useState("");
  const [draftError, setDraftError] = useState<string | null>(null);
  const [warning, setWarning] = useState(false);
  const [kept, setKept] = useState<string | null>(null);
  const [postKey, setPostKey] = useState<string | null>(null);
  const [flagPost, setFlagPost] = useState<Post | null>(null);
  const [flagged, setFlagged] = useState(false);
  const [leave, setLeave] = useState<null | "confirm" | "sending">(null);
  const lastPost = useRef<string | null>(null);
  useFocusTitle(`o18:${params.id}:${load}`);

  const fetchPosts = useCallback(
    async (fromStart: boolean) => {
      const result = await api("DIS-02", { params: { id: params.id }, query: { after: fromStart ? undefined : (lastPost.current ?? undefined), limit: 50 } });
      if (!result.ok) {
        if (result.status === 404 || result.error.code === "not_a_member") setLoad("removed");
        else if (result.error.code === "not_authenticated") openPinSheet();
        else setLoad((current) => (current === "ok" ? "ok" : result.status === 0 ? "offline" : "error"));
        return;
      }
      setDiscussion(result.data.discussion);
      // Reading the thread marks the shown posts read (G13).
      setPosts((current) => {
        const merged = fromStart ? result.data.posts : [...current, ...result.data.posts.filter((post) => !current.some((c) => c.id === post.id))];
        lastPost.current = merged[merged.length - 1]?.id ?? null;
        return merged;
      });
      setAfter(result.data.next_after);
      setLoad("ok");
    },
    [params.id],
  );

  useEffect(() => {
    if (!session || offline) return;
    void fetchPosts(true);
    const timer = window.setInterval(() => void fetchPosts(false), 30_000);
    return () => window.clearInterval(timer);
  }, [session, offline, fetchPosts]);

  useEffect(
    () =>
      onPendingDone((done) => {
        if (done.kind !== "post") return;
        if (done.key === postKey) setPostKey(null);
        setPosts((current) => (current.some((p) => p.id === done.data.post.id) ? current : [...current, done.data.post]));
        lastPost.current = done.data.post.id;
      }),
    [postKey],
  );


  // Refusals of a queued post (DIS-03 errors): the text comes back into the box.
  useEffect(
    () =>
      onPendingRefused((item) => {
        if (item.kind !== "post" || item.discussion_id !== params.id) return;
        const field = item.fields?.body?.code;
        setDraft(item.body.body);
        setDraftError(
          t(
            field === "contains_polling_unit_code"
              ? "o18.thread.noUnitCode"
              : field === "max_length"
                ? "o18.thread.tooLong"
                : item.error_code === "rate_limited"
                  ? "common.error.tooManyTries"
                  : item.error_code === "discussion_closed"
                    ? "o18.closed"
                    : "common.error.server",
            { max: 1000, minutes: 60 },
          ),
        );
        if (item.error_code === "not_a_member") setLoad("removed");
        if (item.error_code === "discussion_closed") void fetchPosts(true);
        setPostKey(null);
        void dropPending(item.key);
      }),
    [params.id, t, fetchPosts],
  );

  const now = useNow();
  if (!session) return null;
  const mine = pending.filter((item): item is Extract<PendingItem, { kind: "post" }> => item.kind === "post" && item.discussion_id === params.id);
  const closed = discussion ? discussion.status === "closed" || (now !== null && Date.parse(discussion.closes_at) < now) : false;
  const queued: ThreadPost[] = mine
    .filter((item) => item.state !== "needs_attention")
    .map((item) => ({ id: item.key, author_label: session.code, is_me: true, body: item.body.body, state: "visible", created_at: new Date(item.created_at).toISOString(), queued: true }));

  return (
    <ThreadView
      offline={offline}
      load={offline && load === "loading" ? "offline" : load}
      title={discussion?.title ?? ""}
      topic={discussion?.topic ?? ""}
      area={discussion ? (discussion.area.ward_name ?? discussion.area.lga_name) : ""}
      closesAt={discussion?.closes_at ?? null}
      closed={closed}
      invited={discussion?.membership === "invited"}
      posts={[...posts, ...queued]}
      hasMore={Boolean(after)}
      onMore={() => void fetchPosts(false)}
      draft={draft}
      onDraft={(text) => {
        setDraft(text);
        setDraftError(null);
        setWarning(false);
      }}
      draftError={draftError}
      nameWarning={warning}
      onKeep={() => {
        setKept(textHash(draft.trim()));
        setWarning(false);
      }}
      posting={Boolean(postKey) && !offline}
      onPost={() => {
        const text = draft.trim();
        if (!text) {
          setDraftError(t("o18.thread.emptyPost"));
          return;
        }
        if (text.length > 1000) {
          setDraftError(t("o18.thread.tooLong", { max: 1000 }));
          return;
        }
        if ((PHONE.test(text) || looksLikeName(text)) && kept !== textHash(text)) {
          setWarning(true);
          return;
        }
        const item = enqueue({ owner: session.code, kind: "post", discussion_id: params.id, body: { body: text } });
        setPostKey(item.key);
        setDraft("");
        setKept(null);
      }}
      flagPost={flagPost}
      onFlag={setFlagPost}
      onCloseFlag={() => setFlagPost(null)}
      onFlagReason={async (reason) => {
        if (!flagPost) return;
        const result = await api("DIS-03.flag", { params: { id: params.id, post_id: flagPost.id }, body: { reason }, idempotency_key: uuidv4() });
        setFlagPost(null);
        setFlagged(result.ok);
      }}
      flagged={flagged}
      leave={leave}
      onLeave={() => setLeave("confirm")}
      onCancelLeave={() => setLeave(null)}
      onConfirmLeave={async () => {
        setLeave("sending");
        const result = await api("DIS-04", { params: { id: params.id }, body: { action: "leave" }, idempotency_key: uuidv4() });
        setLeave(null);
        if (result.ok || result.status === 404) router.replace("/o/discussions");
      }}
      onRetry={() => void fetchPosts(true)}
      onBack={() => router.push("/o/discussions")}
    />
  );
}
