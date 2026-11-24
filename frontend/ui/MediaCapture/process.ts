/**
 * Media preparation on the phone, before anything is stored or sent (O-10, R8):
 * - Photos are decoded and re-encoded to JPEG, which drops every metadata block
 *   (EXIF, GPS, XMP); resized to at most 16 megapixels and 2 MiB.
 * - MP4 / QuickTime-family video: metadata boxes (udta, meta, uuid XMP) are
 *   overwritten in place with "free" boxes of the same size, so the location
 *   tag is gone and every sample offset stays valid.
 * - Durations are read from the file; SHA-256 is computed over the exact bytes
 *   that will be uploaded.
 * The server strips and re-encodes everything again (MED limits).
 */

import type { MediaKind } from "../../lib/api/types";

export const LIMITS = {
  photo: { maxBytes: 2 * 1024 * 1024, maxPixels: 16_000_000 },
  video: { maxBytes: 25 * 1024 * 1024, maxMs: 60_000 },
  audio: { maxBytes: 4 * 1024 * 1024, maxMs: 120_000 },
} as const;

export const ACCEPTED: Record<MediaKind, string[]> = {
  photo: ["image/jpeg", "image/png", "image/webp"],
  video: ["video/mp4", "video/webm"],
  audio: ["audio/webm", "audio/ogg", "audio/mp4", "audio/x-m4a", "audio/mpeg", "audio/aac"],
};

export type Prepared = {
  kind: MediaKind;
  blob: Blob;
  content_type: string;
  size_bytes: number;
  sha256: string;
  duration_ms: number | null;
};

export class MediaError extends Error {
  constructor(
    public code: "too_big" | "wrong_type" | "too_long" | "unreadable",
    public kind: MediaKind,
  ) {
    super(code);
  }
}

export function kindOf(type: string): MediaKind | null {
  const base = type.split(";")[0].trim().toLowerCase();
  if (base.startsWith("image/")) return "photo";
  if (base.startsWith("video/")) return "video";
  if (base.startsWith("audio/")) return "audio";
  return null;
}

export async function sha256Hex(blob: Blob): Promise<string> {
  const digest = await crypto.subtle.digest("SHA-256", await blob.arrayBuffer());
  return Array.from(new Uint8Array(digest), (byte) => byte.toString(16).padStart(2, "0")).join("");
}

/* ---------- Photo ---------- */

type FaceBox = { x: number; y: number; width: number; height: number };
type FaceDetectorCtor = new (options?: { fastMode?: boolean; maxDetectedFaces?: number }) => {
  detect: (image: ImageBitmapSource) => Promise<Array<{ boundingBox: DOMRectReadOnly }>>;
};

/** True when this phone can find faces itself (Shape Detection API). */
export function canBlurOnPhone(): boolean {
  return typeof window !== "undefined" && "FaceDetector" in window;
}

async function detectFaces(source: ImageBitmap): Promise<FaceBox[]> {
  const Ctor = (window as Window & { FaceDetector?: FaceDetectorCtor }).FaceDetector;
  if (!Ctor) return [];
  try {
    const found = await new Ctor({ fastMode: true, maxDetectedFaces: 20 }).detect(source);
    return found.map(({ boundingBox: b }) => ({ x: b.x, y: b.y, width: b.width, height: b.height }));
  } catch {
    return [];
  }
}

function toBlob(canvas: HTMLCanvasElement, quality: number): Promise<Blob | null> {
  return new Promise((resolve) => canvas.toBlob(resolve, "image/jpeg", quality));
}

/** Decode, optionally blur faces, re-encode as JPEG ≤ 2 MiB. Metadata never survives a canvas. */
export async function preparePhoto(file: Blob, options: { blurFaces?: boolean } = {}): Promise<Prepared & { blurredOnPhone: boolean }> {
  if (!ACCEPTED.photo.includes(file.type) && !/^image\/(heic|heif)$/.test(file.type) && file.type !== "") {
    if (!file.type.startsWith("image/")) throw new MediaError("wrong_type", "photo");
  }
  let bitmap: ImageBitmap;
  try {
    bitmap = await createImageBitmap(file, { imageOrientation: "from-image" });
  } catch {
    throw new MediaError(file.type.startsWith("image/") ? "unreadable" : "wrong_type", "photo");
  }
  // Start from at most 2048 px on the long side (well under 16 MP, a good 2G size).
  let scale = Math.min(1, 2048 / Math.max(bitmap.width, bitmap.height), Math.sqrt(LIMITS.photo.maxPixels / (bitmap.width * bitmap.height)));
  const faces = options.blurFaces ? await detectFaces(bitmap) : [];
  for (let attempt = 0; attempt < 6; attempt++) {
    const width = Math.max(1, Math.round(bitmap.width * scale));
    const height = Math.max(1, Math.round(bitmap.height * scale));
    const canvas = document.createElement("canvas");
    canvas.width = width;
    canvas.height = height;
    const ctx = canvas.getContext("2d");
    if (!ctx) throw new MediaError("unreadable", "photo");
    ctx.drawImage(bitmap, 0, 0, width, height);
    for (const face of faces) {
      const pad = 0.25;
      const x = Math.max(0, (face.x - face.width * pad) * scale);
      const y = Math.max(0, (face.y - face.height * pad) * scale);
      const w = Math.min(width - x, face.width * (1 + pad * 2) * scale);
      const h = Math.min(height - y, face.height * (1 + pad * 2) * scale);
      ctx.save();
      ctx.beginPath();
      ctx.rect(x, y, w, h);
      ctx.clip();
      ctx.filter = `blur(${Math.max(8, Math.round(w / 6))}px)`;
      ctx.drawImage(canvas, 0, 0);
      ctx.restore();
    }
    const quality = attempt < 3 ? 0.85 - attempt * 0.1 : 0.6;
    const blob = await toBlob(canvas, quality);
    if (blob && blob.size <= LIMITS.photo.maxBytes) {
      bitmap.close();
      return {
        kind: "photo",
        blob,
        content_type: "image/jpeg",
        size_bytes: blob.size,
        sha256: await sha256Hex(blob),
        duration_ms: null,
        blurredOnPhone: faces.length > 0,
      };
    }
    if (attempt >= 2) scale *= 0.8;
  }
  bitmap.close();
  throw new MediaError("too_big", "photo");
}

