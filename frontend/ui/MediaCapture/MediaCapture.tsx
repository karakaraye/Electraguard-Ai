"use client";

import { useCallback, useEffect, useRef, useState, type ComponentType } from "react";
import { useT } from "../../lib/i18n/client";
import { Button } from "../Button/Button";
import { CameraIcon, FileIcon, MicIcon, StopIcon, VideoIcon, type IconProps } from "../icons";
import { LIMITS } from "./process";
import styles from "./MediaCapture.module.css";

export type CaptureSource = "photo" | "video" | "file";

export type VoiceRecorder = {
  /** Milliseconds recorded so far, or null when not recording. */
  elapsedMs: number | null;
  start: () => Promise<void>;
  /** Stop and keep the recording (passed to onDone). */
  stop: () => void;
  /** Stop and throw the recording away (Back during a capture, R3). */
  cancel: () => void;
};

function pickMime(): string | undefined {
  if (typeof MediaRecorder === "undefined") return undefined;
  for (const type of ["audio/webm;codecs=opus", "audio/ogg;codecs=opus", "audio/mp4", "audio/webm"]) {
    if (MediaRecorder.isTypeSupported(type)) return type;
  }
  return undefined;
}

/**
 * In-app voice recorder (MediaRecorder). Stops by itself at 2:00 (MED audio limit).
 * `onDone(blob, durationMs)` receives the recording; `onDenied` the permission error.
 */
export function useVoiceRecorder(onDone: (blob: Blob, durationMs: number) => void, onDenied: () => void): VoiceRecorder {
  const [elapsedMs, setElapsedMs] = useState<number | null>(null);
  const recorder = useRef<MediaRecorder | null>(null);
  const stream = useRef<MediaStream | null>(null);
  const chunks = useRef<Blob[]>([]);
  const startedAt = useRef(0);
  const ticker = useRef<number | undefined>(undefined);
  const keep = useRef(true);
  const handlers = useRef({ onDone, onDenied });

  useEffect(() => {
    handlers.current = { onDone, onDenied };
  });

  const finish = useCallback(() => {
    window.clearInterval(ticker.current);
    stream.current?.getTracks().forEach((track) => track.stop());
    stream.current = null;
    setElapsedMs(null);
  }, []);

  const stop = useCallback(() => {
    keep.current = true;
    if (recorder.current?.state === "recording") recorder.current.stop();
  }, []);

  const cancel = useCallback(() => {
    keep.current = false;
    if (recorder.current?.state === "recording") recorder.current.stop();
    else finish();
  }, [finish]);

  const start = useCallback(async () => {
    if (!navigator.mediaDevices?.getUserMedia || typeof MediaRecorder === "undefined") {
      handlers.current.onDenied();
      return;
    }
    try {
      stream.current = await navigator.mediaDevices.getUserMedia({ audio: true });
    } catch {
      handlers.current.onDenied();
      return;
    }
    const mimeType = pickMime();
    const rec = new MediaRecorder(stream.current, mimeType ? { mimeType, audioBitsPerSecond: 32_000 } : undefined);
    chunks.current = [];
    keep.current = true;
    rec.ondataavailable = (event) => {
      if (event.data.size) chunks.current.push(event.data);
    };
    rec.onstop = () => {
      const duration = Math.min(Date.now() - startedAt.current, LIMITS.audio.maxMs);
      const type = (rec.mimeType || mimeType || "audio/webm").split(";")[0];
      const blob = new Blob(chunks.current, { type });
      finish();
      if (keep.current && blob.size) handlers.current.onDone(blob, duration);
    };
    recorder.current = rec;
    startedAt.current = Date.now();
    rec.start(1000);
    setElapsedMs(0);
    ticker.current = window.setInterval(() => {
      const elapsed = Date.now() - startedAt.current;
      setElapsedMs(elapsed);
      if (elapsed >= LIMITS.audio.maxMs) stop();
    }, 250);
  }, [finish, stop]);

  useEffect(() => () => cancel(), [cancel]);

  return { elapsedMs, start, stop, cancel };
}

