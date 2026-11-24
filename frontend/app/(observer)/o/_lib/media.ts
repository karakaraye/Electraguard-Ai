"use client";

import { uuidv4 } from "../../../../lib/api/client";
import { kindOf, MediaError, prepareAudio, preparePhoto, prepareVideo, type Prepared } from "../../../../ui/MediaCapture/process";
import { uploadPhoto, type UploadResult } from "./upload";

/** Message key for a file the phone or the server refused (O-10 / O-12 wording). */
export function refusalKey(code: string): string {
  switch (code) {
    case "too_big":
    case "payload_too_large":
      return "o14.media.tooBig";
    case "wrong_type":
    case "unsupported_media_type":
      return "o10.wrongType";
    case "too_long":
      return "o14.media.tooLong";
    case "media_limit_reached":
      return "o14.media.limit";
    case "report_closed":
      return "o12.upload.closed";
    case "invalid_transition":
      return "o12.upload.cannotRemove";
    default:
      return "o14.media.failed";
  }
}

/** Strip location data and size the file on the phone, then send it in one go (online only). */
export async function prepareAndUpload(reportId: string, file: File, purpose: "evidence" | "message"): Promise<UploadResult | { kind: "phone_refused"; code: string }> {
  const kind = kindOf(file.type);
  if (!kind || (purpose === "message" && kind === "video")) return { kind: "phone_refused", code: "wrong_type" };
  let prepared: Prepared;
  try {
    prepared = kind === "photo" ? await preparePhoto(file) : kind === "video" ? await prepareVideo(file) : await prepareAudio(file);
  } catch (error) {
    return { kind: "phone_refused", code: error instanceof MediaError ? error.code : "unreadable" };
  }
  return uploadPhoto({
    reportId,
    blob: prepared.blob,
    content_type: prepared.content_type,
    size_bytes: prepared.size_bytes,
    sha256: prepared.sha256,
    duration_ms: prepared.duration_ms,
    kind,
    purpose,
    upload_key: uuidv4(),
    complete_key: uuidv4(),
  });
}
