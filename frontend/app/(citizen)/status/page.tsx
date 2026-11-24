"use client";

import { useRouter, useSearchParams } from "next/navigation";
import { Suspense, useEffect, useRef, useState } from "react";
import { api, uuidv4 } from "../../../lib/api/client";
import { del } from "../../../lib/drafts/db";
import { useT } from "../../../lib/i18n/client";
import { useOutbox } from "../../../lib/outbox";
import { saveReceived } from "../../../lib/outbox/store";
import { SMS_SHORT_CODE } from "../../../lib/config";
import { useFocusTitle, useNetwork } from "../../(observer)/o/_lib/network";
import { normaliseReceipt, receiptValid } from "../../(observer)/o/_lib/receipt";
import { minutesFrom } from "../../(observer)/o/_lib/status";
import { StatusView, type StatusError, type StatusResult } from "../../(observer)/o/_views/CitizenViews";

/** P-01 Check a report: REP-06 for anyone; REP-07 and REP-04.citizen only from the phone holding the receipt secret. */
function StatusScreen() {
  const t = useT();
  const router = useRouter();
  const search = useSearchParams();
  const outbox = useOutbox();
  const { offline } = useNetwork();
  const [code, setCode] = useState(() => normaliseReceipt(search.get("code") ?? ""));
  const [checking, setChecking] = useState(false);
  const [error, setError] = useState<StatusError>(null);
  const [retryMinutes, setRetryMinutes] = useState(1);
  const [result, setResult] = useState<StatusResult | null>(null);
  const [question, setQuestion] = useState<{ id: string; body: string } | null>(null);
  const [reply, setReply] = useState("");
  const [replyKey, setReplyKey] = useState<string | null>(null);
  const [replyState, setReplyState] = useState<null | "sending" | "sent">(null);
  const [replyError, setReplyError] = useState<string | null>(null);
  const [withdraw, setWithdraw] = useState<null | "confirm" | "sending" | "error">(null);
  const withdrawKey = useRef<string | null>(null);
  const [banner, setBanner] = useState<string | null>(null);
  const autoChecked = useRef(false);
  useFocusTitle("p01");

  const saved = outbox.received.filter((entry) => entry.owner === "citizen");
  const secretFor = (receipt: string) => saved.find((entry) => entry.receipt_code === receipt)?.receipt_secret ?? null;

  async function check(raw: string) {
    const normal = normaliseReceipt(raw);
    setCode(normal);
    setResult(null);
    setQuestion(null);
    setReplyState(null);
    setBanner(null);
    // A typo is caught on the phone: no request for a code that cannot exist.
    if (!receiptValid(normal)) {
      setError("format");
      document.querySelector<HTMLElement>('input[data-testid="p01-code"], [data-testid="p01-code"] input')?.focus();
      return;
    }
    if (offline) {
      setError("offline");
      return;
    }
    setError(null);
    setChecking(true);
    const status = await api("REP-06", { params: { receipt_code: normal } });
    setChecking(false);
    if (!status.ok) {
      setError(
        status.status === 0
          ? "offline"
          : status.error.code === "receipt_code_invalid"
            ? "format"
            : status.status === 404
              ? "not_found"
              : status.error.code === "rate_limited"
                ? "too_many"
                : "server",
      );
      if (status.error.code === "rate_limited") setRetryMinutes(minutesFrom(status.retry_after_seconds, 60));
      return;
    }
    setResult(status.data);
    window.requestAnimationFrame(() => document.getElementById("p01-result")?.focus());
    const secret = secretFor(normal);
    if (status.data.has_open_question && secret) {
      const conversation = await api("REP-07.read", { params: { receipt_code: normal }, receipt_secret: secret });
      if (conversation.ok) {
        const open = conversation.data.messages.filter((m) => m.kind === "formal_question" && m.question_state === "open").pop();
        if (open) setQuestion({ id: open.id, body: open.body });
      }
    }
  }

  useEffect(() => {
    if (autoChecked.current || !outbox.loaded || !search.get("code")) return;
    autoChecked.current = true;
    void check(search.get("code") ?? "");
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [outbox.loaded]);

  const secret = result ? secretFor(result.receipt_code) : null;

  return (
    <StatusView
      offline={offline}
      code={code}
      onCode={(value) => {
        setCode(value.toUpperCase());
        setError(null);
      }}
      onCheck={() => void check(code)}
      checking={checking}
      error={error}
      retryMinutes={retryMinutes}
      saved={saved.map((entry) => entry.receipt_code)}
      onCheckSaved={(value) => void check(value)}
      onRemoveSaved={async (value) => {
        const entry = saved.find((candidate) => candidate.receipt_code === value);
        if (!entry) return;
        await saveReceived({ ...entry, owner: "citizen-forgotten", receipt_secret: undefined });
        await del("received", entry.id).catch(() => undefined);
      }}
      result={result}
      hasSecret={Boolean(secret)}
      question={question}
      reply={reply}
      onReply={(text) => {
        setReply(text);
        setReplyError(null);
      }}
      replyState={replyState}
      replyError={replyError}
      onSendReply={async () => {
        if (!result || !question || !secret) return;
        const text = reply.trim();
        if (!text) {
          setReplyError(t("o14.question.empty"));
          return;
        }
        // Public page: a reply is not queued (P-01); the key is kept for retries of the same text.
        const key = replyKey ?? uuidv4();
        setReplyKey(key);
        setReplyState("sending");
        const sent = await api("REP-07.reply", { params: { receipt_code: result.receipt_code }, body: { question_id: question.id, body: text }, receipt_secret: secret, idempotency_key: key });
        if (sent.ok) {
          setReplyState("sent");
          setReply("");
          setReplyKey(null);
          setResult({ ...result, status: sent.data.status, has_open_question: false });
          return;
        }
        setReplyState(null);
        if (sent.error.code === "question_closed" || sent.error.code === "report_closed" || sent.error.code === "report_withdrawn") {
          setReplyKey(null);
          void check(result.receipt_code);
        } else if (sent.error.code === "receipt_secret_invalid") setReplyError(t("p01.question.needSecret"));
        else if (sent.status === 0) setReplyError(t("p01.offline"));
        else if (sent.error.code === "rate_limited") setReplyError(t("p01.tooMany", { minutes: minutesFrom(sent.retry_after_seconds, 60) }));
        else setReplyError(t("common.error.server"));
      }}
      withdraw={withdraw}
      onWithdraw={() => {
        withdrawKey.current = uuidv4();
        setWithdraw("confirm");
      }}
      onCancelWithdraw={() => setWithdraw(null)}
      onConfirmWithdraw={async () => {
        if (!result || !secret) return;
        setWithdraw("sending");
        const done = await api("REP-04.citizen", { params: { receipt_code: result.receipt_code }, body: { confirm: true }, receipt_secret: secret, idempotency_key: withdrawKey.current ?? uuidv4() });
        if (done.ok) {
          setWithdraw(null);
          setResult({ ...result, status: "withdrawn", has_open_question: false });
          return;
        }
        if (done.error.code === "withdraw_unavailable") {
          setWithdraw(null);
          setBanner("o14.withdraw.tooLate");
          void check(result.receipt_code);
        } else if (done.error.code === "receipt_secret_invalid") {
          setWithdraw(null);
          setBanner("p01.question.needSecret");
        } else setWithdraw("error");
      }}
      banner={banner}
      shortCode={SMS_SHORT_CODE}
      onBack={() => (window.history.length > 1 ? router.back() : router.push("/"))}
    />
  );
}

/** P-01 Check a report (`/status?code=`). */
export default function StatusPage() {
  return (
    <Suspense fallback={null}>
      <StatusScreen />
    </Suspense>
  );
}