export function formatClock(ms: number): string {
  const total = Math.floor(ms / 1000);
  return `${Math.floor(total / 60)}:${String(total % 60).padStart(2, "0")}`;
}

export type MediaCaptureProps = {
  /** Called with a file from the camera, the video recorder or the file chooser. */
  onPick: (file: File, source: CaptureSource) => void;
  recorder: Pick<VoiceRecorder, "elapsedMs" | "start" | "stop">;
  /** Adding is blocked (limit reached). */
  disabled?: boolean;
  "data-testid"?: string;
};

type Action = {
  key: "photo" | "video" | "voice" | "file";
  label: string;
  sub?: string;
  Icon: ComponentType<IconProps>;
};

/**
 * Take photo / Record video (60 s) / Record voice (2 min) / Choose file.
 * Photo and video use the phone's own camera through a file input (the most
 * reliable path on low-end Android); voice uses the in-app recorder.
 */
export function MediaCapture({ onPick, recorder, disabled, "data-testid": testId = "media-capture" }: MediaCaptureProps) {
  const t = useT();
  const photoInput = useRef<HTMLInputElement>(null);
  const videoInput = useRef<HTMLInputElement>(null);
  const fileInput = useRef<HTMLInputElement>(null);
  const stopRef = useRef<HTMLButtonElement>(null);
  const recording = recorder.elapsedMs !== null;

  useEffect(() => {
    if (recording) stopRef.current?.focus();
  }, [recording]);

  const actions: Action[] = [
    { key: "photo", label: t("o10.photo"), Icon: CameraIcon },
    { key: "video", label: t("o10.video"), sub: t("o10.videoLimit"), Icon: VideoIcon },
    { key: "voice", label: t("o10.voice"), sub: t("o10.voiceLimit"), Icon: MicIcon },
    { key: "file", label: t("o10.file"), Icon: FileIcon },
  ];

  function take(input: HTMLInputElement | null, source: CaptureSource) {
    const file = input?.files?.[0];
    if (input) input.value = "";
    if (file) onPick(file, source);
  }

  if (recording) {
    return (
      <div className={styles.recording} data-testid={`${testId}-recording`}>
        <p className={`${styles.clock} eg-tnum`}>
          <span className={styles.dot} aria-hidden="true" />
          {t("o10.recording", { time: formatClock(recorder.elapsedMs ?? 0) })}
          <span className={styles.max}> / {formatClock(LIMITS.audio.maxMs)}</span>
        </p>
        <Button ref={stopRef} block icon={<StopIcon />} onClick={recorder.stop} data-testid={`${testId}-stop`}>
          {t("o10.stopRecording")}
        </Button>
      </div>
    );
  }

  return (
    <div className={styles.capture} data-testid={testId}>
      <div className={styles.grid}>
        {actions.map(({ key, label, sub, Icon }) => (
          <button
            key={key}
            type="button"
            className={styles.action}
            aria-disabled={disabled || undefined}
            onClick={() => {
              if (disabled) return;
              if (key === "photo") photoInput.current?.click();
              else if (key === "video") videoInput.current?.click();
              else if (key === "file") fileInput.current?.click();
              else void recorder.start();
            }}
            data-testid={`${testId}-${key}`}
          >
            <span className={styles.actionDisc} aria-hidden="true">
              <Icon size={26} />
            </span>
            <span className={styles.actionLabel}>{label}</span>
            {sub ? <span className={styles.actionSub}>{sub}</span> : null}
          </button>
        ))}
      </div>
      <input ref={photoInput} type="file" accept="image/*" capture="environment" hidden onChange={() => take(photoInput.current, "photo")} data-testid={`${testId}-photo-input`} />
      <input ref={videoInput} type="file" accept="video/*" capture="environment" hidden onChange={() => take(videoInput.current, "video")} data-testid={`${testId}-video-input`} />
      <input ref={fileInput} type="file" accept="image/*,video/*,audio/*" hidden onChange={() => take(fileInput.current, "file")} data-testid={`${testId}-file-input`} />
    </div>
  );
}
