"use client";

import { Fragment, useEffect, useRef, useState, type ReactNode } from "react";
import { useLocale, useT } from "../../lib/i18n/client";
import { Button } from "../Button/Button";
import { formatWatDateTime } from "../format";
import { CopyIcon, DownloadIcon } from "../icons";
import styles from "./ReceiptCard.module.css";

export type ReceiptCardProps = {
  /** Receipt code from the server, e.g. "EG-4H7Q-92KD". */
  code: string;
  /** Server-confirmed received time (ISO string or epoch ms). */
  receivedAt: string | number;
  /** "What happens next" lines. */
  next?: ReactNode[];
  /**
   * Draw the confirmation tick once on mount. Render this card only after the
   * server has confirmed the report: it must never appear before that.
   */
  animate?: boolean;
  "data-testid"?: string;
};

type CopyState = "idle" | "copied" | "failed";

async function copyText(text: string): Promise<boolean> {
  try {
    await navigator.clipboard.writeText(text);
    return true;
  } catch {
    const area = document.createElement("textarea");
    area.value = text;
    area.setAttribute("readonly", "");
    area.style.position = "fixed";
    area.style.opacity = "0";
    document.body.appendChild(area);
    area.select();
    let ok = false;
    try {
      ok = document.execCommand("copy");
    } catch {
      ok = false;
    }
    area.remove();
    return ok;
  }
}

async function saveImage({ code, title, label, received }: { code: string; title: string; label: string; received: string }) {
  const scale = 2;
  const width = 540;
  const height = 300;
  const canvas = document.createElement("canvas");
  canvas.width = width * scale;
  canvas.height = height * scale;
  const ctx = canvas.getContext("2d");
  if (!ctx) return;
  try {
    await document.fonts.load('700 40px "Noto Sans"');
  } catch {
    // The system font is fine for the image.
  }
  const font = '"Noto Sans", system-ui, sans-serif';
  ctx.scale(scale, scale);
  ctx.fillStyle = "#ffffff";
  ctx.fillRect(0, 0, width, height);
  ctx.strokeStyle = "#0b0b0c";
  ctx.lineWidth = 2;
  ctx.strokeRect(16, 16, width - 32, height - 32);
  ctx.fillStyle = "#3a3a3d";
  ctx.font = `600 16px ${font}`;
  ctx.fillText(title, 40, 62);
  ctx.font = `600 18px ${font}`;
  ctx.fillText(label, 40, 120);
  ctx.fillStyle = "#0b0b0c";
  ctx.font = `700 44px ${font}`;
  ctx.fillText(code, 40, 176);
  ctx.fillStyle = "#3a3a3d";
  ctx.font = `400 18px ${font}`;
  ctx.fillText(received, 40, 232);
  const blob = await new Promise<Blob | null>((resolve) => canvas.toBlob(resolve, "image/png"));
  if (!blob) return;
  const url = URL.createObjectURL(blob);
  const link = document.createElement("a");
  link.href = url;
  link.download = `receipt-${code}.png`;
  document.body.appendChild(link);
  link.click();
  link.remove();
  setTimeout(() => URL.revokeObjectURL(url), 10_000);
}

/** Receipt code in display size, with copy and save-as-image, received time and next steps. */
export function ReceiptCard({ code, receivedAt, next, animate = true, "data-testid": testId = "receipt-card" }: ReceiptCardProps) {
  const t = useT();
  const { locale } = useLocale();
  const [copy, setCopy] = useState<CopyState>("idle");
  const resetTimer = useRef<number | undefined>(undefined);
  const tickRef = useRef<SVGPathElement>(null);
  const received = t("ui.receipt.receivedAt", { time: formatWatDateTime(receivedAt, locale) });

  useEffect(() => {
    const tick = tickRef.current;
    if (!animate || !tick || typeof tick.animate !== "function") return;
    if (window.matchMedia("(prefers-reduced-motion: reduce)").matches) return;
    const length = tick.getTotalLength();
    tick.style.strokeDasharray = String(length);
    const animation = tick.animate(
      [{ strokeDashoffset: length }, { strokeDashoffset: 0 }],
      { duration: 320, easing: "cubic-bezier(0.23, 1, 0.32, 1)", fill: "backwards" },
    );
    return () => animation.cancel();
  }, [animate]);

  useEffect(() => () => window.clearTimeout(resetTimer.current), []);

  const segments = code.split("-");

  return (
    <section className={styles.card} data-testid={testId} aria-labelledby={`${testId}-label`}>
      <div className={styles.head}>
        <svg className={styles.tick} viewBox="0 0 32 32" width="32" height="32" aria-hidden="true">
          <circle cx="16" cy="16" r="15" fill="var(--ok)" />
          <path ref={tickRef} d="m9.5 16.5 4.5 4.5 8.5-9" fill="none" stroke="var(--paper)" strokeWidth="2.5" strokeLinecap="square" />
        </svg>
        <p className={styles.label} id={`${testId}-label`}>
          {t("ui.receipt.label")}
        </p>
      </div>

      <p className={`${styles.code} eg-tnum`} data-testid={`${testId}-code`}>
        {segments.map((segment, index) => (
          <Fragment key={index}>
            {index > 0 ? (
              <>
                -<wbr />
              </>
            ) : null}
            <span className={styles.segment}>{segment}</span>
          </Fragment>
        ))}
      </p>
      <p className={`${styles.received} eg-tnum`}>{received}</p>

      <div className={styles.actions}>
        <Button
          variant="secondary"
          icon={<CopyIcon />}
          onClick={async () => {
            const ok = await copyText(code);
            setCopy(ok ? "copied" : "failed");
            window.clearTimeout(resetTimer.current);
            resetTimer.current = window.setTimeout(() => setCopy("idle"), 4000);
          }}
          data-testid={`${testId}-copy`}
        >
          {copy === "copied" ? t("ui.receipt.copied") : t("ui.receipt.copy")}
        </Button>
        <Button
          variant="secondary"
          icon={<DownloadIcon />}
          onClick={() => saveImage({ code, title: t("ui.receipt.imageTitle"), label: t("ui.receipt.label"), received })}
          data-testid={`${testId}-save`}
        >
          {t("ui.receipt.save")}
        </Button>
      </div>
      <p className={styles.copyStatus} role="status" aria-live="polite">
        {copy === "copied" ? t("ui.receipt.copied") : copy === "failed" ? t("ui.receipt.copyFailed") : ""}
      </p>

      {next && next.length ? (
        <div className={styles.next}>
          <h2 className={styles.nextTitle}>{t("ui.receipt.next")}</h2>
          <ol className={styles.nextList}>
            {next.map((line, index) => (
              <li key={index}>{line}</li>
            ))}
          </ol>
        </div>
      ) : null}
    </section>
  );
}
