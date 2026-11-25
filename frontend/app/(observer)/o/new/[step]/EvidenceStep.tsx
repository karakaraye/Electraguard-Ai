"use client";

/* O-10 container: capture, prepare on the phone (location removed first), store, and list. */

import { useEffect, useRef, useState } from "react";
import { uuidv4 } from "../../../../../lib/api/client";
import type { MediaKind } from "../../../../../lib/api/types";
import { del, getBlob, putBlob } from "../../../../../lib/drafts/db";
import type { DraftHandle, DraftMedia } from "../../../../../lib/drafts";
import { useT } from "../../../../../lib/i18n/client";
import { MAX_QUEUED_MEDIA_BYTES, queuedMediaBytes } from "../../../../../lib/outbox";
import { useVoiceRecorder, type CaptureSource } from "../../../../../ui";
import {
  canBlurOnPhone,
  estimateSeconds,
  kindOf,
  MediaError,
  prepareAudio,
  preparePhoto,
  prepareVideo,
  type Prepared,
} from "../../../../../ui/MediaCapture/process";
import { EvidenceView, type EvidenceItem, type EvidenceViewProps, MAX_ITEMS } from "../../_views/IncidentViews";

/** Server limits per report (MED): 6 items, 60 MiB. */
const MAX_REPORT_BYTES = 60 * 1024 * 1024;
const MAX_LABEL: Record<MediaKind, string> = { photo: "2 MB", video: "25 MB", audio: "4 MB" };

type Notice = EvidenceViewProps["notices"][number];

