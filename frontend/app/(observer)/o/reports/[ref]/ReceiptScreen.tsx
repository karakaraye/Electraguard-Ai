"use client";

import { useParams, useRouter, useSearchParams } from "next/navigation";
import { useEffect, useRef, useState } from "react";
import { api } from "../../../../../lib/api/client";
import type { MediaKind } from "../../../../../lib/api/types";
import { putBlob } from "../../../../../lib/drafts/db";
import {
  kick,
  removeMedia,
  replaceMediaFile,
  retryMedia,
  setServerMediaStatus,
  useOutbox,
  useReportState,
  type OutboxMedia,
} from "../../../../../lib/outbox";
import { Button } from "../../../../../ui";
import { prepareAudio, preparePhoto, prepareVideo } from "../../../../../ui/MediaCapture/process";
import { useT } from "../../../../../lib/i18n/client";
import { useFocusTitle, useNetwork } from "../../_lib/network";
import { PendingView, ReceiptView, type ReceiptItem } from "../../_views/ReceiptView";

const REASON: Record<string, { key: string; vars?: Record<string, string | number> }> = {
  payload_too_large: { key: "o10.tooBig", vars: { max: "25 MB" } },
  unsupported_media_type: { key: "o10.wrongType" },
  media_limit_reached: { key: "o10.limitItems", vars: { max: 6 } },
  report_closed: { key: "o12.upload.closed" },
  report_withdrawn: { key: "o11.withdrawn" },
  media_unreadable: { key: "o12.upload.failed" },
  validation_failed: { key: "o10.videoTooLong" },
};

const ACCEPT: Record<MediaKind, string> = { photo: "image/*", video: "video/*", audio: "audio/*" };

function uiState(media: OutboxMedia): ReceiptItem["state"] {
  if (media.state === "rejected") return "failed";
  return media.state;
}

export function ReceiptScreen() {
  const t = useT();
  const router = useRouter();
  const params = useParams<{ ref: string }>();
  const search = useSearchParams();
  const justSent = search.has("just-sent");
  const citizen = search.get("as") === "citizen";
  const report = useReportState(params.ref);
  const { loaded } = useOutbox();
  const { offline } = useNetwork();
  const [removeBlocked, setRemoveBlocked] = useState(false);
  const chooseInput = useRef<HTMLInputElement>(null);
  const chooseTarget = useRef<string | null>(null);
  const [accept, setAccept] = useState("image/*");
  const item = report.item;
  const serverId = item?.server?.id ?? report.entry?.id ?? null;

  useFocusTitle(`receipt:${report.state}`);

  // REP-03 every 30 s while an attachment is still being prepared on the server (observer only).
  const watching = !citizen && Boolean(item?.media.some((m) => m.state === "saved" && m.server_status === "processing"));
  useEffect(() => {
    if (!watching || !serverId || !item || offline) return;
    const poll = async () => {
      const detail = await api("REP-03", { params: { id: serverId } });
      if (!detail.ok) return;
      for (const media of detail.data.media) await setServerMediaStatus(item.id, media.id, media.status);
    };
    void poll();
    const timer = window.setInterval(poll, 30_000);
    return () => window.clearInterval(timer);
  }, [watching, serverId, item, offline]);

  useEffect(() => {
    if (justSent) kick();
  }, [justSent]);

  if (!loaded) return null;
  if (report.state === "unknown") {
    return report.item || report.entry ? null : <PendingView state="unknown" offline={offline} onHome={() => router.push("/o")} />;
  }

  const receipt = item?.server ?? (report.entry ? { receipt_code: report.entry.receipt_code, received_at: report.entry.received_at } : null);
  if (!receipt || report.state === "withdrawn") {
    return (
      <PendingView
        state={report.state}
        offline={offline}
        onHome={() => router.push("/o")}
        action={
          report.state === "on_phone" || report.state === "not_confirmed" ? (
            <Button block disabled={offline} onClick={() => kick()} data-testid="pending-send-now">
              {t("o04.sendNow")}
            </Button>
          ) : undefined
        }
      />
    );
  }

  const received = report.state === "received" || report.state === "in_review" || report.state === "question" || report.state === "closed";
  const items: ReceiptItem[] = (item?.media ?? []).map((media) => {
    const reason = media.state === "rejected" && media.error_code ? REASON[media.error_code] ?? { key: "o12.upload.failed" } : undefined;
    return {
      id: media.client_media_id,
      kind: media.kind,
      name: media.name,
      sizeBytes: media.size_bytes,
      state: uiState(media),
      progress: media.size_bytes ? media.received_bytes / media.size_bytes : 0,
      reasonKey: reason?.key,
      reasonVars: reason?.vars,
      removable: report.state === "received" && media.state !== "uploading",
    };
  });

  async function remove(id: string) {
    const media = item?.media.find((m) => m.client_media_id === id);
    if (!item || !media || !item.server) return;
    const secret = item.channel === "citizen" ? item.receipt_secret : undefined;
    if (media.media_id) {
      const result = await api("MED-05.media", { params: { report_id: item.server.id, media_id: media.media_id }, receipt_secret: secret });
      if (!result.ok) {
        if (result.error.code === "invalid_transition") setRemoveBlocked(true);
        return;
      }
    } else if (media.upload_id) {
      const result = await api("MED-05.upload", { params: { upload_id: media.upload_id }, receipt_secret: secret });
      if (!result.ok) {
        if (result.error.code === "invalid_transition") setRemoveBlocked(true);
        return;
      }
    }
    await removeMedia(item.id, id);
  }

  async function chooseAgain(file: File) {
    const id = chooseTarget.current;
    chooseTarget.current = null;
    const media = item?.media.find((m) => m.client_media_id === id);
    if (!item || !media || !id) return;
    try {
      const prepared = media.kind === "photo" ? await preparePhoto(file) : media.kind === "video" ? await prepareVideo(file) : await prepareAudio(file);
      const key = `${item.id}:${id}:${prepared.sha256.slice(0, 12)}`;
      await putBlob(key, prepared.blob);
      await replaceMediaFile(item.id, id, {
        blob_key: key,
        content_type: prepared.content_type,
        size_bytes: prepared.size_bytes,
        sha256: prepared.sha256,
        duration_ms: prepared.duration_ms,
      });
      kick();
    } catch {
      // The row keeps "Choose the file again".
    }
  }

  return (
    <>
      <ReceiptView
        code={receipt.receipt_code}
        receivedAt={receipt.received_at}
        justSent={justSent && received}
        citizen={citizen || item?.channel === "citizen"}
        items={items}
        removeBlocked={removeBlocked}
        offline={offline}
        onRetry={(id) => item && void retryMedia(item.id, id)}
        onRemove={(id) => void remove(id)}
        onChooseAgain={(id) => {
          const media = item?.media.find((m) => m.client_media_id === id);
          if (!media) return;
          chooseTarget.current = id;
          setAccept(ACCEPT[media.kind]);
          window.requestAnimationFrame(() => chooseInput.current?.click());
        }}
        onAnother={() => router.push(citizen ? "/o/new/what?as=citizen" : "/o/new/what")}
        onHome={() => router.replace(citizen ? "/o/start?view=choose" : "/o")}
      />
      <input
        ref={chooseInput}
        type="file"
        accept={accept}
        hidden
        onChange={(event) => {
          const file = event.target.files?.[0];
          event.target.value = "";
          if (file) void chooseAgain(file);
        }}
      />
    </>
  );
}
