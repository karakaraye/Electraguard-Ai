"use client";

import { useParams, useRouter } from "next/navigation";
import { useEffect, useMemo, useRef, useState } from "react";
import { api, uuidv4 } from "../../../../../lib/api/client";
import type { ChecklistAnswer, Message, MessageListResponse, ReportDetail, WithdrawnStub } from "../../../../../lib/api/types";
import { useT } from "../../../../../lib/i18n/client";
import { kick, removeItems, useOutbox, useReportState } from "../../../../../lib/outbox";
import { saveReceived } from "../../../../../lib/outbox/store";
import { openPinSheet } from "../../_components/ObserverRuntime";
import { QUESTIONS, STAGES, MATERIALS, QUEUE_SIZES } from "../../_lib/checklist";
import { prepareAndUpload, refusalKey } from "../../_lib/media";
import { useFocusTitle, useNetwork } from "../../_lib/network";
import { dropPending, enqueue, onPendingDone, onPendingRefused, usePending, type PendingItem } from "../../_lib/pending";
import { OUTBOX_BADGE, OUTCOME_KEY, SERVER_BADGE, SERVER_HINT } from "../../_lib/status";
import { useLoad } from "../../_lib/useLoad";
import { useSignedIn } from "../../_lib/useSignedIn";
import { ReportDetailView, type DetailAttachment, type DetailMessage } from "../../_views/ReportDetailView";

type Detail = ReportDetail | WithdrawnStub;
const isStub = (detail: Detail): detail is WithdrawnStub => detail.status === "withdrawn" && !("media" in detail);

const LOCAL_HINT: Record<string, string> = {
  queued: "common.status.onPhoneHint",
  sending: "common.status.notConfirmedHint",
  unconfirmed: "common.status.notConfirmedHint",
  needs_attention: "common.status.needsAttentionHint",
  waiting_code: "o03.revoked.unsentHint",
};

/** Checklist answers and result-sheet numbers as label/value lines (no check flags: REP-03 never sends them). */
function answerLines(detail: ReportDetail, t: ReturnType<typeof useT>): Array<{ label: string; value: string }> {
  if (detail.checklist) {
    const slug = STAGES.find((stage) => stage.wire === detail.checklist?.stage)?.slug ?? "arrival";
    return detail.checklist.answers.map((answer: ChecklistAnswer) => {
      const question = QUESTIONS[slug].find((q) => q.id === answer.question);
      const label = answer.question === "materials_missing" ? t("o15.q.materialsList") : question ? t(question.key) : answer.question;
      let value: string;
      if (answer.question === "materials_missing") value = answer.answer.map((m) => t(MATERIALS.find((x) => x.value === m)?.key ?? "o15.material.other")).join(", ");
      else if (answer.question === "queue_size") value = t(QUEUE_SIZES.find((x) => x.value === answer.answer)?.key ?? "o15.queue.none");
      else if (answer.question === "arrival_time") value = answer.answer;
      else value = t(answer.answer === "yes" ? "ui.yes" : answer.answer === "no" ? "ui.no" : "o15.answer.notSeen");
      return { label, value };
    });
  }
  if (detail.result_sheet) {
    const sheet = detail.result_sheet;
    return [
      { label: t("o16.numbers.registered"), value: String(sheet.registered) },
      { label: t("o16.numbers.accredited"), value: String(sheet.accredited) },
      ...Object.entries(sheet.votes).map(([label, value]) => ({ label: t("o16.numbers.party", { label }), value: String(value) })),
      { label: t("o16.numbers.rejected"), value: String(sheet.rejected) },
    ];
  }
  return [];
}