/** Object URLs for photo previews, made from the stored (location-free) blobs. */
export function useMediaPreviews(media: DraftMedia[]): Record<string, string> {
  const [urls, setUrls] = useState<Record<string, string>>({});
  const keys = media.filter((m) => m.kind === "photo").map((m) => `${m.client_media_id}:${m.blob_key}`).join("|");
  useEffect(() => {
    let cancelled = false;
    const made: string[] = [];
    void (async () => {
      const next: Record<string, string> = {};
      for (const item of media) {
        if (item.kind !== "photo") continue;
        const blob = await getBlob(item.blob_key).catch(() => null);
        if (!blob) continue;
        const url = URL.createObjectURL(blob);
        made.push(url);
        next[item.client_media_id] = url;
      }
      if (!cancelled) setUrls(next);
    })();
    return () => {
      cancelled = true;
      for (const url of made) URL.revokeObjectURL(url);
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [keys]);
  return urls;
}

type Props = {
  handle: DraftHandle;
  nav: { done: () => void; back: () => void };
  shell: { onBack: () => void; onDiscard?: () => void; offline: boolean };
  offline: boolean;
};

export function EvidenceStep({ handle, nav, shell, offline }: Props) {
  const t = useT();
  const draft = handle.draft;
  const media = draft?.media ?? [];
  const previews = useMediaPreviews(media);
  const [processing, setProcessing] = useState<Array<{ id: string; kind: MediaKind }>>([]);
  const [notices, setNotices] = useState<Notice[]>([]);
  const replaceTarget = useRef<string | null>(null);
  const retakeInput = useRef<HTMLInputElement>(null);
  const [retakeAccept, setRetakeAccept] = useState("image/*");

  const recorder = useVoiceRecorder(
    (blob, durationMs) => void add(new File([blob], "voice", { type: blob.type }), "file", durationMs),
    () => setNotices([{ key: "o10.micDenied", tone: "attn" }]),
  );

  const totalBytes = media.reduce((sum, item) => sum + item.size_bytes, 0);
  const limitReached = media.length + processing.length >= MAX_ITEMS;

  async function storageProblem(extra: number): Promise<Notice | null> {
    if (queuedMediaBytes() + totalBytes + extra > MAX_QUEUED_MEDIA_BYTES) return { key: "common.error.storageFull", tone: "danger" };
    try {
      const estimate = await navigator.storage?.estimate?.();
      if (estimate?.quota !== undefined && estimate.usage !== undefined) {
        const free = estimate.quota - estimate.usage;
        if (free < 50 * 1000 * 1000) return { key: "common.error.storageFull", tone: "danger" };
        if (free < 200 * 1000 * 1000) return { key: "o10.spaceLow", tone: "wait" };
      }
    } catch {
      // Unknown: carry on.
    }
    return null;
  }

  async function add(file: File, source: CaptureSource, knownDuration?: number) {
    const target = replaceTarget.current;
    replaceTarget.current = null;
    const kind: MediaKind | null = source === "photo" ? "photo" : source === "video" ? "video" : kindOf(file.type);
    if (!kind) {
      setNotices([{ key: "o10.wrongType", tone: "attn" }]);
      return;
    }
    if (!target && media.length + processing.length >= MAX_ITEMS) {
      setNotices([{ key: "o10.limitItems", vars: { max: MAX_ITEMS }, tone: "attn" }]);
      return;
    }
    const space = await storageProblem(file.size);
    if (space?.tone === "danger") {
      setNotices([space]);
      return;
    }
    const id = target ?? `m-${uuidv4().slice(0, 18)}`;
    setNotices(space ? [space] : []);
    setProcessing((list) => [...list, { id, kind }]);
    try {
      let prepared: Prepared & { blurredOnPhone?: boolean };
      if (kind === "photo") prepared = await preparePhoto(file);
      else if (kind === "video") prepared = await prepareVideo(file);
      else prepared = await prepareAudio(file, knownDuration);
      const others = media.filter((item) => item.client_media_id !== id);
      if (others.reduce((sum, item) => sum + item.size_bytes, 0) + prepared.size_bytes > MAX_REPORT_BYTES) {
        setNotices([{ key: "o10.limitItems", vars: { max: MAX_ITEMS }, tone: "attn" }]);
        return;
      }
      const blobKey = `${draft?.id ?? "draft"}:${id}:${prepared.sha256.slice(0, 12)}`;
      await putBlob(blobKey, prepared.blob);
      const previous = media.find((item) => item.client_media_id === id);
      const number = previous ? media.indexOf(previous) + 1 : media.length + 1;
      const entry: DraftMedia = {
        client_media_id: id,
        kind,
        content_type: prepared.content_type,
        size_bytes: prepared.size_bytes,
        sha256: prepared.sha256,
        duration_ms: prepared.duration_ms,
        blur_faces: previous?.blur_faces ?? false,
        blob_key: blobKey,
        name: t("o10.itemName", { kind, n: number }),
      };
      handle.update((current) => ({
        media: previous ? current.media.map((item) => (item.client_media_id === id ? entry : item)) : [...current.media, entry],
      }));
      if (previous) {
        await del("blobs", previous.blob_key).catch(() => undefined);
        if (previous.plain_blob_key) await del("blobs", previous.plain_blob_key).catch(() => undefined);
      }
    } catch (error) {
      const code = error instanceof MediaError ? error.code : "unreadable";
      const notice: Notice =
        code === "too_big"
          ? { key: "o10.tooBig", vars: { max: MAX_LABEL[kind] }, tone: "attn" }
          : code === "wrong_type"
            ? { key: "o10.wrongType", tone: "attn" }
            : code === "too_long"
              ? { key: kind === "video" ? "o10.videoTooLong" : "o10.voiceTooLong", tone: "attn" }
              : { key: "o10.unreadable", tone: "attn" };
      setNotices([notice]);
    } finally {
      setProcessing((list) => list.filter((item) => item.id !== id));
    }
  }

  /** Blur faces: the phone blurs faces it can detect; the server always blurs as well (decision Q4). */
  async function setBlur(id: string, value: boolean) {
    const item = media.find((m) => m.client_media_id === id);
    if (!item) return;
    if (item.kind === "photo" && canBlurOnPhone()) {
      if (value) {
        const plain = await getBlob(item.blob_key);
        if (plain) {
          const blurred = await preparePhoto(plain, { blurFaces: true }).catch(() => null);
          if (blurred?.blurredOnPhone) {
            const key = `${item.blob_key}:blur`;
            await putBlob(key, blurred.blob);
            handle.update((current) => ({
              media: current.media.map((m) =>
                m.client_media_id === id
                  ? { ...m, blur_faces: true, blurred_on_phone: true, plain_blob_key: item.blob_key, blob_key: key, sha256: blurred.sha256, size_bytes: blurred.size_bytes }
                  : m,
              ),
            }));
            return;
          }
        }
      } else if (item.plain_blob_key) {
        const plain = await getBlob(item.plain_blob_key);
        if (plain) {
          const { sha256Hex } = await import("../../../../../ui/MediaCapture/process");
          const sha256 = await sha256Hex(plain);
          await del("blobs", item.blob_key).catch(() => undefined);
          handle.update((current) => ({
            media: current.media.map((m) =>
              m.client_media_id === id
                ? { ...m, blur_faces: false, blurred_on_phone: false, blob_key: item.plain_blob_key!, plain_blob_key: undefined, sha256, size_bytes: plain.size }
                : m,
            ),
          }));
          return;
        }
      }
    }
    handle.update((current) => ({ media: current.media.map((m) => (m.client_media_id === id ? { ...m, blur_faces: value } : m)) }));
  }

  async function remove(id: string) {
    const item = media.find((m) => m.client_media_id === id);
    handle.update((current) => ({ media: current.media.filter((m) => m.client_media_id !== id) }));
    if (item) {
      await del("blobs", item.blob_key).catch(() => undefined);
      if (item.plain_blob_key) await del("blobs", item.plain_blob_key).catch(() => undefined);
    }
    setNotices([]);
  }

  function retake(id: string) {
    const item = media.find((m) => m.client_media_id === id);
    if (!item) return;
    replaceTarget.current = id;
    if (item.kind === "audio") {
      void recorder.start();
      return;
    }
    setRetakeAccept(item.kind === "photo" ? "image/*" : "video/*");
    window.requestAnimationFrame(() => retakeInput.current?.click());
  }

  const items: EvidenceItem[] = [
    ...media.map((item) => ({
      id: item.client_media_id,
      kind: item.kind,
      name: item.name,
      sizeBytes: item.size_bytes,
      previewUrl: previews[item.client_media_id] ?? null,
      blur: item.blur_faces,
      processing: processing.some((p) => p.id === item.client_media_id),
    })),
    ...processing
      .filter((p) => !media.some((m) => m.client_media_id === p.id))
      .map((p, index) => ({
        id: p.id,
        kind: p.kind,
        name: t("o10.itemName", { kind: p.kind, n: media.length + index + 1 }),
        sizeBytes: 0,
        previewUrl: null,
        blur: false,
        processing: true,
      })),
  ];

  return (
    <>
      <EvidenceView
        {...shell}
        onBack={() => {
          // R3: a capture in progress closes first, and is discarded.
          if (recorder.elapsedMs !== null) {
            replaceTarget.current = null;
            recorder.cancel();
            return;
          }
          nav.back();
        }}
        items={items}
        recorder={recorder}
        onPick={(file, source) => void add(file, source)}
        onBlur={(id, value) => void setBlur(id, value)}
        onRetake={retake}
        onRemove={(id) => void remove(id)}
        notices={limitReached && !notices.length ? [{ key: "o10.limitItems", vars: { max: MAX_ITEMS }, tone: "attn" }] : notices}
        limitReached={limitReached}
        estimate={(bytes) => (offline ? null : estimateSeconds(bytes))}
        onContinue={() => {
          if (processing.length || recorder.elapsedMs !== null) return;
          nav.done();
        }}
      />
      <input
        ref={retakeInput}
        type="file"
        accept={retakeAccept}
        capture="environment"
        hidden
        onChange={(event) => {
          const file = event.target.files?.[0];
          event.target.value = "";
          if (file) void add(file, retakeAccept.startsWith("image") ? "photo" : "video");
          else replaceTarget.current = null;
        }}
      />
    </>
  );
}
