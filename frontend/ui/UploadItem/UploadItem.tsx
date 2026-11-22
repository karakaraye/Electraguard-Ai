"use client";

import type { ReactNode } from "react";
import { useLocale, useT } from "../../lib/i18n/client";
import { Button } from "../Button/Button";
import { formatBytes } from "../format";
import { CameraIcon, FileIcon, MicIcon, RetryIcon, TrashIcon, VideoIcon } from "../icons";
import { StatusShape, type StatusTone } from "../StatusBadge/StatusBadge";
import styles from "./UploadItem.module.css";

export type UploadKind = "photo" | "video" | "voice" | "file";
export type UploadState = "waiting" | "uploading" | "saved" | "failed" | "missing";

export type UploadItemProps = {
  kind: UploadKind;
  /** File name or a short description. */
  name: string;
  sizeBytes: number;
  state: UploadState;
  /** Bytes confirmed by the server / total, 0 to 1. Only for "uploading". */
  progress?: number;
  /** Estimated seconds to send on the current network. */
  estimateSeconds?: number;
  onRetry?: () => void;
  onRemove?: () => void;
  onChooseAgain?: () => void;
  "data-testid"?: string;
};

const kindIcon = { photo: CameraIcon, video: VideoIcon, voice: MicIcon, file: FileIcon } as const;

const stateTone: Record<UploadState, StatusTone> = {
  waiting: "wait",
  uploading: "info",
  saved: "ok",
  failed: "danger",
  missing: "attn",
};

/**
 * One attachment and its sending state. Visual only: the outbox owns the
 * upload and passes real byte progress in.
 */
export function UploadItem({
  kind,
  name,
  sizeBytes,
  state,
  progress = 0,
  estimateSeconds,
  onRetry,
  onRemove,
  onChooseAgain,
  "data-testid": testId = "upload-item",
}: UploadItemProps) {
  const t = useT();
  const { locale } = useLocale();
  const Icon = kindIcon[kind];
  const percent = Math.round(Math.min(1, Math.max(0, progress)) * 100);
  const size = formatBytes(sizeBytes, locale);
  const time =
    estimateSeconds === undefined
      ? null
      : estimateSeconds < 60
        ? t("ui.time.seconds", { count: Math.max(1, Math.round(estimateSeconds)) })
        : t("ui.time.minutes", { count: Math.round(estimateSeconds / 60) });

  const statusText =
    state === "uploading"
      ? t("ui.upload.uploading", { percent })
      : state === "waiting"
        ? t("ui.upload.waiting")
        : state === "saved"
          ? t("ui.upload.saved")
          : state === "failed"
            ? t("ui.upload.failed")
            : t("ui.upload.missing");

  return (
    <li className={styles.item} data-state={state} data-testid={testId}>
      <span className={styles.icon}>
        <Icon />
      </span>
      <div className={styles.main}>
        <p className={styles.name}>
          <span className="eg-sr-only">{t("ui.upload.kind", { kind })}: </span>
          {name}
        </p>
        <p className={`${styles.meta} eg-tnum`}>
          {time && state !== "saved" ? t("ui.upload.estimate", { size, time }) : size}
        </p>
        <p className={styles.status} data-tone={stateTone[state]} aria-live={state === "uploading" ? "off" : "polite"}>
          <StatusShape tone={stateTone[state]} />
          <span className="eg-tnum">{statusText}</span>
        </p>
        {state === "uploading" ? (
          <div
            className={styles.track}
            role="progressbar"
            aria-valuemin={0}
            aria-valuemax={100}
            aria-valuenow={percent}
            aria-label={name}
          >
            <div className={styles.fill} style={{ transform: `scaleX(${percent / 100})` }} />
          </div>
        ) : null}
        {(state === "failed" && onRetry) || (state === "missing" && onChooseAgain) || (onRemove && state !== "uploading") ? (
          <div className={styles.actions}>
            {state === "failed" && onRetry ? (
              <Button variant="secondary" icon={<RetryIcon />} onClick={onRetry} data-testid={`${testId}-retry`}>
                {t("ui.upload.retry")}
              </Button>
            ) : null}
            {state === "missing" && onChooseAgain ? (
              <Button variant="secondary" icon={<FileIcon />} onClick={onChooseAgain} data-testid={`${testId}-choose`}>
                {t("ui.upload.chooseAgain")}
              </Button>
            ) : null}
            {onRemove ? (
              <Button variant="quiet" icon={<TrashIcon />} onClick={onRemove} data-testid={`${testId}-remove`}>
                {t("ui.upload.remove")}
              </Button>
            ) : null}
          </div>
        ) : null}
      </div>
    </li>
  );
}

/** List wrapper for UploadItems. */
export function UploadList({ children, label }: { children: ReactNode; label?: string }) {
  return (
    <ul className={styles.list} aria-label={label}>
      {children}
    </ul>
  );
}