/** O-14 Report detail: REP-03 + MSG-01 for a received report; the outbox for one still on this phone. */
export function ReportDetailScreen() {
  const t = useT();
  const router = useRouter();
  const params = useParams<{ ref: string }>();
  const { session } = useSignedIn();
  const { offline } = useNetwork();
  const { loaded } = useOutbox();
  const report = useReportState(params.ref);
  const pending = usePending();
  const item = report.item;
  const local = Boolean(item && item.state !== "received");
  const serverId = item?.server?.id ?? report.entry?.id ?? (item ? null : params.ref);

  const [stub, setStub] = useState<WithdrawnStub | null>(null);
  const [reply, setReply] = useState("");
  const [replyKey, setReplyKey] = useState<string | null>(null);
  const [replyState, setReplyState] = useState<null | "sending" | "queued" | "sent" | "closed">(null);
  const [replyError, setReplyError] = useState<string | null>(null);
  const [draft, setDraft] = useState("");
  const [messageKey, setMessageKey] = useState<string | null>(null);
  const [messageError, setMessageError] = useState<string | null>(null);
  const [attached, setAttached] = useState<{ id: string; name: string } | null>(null);
  const [attaching, setAttaching] = useState(false);
  const [writesRefused, setWritesRefused] = useState(false);
  const [withdraw, setWithdraw] = useState<null | "confirm" | "sending" | "too_late" | "error">(null);
  const withdrawKey = useRef<string | null>(null);
  const [banner, setBanner] = useState<{ tone: "attn" | "ok" | "danger"; key: string } | null>(null);
  const [adding, setAdding] = useState<{ name: string; kind: DetailAttachment["kind"]; size: number } | null>(null);
  const [attachmentBlocked, setAttachmentBlocked] = useState(false);
  const [deleteConfirm, setDeleteConfirm] = useState(false);
  const readUpTo = useRef<string | null>(null);

  const detail = useLoad<Detail>(() => api("REP-03", { params: { id: serverId ?? "" } }), serverId ?? "", {
    enabled: Boolean(session && serverId && !local),
    offline,
    pollMs: 30_000,
  });
  const messages = useLoad<MessageListResponse>(() => api("MSG-01.list", { params: { report_id: serverId ?? "" }, query: { limit: 100 } }), serverId ?? "", {
    enabled: Boolean(session && serverId && !local && detail.data && !isStub(detail.data)),
    offline,
    pollMs: 30_000,
    collection: true,
  });

  const current = stub ?? detail.data;
  useFocusTitle(`o14:${current?.status ?? "x"}:${local}`);

  useEffect(() => {
    if (detail.status === "auth" || messages.status === "auth") openPinSheet();
  }, [detail.status, messages.status]);

  // Arriving with an open question: focus its heading (O-14 accessibility).
  const questionId = current && !isStub(current) ? current.open_question?.id : null;
  useEffect(() => {
    if (questionId) document.getElementById("o14-question")?.focus();
  }, [questionId]);

  // Keep the on-phone index (G9) in step with the server status.
  useEffect(() => {
    const entry = report.entry;
    if (entry && current && entry.status !== current.status) void saveReceived({ ...entry, status: current.status });
  }, [current, report.entry]);

  // Mark the conversation read once it has been on screen (clears unread_messages in REP-02).
  useEffect(() => {
    const items = messages.data?.items ?? [];
    const last = items[items.length - 1];
    if (!serverId || !last || readUpTo.current === last.id || !items.some((m) => !m.read && m.author !== "observer")) return;
    readUpTo.current = last.id;
    const timer = window.setTimeout(() => void api("MSG-01.mark_read", { params: { report_id: serverId }, body: { up_to_message_id: last.id } }), 1_500);
    return () => window.clearTimeout(timer);
  }, [messages.data, serverId]);

  // Results of queued replies and messages.
  useEffect(
    () =>
      onPendingDone((done) => {
        if (done.kind !== "message") return;
        if (done.key === replyKey) {
          setReplyState("sent");
          setReply("");
          detail.reload();
        }
        if (done.key === messageKey) {
          setMessageKey(null);
          setDraft("");
          setAttached(null);
        }
        messages.reload();
      }),
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [replyKey, messageKey],
  );

  // Refusals of queued replies and messages (contract MSG-02 errors).
  const mine = pending.filter((p): p is Extract<PendingItem, { kind: "message" }> => p.kind === "message" && p.report_id === serverId);
  useEffect(
    () =>
      onPendingRefused((p) => {
        if (p.kind !== "message" || p.report_id !== serverId) return;
        if (p.key === replyKey && p.error_code === "question_closed") {
          setReplyState("closed");
        } else if (p.error_code === "report_closed" || p.error_code === "report_withdrawn") {
          setWritesRefused(true);
          if (p.key === replyKey) setReplyState(null);
          void dropPending(p.key);
          detail.reload();
        } else if (p.error_code === "rate_limited") {
          if (p.key === replyKey) setReplyError(t("common.error.tooManyTries", { minutes: 60 }));
          else setMessageError(t("common.error.tooManyTries", { minutes: 60 }));
        } else {
          const error = t(p.fields?.body?.code === "max_length" ? "o14.tooLong" : "common.error.server");
          if (p.key === replyKey) {
            setReplyState(null);
            setReplyError(error);
            setReply(p.body.body);
          } else {
            setMessageKey(null);
            setMessageError(error);
            setDraft(p.body.body);
          }
          void dropPending(p.key);
        }
      }),
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [replyKey, serverId, t],
  );

  const replyPending = replyKey ? pending.find((p) => p.key === replyKey) : undefined;
  const shownReplyState = replyState === "sent" || replyState === "closed" ? replyState : replyPending ? (offline || replyPending.wait === "network" ? "queued" : "sending") : replyState;

  const conversation: DetailMessage[] = useMemo(() => {
    const server = (messages.data?.items ?? []).map((m: Message) => ({
      id: m.id,
      kind: m.kind,
      mine: m.author === "observer",
      authorLabel: m.author_label,
      body: m.body,
      at: m.created_at,
      questionState: m.question_state,
      attachmentUrl: m.attachment && m.attachment.status !== "failed" ? `/api/v1/media/${m.attachment.id}/content?variant=display` : null,
    }));
    const queued = mine
      .filter((p) => p.state !== "needs_attention")
      .map((p) => ({ id: p.key, kind: (p.body.kind === "reply" ? "reply" : "message") as DetailMessage["kind"], mine: true, authorLabel: "", body: p.body.body, at: p.created_at, queued: true }));
    return [...server, ...queued];
  }, [messages.data, mine]);

  if (!session || !loaded) return null;

  /* ---------- Still on this phone ---------- */
  if (item && local) {
    const body = item.body;
    return (
      <ReportDetailView
        {...noServer}
        offline={offline}
        load="ok"
        source="local"
        receiptCode={null}
        status={OUTBOX_BADGE[item.state]}
        statusHintKey={LOCAL_HINT[item.state] ?? "common.status.onPhoneHint"}
        kind="incident"
        category={item.summary.category_observer}
        place={item.summary.place_label ?? item.summary.ward_name}
        observedAt={item.summary.occurred_at ?? item.created_at}
        receivedAt={null}
        description={body?.description ?? null}
        attachments={item.media.map((m) => ({ id: m.client_media_id, kind: m.kind, name: m.name, sizeBytes: m.size_bytes, state: m.state === "rejected" ? "failed" : m.state, removable: false }))}
        canSendNow={item.state === "queued" || item.state === "unconfirmed"}
        onSendNow={() => kick()}
        deleteConfirm={deleteConfirm}
        onDelete={() => setDeleteConfirm(true)}
        onCancelDelete={() => setDeleteConfirm(false)}
        onConfirmDelete={async () => {
          setDeleteConfirm(false);
          await removeItems([item.id]);
          router.replace("/o/reports");
        }}
        banner={item.state === "needs_attention" ? { tone: "attn", key: "common.status.needsAttentionHint" } : null}
        onRetry={() => kick()}
        onBack={() => router.back()}
      />
    );
  }

  /* ---------- Received (server) ---------- */
  const load = current ? "ok" : detail.status === "not_found" ? "not_found" : detail.status === "loading" ? "loading" : detail.status === "offline" ? "offline" : "error";
  const known = report.entry;
  if (!current || isStub(current)) {
    const withdrawn = current && isStub(current) ? current : null;
    return (
      <ReportDetailView
        {...noServer}
        offline={offline}
        load={withdrawn ? "ok" : known && load !== "not_found" ? "ok" : load}
        source={withdrawn || known?.status === "withdrawn" ? "withdrawn" : "server"}
        receiptCode={withdrawn?.receipt_code ?? known?.receipt_code ?? null}
        status={SERVER_BADGE[withdrawn?.status ?? known?.status ?? "received"]}
        statusHintKey={SERVER_HINT[known?.status ?? "received"]}
        category={known?.category_observer ?? null}
        place={known?.ward_name ?? null}
        observedAt={known?.occurred_at ?? null}
        receivedAt={withdrawn?.received_at ?? known?.received_at ?? null}
        withdrawnAt={withdrawn?.withdrawn_at ?? null}
        conversation={offline ? "offline" : "error"}
        banner={offline ? null : load === "error" ? { tone: "attn", key: "o14.loadError" } : null}
        onRetry={detail.reload}
        onBack={() => router.back()}
      />
    );
  }

  const d = current;
  const area = d.area;
  const place = area ? [area.polling_unit_name, area.ward_name, area.lga_name].filter(Boolean).join(", ") : null;
  const outboxMedia: DetailAttachment[] = (item?.media ?? [])
    .filter((m) => m.state !== "saved")
    .map((m) => ({ id: m.client_media_id, kind: m.kind, name: m.name, sizeBytes: m.size_bytes, state: m.state === "rejected" ? "failed" : m.state, progress: m.size_bytes ? m.received_bytes / m.size_bytes : 0, removable: false }));
  const attachments: DetailAttachment[] = [
    ...d.media.map((m, index) => ({
      id: m.id,
      kind: m.kind,
      name: t("o10.itemName", { kind: m.kind, n: index + 1 }),
      sizeBytes: m.size_bytes,
      state: (m.status === "failed" ? "missing" : "saved") as DetailAttachment["state"],
      reasonKey: m.status === "failed" ? "o12.upload.missing" : m.status === "processing" ? "o14.media.processing" : undefined,
      removable: d.can_withdraw,
      viewUrl: m.status === "ready" ? `/api/v1/media/${m.id}/content?variant=${m.kind === "photo" ? "thumb" : m.kind === "video" ? "poster" : "display"}` : null,
    })),
    ...outboxMedia,
    ...(adding ? [{ id: "adding", kind: adding.kind, name: adding.name, sizeBytes: adding.size, state: "uploading" as const, progress: 0, removable: false }] : []),
  ];

  function sendMessage(kind: "message" | "reply", text: string, replyTo?: string, attachmentId?: string | null) {
    if (!serverId) return null;
    const body = kind === "reply" && replyTo ? { kind, body: text, reply_to: replyTo } : { kind: "message" as const, body: text, attachment_media_id: attachmentId ?? null };
    return enqueue({ owner: session!.code, kind: "message", report_id: serverId, body });
  }

  return (
    <ReportDetailView
      offline={offline}
      load="ok"
      source="server"
      receiptCode={d.receipt_code}
      status={SERVER_BADGE[d.status]}
      statusHintKey={SERVER_HINT[d.status]}
      outcomeKey={d.outcome ? OUTCOME_KEY[d.outcome] : null}
      kind={d.kind}
      category={d.category_observer}
      stage={d.checklist ? (STAGES.find((s) => s.wire === d.checklist?.stage)?.slug ?? null) : null}
      place={place}
      observedAt={d.occurred_at}
      receivedAt={d.received_at}
      description={d.kind === "incident" ? d.description : null}
      answers={answerLines(d, t)}
      attachments={attachments}
      canAddMedia={d.can_add_media}
      adding={Boolean(adding)}
      attachmentBlocked={attachmentBlocked}
      onAdd={async (file) => {
        if (!serverId) return;
        setBanner(null);
        setAdding({ name: file.name || t("o10.itemName", { kind: "photo", n: d.media.length + 1 }), kind: file.type.startsWith("video") ? "video" : file.type.startsWith("audio") ? "audio" : "photo", size: file.size });
        const result = await prepareAndUpload(serverId, file, "evidence");
        setAdding(null);
        if (result.kind === "saved") detail.reload();
        else setBanner({ tone: "attn", key: result.kind === "retry" ? "o14.media.failed" : refusalKey(result.code) });
      }}
      onRemoveAttachment={async (id) => {
        if (!serverId) return;
        const result = await api("MED-05.media", { params: { report_id: serverId, media_id: id } });
        if (result.ok) detail.reload();
        else if (result.error.code === "invalid_transition") setAttachmentBlocked(true);
        else setBanner({ tone: "attn", key: "common.error.server" });
      }}
      question={replyState === "sent" && !d.open_question ? { id: "answered", body: "", askedAt: d.received_at } : d.open_question ? { id: d.open_question.id, body: d.open_question.body, askedAt: d.open_question.asked_at } : null}
      reply={reply}
      onReply={(text) => {
        setReply(text);
        setReplyError(null);
      }}
      replyState={shownReplyState}
      replyError={replyError}
      onSendReply={() => {
        const text = reply.trim();
        if (!text) {
          setReplyError(t("o14.question.empty"));
          return;
        }
        if (!d.open_question || replyPending) return;
        const queued = sendMessage("reply", text, d.open_question.id);
        if (queued) {
          setReplyKey(queued.key);
          setReplyState(offline ? "queued" : "sending");
        }
      }}
      onSendAsMessage={() => {
        const text = reply.trim();
        if (replyKey) void dropPending(replyKey);
        const queued = sendMessage("message", text);
        setReplyState(null);
        setReplyKey(null);
        setReply("");
        if (queued) setMessageKey(queued.key);
      }}
      conversation={offline ? "offline" : messages.status === "ok" ? "ok" : messages.status === "loading" ? "loading" : messages.status === "unavailable" ? "unavailable" : "error"}
      messages={conversation}
      canMessage={d.can_message}
      writesRefused={writesRefused}
      draft={draft}
      onDraft={(text) => {
        setDraft(text);
        setMessageError(null);
      }}
      messageState={messageKey ? (offline ? "queued" : "sending") : null}
      messageError={messageError}
      onSendMessage={() => {
        const text = draft.trim();
        if (!text && !attached) {
          setMessageError(t("o14.conversation.write"));
          return;
        }
        if (messageKey) return;
        const queued = sendMessage("message", text, undefined, attached?.id ?? null);
        if (queued) {
          setMessageKey(queued.key);
          setDraft("");
          setAttached(null);
        }
      }}
      onAttach={async (file) => {
        if (!serverId) return;
        setAttaching(true);
        const result = await prepareAndUpload(serverId, file, "message");
        setAttaching(false);
        if (result.kind === "saved") setAttached({ id: result.media.id, name: file.name || t("o10.itemName", { kind: result.media.kind, n: 1 }) });
        else setMessageError(t(result.kind === "retry" ? "o14.media.failed" : refusalKey(result.code)));
      }}
      attaching={attaching}
      attachedName={attached?.name ?? null}
      canWithdraw={d.can_withdraw}
      withdraw={withdraw}
      onWithdraw={() => {
        withdrawKey.current = uuidv4();
        setWithdraw("confirm");
      }}
      onCancelWithdraw={() => setWithdraw(null)}
      onConfirmWithdraw={async () => {
        if (!serverId || offline) return;
        setWithdraw("sending");
        // Never queued, never optimistic: the screen changes only on the server's answer.
        const result = await api("REP-04.observer", { params: { id: serverId }, body: { confirm: true }, idempotency_key: withdrawKey.current ?? uuidv4() });
        if (result.ok) {
          setWithdraw(null);
          setStub(result.data);
          if (report.entry) void saveReceived({ ...report.entry, status: "withdrawn" });
          return;
        }
        if (result.error.code === "withdraw_unavailable") {
          setWithdraw(null);
          setBanner({ tone: "attn", key: "o14.withdraw.tooLate" });
          detail.reload();
          return;
        }
        setWithdraw("error");
      }}
      {...localNoop}
      banner={banner ?? (detail.stale && !offline ? { tone: "attn", key: "o14.loadError" } : writesRefused ? { tone: "attn", key: "o14.writesRefused" } : null)}
      onRetry={detail.reload}
      onBack={() => router.back()}
    />
  );
}

const noop = () => undefined;

const localNoop = {
  canSendNow: false,
  onSendNow: noop,
  deleteConfirm: false,
  onDelete: noop,
  onConfirmDelete: noop,
  onCancelDelete: noop,
};

/** Props a screen without a received report does not use. */
const noServer = {
  kind: "incident" as const,
  category: null,
  place: null,
  observedAt: null,
  receivedAt: null,
  description: null,
  attachments: [],
  canAddMedia: false,
  adding: false,
  onAdd: noop,
  onRemoveAttachment: noop,
  attachmentBlocked: false,
  question: null,
  reply: "",
  onReply: noop,
  replyState: null,
  replyError: null,
  onSendReply: noop,
  onSendAsMessage: noop,
  conversation: "ok" as const,
  messages: [],
  canMessage: false,
  writesRefused: false,
  draft: "",
  onDraft: noop,
  messageState: null,
  messageError: null,
  onSendMessage: noop,
  onAttach: noop,
  attaching: false,
  attachedName: null,
  canWithdraw: false,
  withdraw: null,
  onWithdraw: noop,
  onConfirmWithdraw: noop,
  onCancelWithdraw: noop,
  ...localNoop,
  banner: null,
};