/* ---------- Duration ---------- */

export function readDuration(blob: Blob, kind: "video" | "audio"): Promise<number | null> {
  return new Promise((resolve) => {
    const element = document.createElement(kind === "video" ? "video" : "audio");
    const url = URL.createObjectURL(blob);
    const finish = (value: number | null) => {
      URL.revokeObjectURL(url);
      element.removeAttribute("src");
      resolve(value);
    };
    element.preload = "metadata";
    element.muted = true;
    element.onloadedmetadata = () => {
      if (Number.isFinite(element.duration)) {
        finish(Math.round(element.duration * 1000));
        return;
      }
      // MediaRecorder WebM files report Infinity until seeked.
      element.ontimeupdate = () => {
        element.ontimeupdate = null;
        finish(Number.isFinite(element.duration) ? Math.round(element.duration * 1000) : null);
      };
      element.currentTime = 1e9;
    };
    element.onerror = () => finish(null);
    window.setTimeout(() => finish(null), 8_000);
    element.src = url;
  });
}

/* ---------- MP4 metadata removal ---------- */

const CONTAINERS = new Set(["moov", "trak", "mdia", "minf", "stbl", "edts", "dinf", "mvex", "moof", "traf"]);
const METADATA = new Set(["udta", "meta", "uuid", "XMP_"]);

function fourcc(view: DataView, offset: number): string {
  return String.fromCharCode(view.getUint8(offset), view.getUint8(offset + 1), view.getUint8(offset + 2), view.getUint8(offset + 3));
}

/** Overwrite metadata boxes with zeroed "free" boxes. Returns the count blanked. */
export function blankMp4Metadata(buffer: ArrayBuffer): number {
  const view = new DataView(buffer);
  const bytes = new Uint8Array(buffer);
  let blanked = 0;
  const walk = (start: number, end: number, depth: number) => {
    let offset = start;
    while (offset + 8 <= end) {
      let size = view.getUint32(offset);
      const type = fourcc(view, offset + 4);
      let header = 8;
      if (size === 1) {
        if (offset + 16 > end) return;
        const high = view.getUint32(offset + 8);
        const low = view.getUint32(offset + 12);
        size = high * 2 ** 32 + low;
        header = 16;
      } else if (size === 0) {
        size = end - offset;
      }
      if (size < header || offset + size > end) return;
      if (METADATA.has(type)) {
        bytes.fill(0, offset + header, offset + size);
        bytes.set([0x66, 0x72, 0x65, 0x65], offset + 4); // "free"
        blanked += 1;
      } else if (CONTAINERS.has(type) && depth < 8) {
        walk(offset + header, offset + size, depth + 1);
      }
      offset += size;
    }
  };
  walk(0, buffer.byteLength, 0);
  return blanked;
}

export async function prepareVideo(file: Blob): Promise<Prepared> {
  const type = (file.type || "").split(";")[0];
  if (!ACCEPTED.video.includes(type)) throw new MediaError("wrong_type", "video");
  if (file.size > LIMITS.video.maxBytes) throw new MediaError("too_big", "video");
  const duration = await readDuration(file, "video");
  if (duration === null) throw new MediaError("unreadable", "video");
  // Decision Q5: a clip over 60 s is refused, not trimmed.
  if (duration > LIMITS.video.maxMs + 500) throw new MediaError("too_long", "video");
  let blob = file;
  if (type === "video/mp4") {
    const buffer = await file.arrayBuffer();
    blankMp4Metadata(buffer);
    blob = new Blob([buffer], { type });
  }
  return { kind: "video", blob, content_type: type, size_bytes: blob.size, sha256: await sha256Hex(blob), duration_ms: Math.min(duration, LIMITS.video.maxMs) };
}

export async function prepareAudio(file: Blob, knownDurationMs?: number): Promise<Prepared> {
  const type = (file.type || "").split(";")[0];
  if (!ACCEPTED.audio.includes(type)) throw new MediaError("wrong_type", "audio");
  if (file.size > LIMITS.audio.maxBytes) throw new MediaError("too_big", "audio");
  const duration = knownDurationMs ?? (await readDuration(file, "audio"));
  if (duration === null) throw new MediaError("unreadable", "audio");
  if (duration > LIMITS.audio.maxMs + 500) throw new MediaError("too_long", "audio");
  let blob = file;
  if (type === "audio/mp4" || type === "audio/x-m4a") {
    const buffer = await file.arrayBuffer();
    blankMp4Metadata(buffer);
    blob = new Blob([buffer], { type: "audio/mp4" });
  }
  return { kind: "audio", blob, content_type: type === "audio/x-m4a" ? "audio/mp4" : type, size_bytes: blob.size, sha256: await sha256Hex(blob), duration_ms: Math.min(duration, LIMITS.audio.maxMs) };
}

/** Rough seconds to send, from the network hint or a 2G assumption of 50 kbit/s. */
export function estimateSeconds(bytes: number): number {
  const connection = (navigator as Navigator & { connection?: { downlink?: number } }).connection;
  const mbps = connection?.downlink && connection.downlink > 0 ? connection.downlink : 0.05;
  return (bytes * 8) / (mbps * 1_000_000);
}
