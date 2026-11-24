"use client";

import { useParams, useRouter, useSearchParams } from "next/navigation";
import { Suspense, useEffect, useRef } from "react";
import { del } from "../../../../../lib/drafts/db";
import { kick, retryMedia, useOutbox, type ReceivedEntry } from "../../../../../lib/outbox";
import { saveReceived } from "../../../../../lib/outbox/store";
import { SMS_SHORT_CODE, SMS_SHORT_CODE_IS_TEST } from "../../../../../lib/config";
import { useFocusTitle, useNetwork } from "../../../../(observer)/o/_lib/network";
import { CitizenReceiptView } from "../../../../(observer)/o/_views/CitizenViews";
import { PendingView, type ReceiptItem } from "../../../../(observer)/o/_views/ReceiptView";

const CITIZEN = "citizen";
const FORGOTTEN = "citizen-forgotten";

/**
 * C-01 Citizen receipt. Shown only after REP-05 confirmed (the outbox item holds
 * the server receipt). "Keep this code on this phone" (default on, Q2) keeps the
 * code and the receipt secret in the on-phone index; off removes both at once.
 */
function CitizenReceipt() {
  const router = useRouter();
  const params = useParams<{ code: string }>();
  const search = useSearchParams();
  const justSent = search.has("just-sent");
  const code = decodeURIComponent(params.code).toUpperCase();
  const outbox = useOutbox();
  const { offline } = useNetwork();
  const item = outbox.items.find((candidate) => candidate.channel === "citizen" && candidate.server?.receipt_code === code) ?? null;
  const entry = outbox.received.find((candidate) => candidate.receipt_code === code && (candidate.owner === CITIZEN || candidate.owner === FORGOTTEN)) ?? null;
  const original = useRef<ReceivedEntry | null>(null);
  useFocusTitle("c01");

  useEffect(() => {
    if (entry && entry.owner === CITIZEN) original.current = entry;
  }, [entry]);

  useEffect(() => {
    if (justSent) kick();
  }, [justSent]);

  // Back from a sent receipt goes to the start, never back into the sent draft (R3).
  useEffect(() => {
    if (!justSent) return;
    const onPop = () => router.replace("/o/start?view=choose");
    window.addEventListener("popstate", onPop);
    return () => window.removeEventListener("popstate", onPop);
  }, [justSent, router]);

  if (!outbox.loaded) return null;
  const receipt = item?.server ?? (entry ? { receipt_code: entry.receipt_code, received_at: entry.received_at } : null);
  // Never a code without the server's confirmation: an unknown code is not shown here.
  if (!receipt) return <PendingView state="unknown" offline={offline} onHome={() => router.replace("/status")} />;

  const items: ReceiptItem[] = (item?.media ?? []).map((media) => ({
    id: media.client_media_id,
    kind: media.kind,
    name: media.name,
    sizeBytes: media.size_bytes,
    state: media.state === "rejected" ? "failed" : media.state,
    progress: media.size_bytes ? media.received_bytes / media.size_bytes : 0,
    reasonKey: media.state === "rejected" ? (media.error_code === "receipt_secret_invalid" ? "c01.secretMissing" : "o12.upload.failed") : undefined,
    removable: false,
  }));

  return (
    <CitizenReceiptView
      offline={offline}
      code={receipt.receipt_code}
      receivedAt={receipt.received_at}
      justSent={justSent}
      keep={entry?.owner === CITIZEN}
      onKeep={async (keep) => {
        if (!entry) return;
        if (keep) {
          const back = original.current ?? entry;
          await saveReceived({ ...back, owner: CITIZEN, receipt_secret: back.receipt_secret ?? item?.receipt_secret });
        } else {
          original.current = { ...entry, receipt_secret: entry.receipt_secret ?? item?.receipt_secret };
          // In memory only for this visit (so the switch can be turned back on); removed from the phone now.
          await saveReceived({ ...entry, owner: FORGOTTEN, receipt_secret: undefined });
          await del("received", entry.id).catch(() => undefined);
        }
      }}
      shortCode={SMS_SHORT_CODE}
      shortCodeIsTest={SMS_SHORT_CODE_IS_TEST}
      items={items}
      onRetry={(id) => item && void retryMedia(item.id, id)}
      onCheckStatus={() => router.push(`/status?code=${encodeURIComponent(receipt.receipt_code)}`)}
      onAnother={() => router.push("/o/new/what?as=citizen")}
      onBack={() => router.replace("/o/start?view=choose")}
    />
  );
}

/** C-01 Citizen receipt. */
export default function CitizenReceiptPage() {
  return (
    <Suspense fallback={null}>
      <CitizenReceipt />
    </Suspense>
  );
}
