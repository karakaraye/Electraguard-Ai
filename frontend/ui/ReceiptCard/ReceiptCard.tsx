"use client";

import { Fragment, useEffect, useRef, useState, type CSSProperties, type ReactNode } from "react";
import { useLocale, useT } from "../../lib/i18n/client";
import { Button } from "../Button/Button";
import { formatWatDateTime } from "../format";
import { CheckIcon, CopyIcon, DownloadIcon } from "../icons";
import { animate } from "../motion";
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
  ctx.fillStyle = "#faf8f3";
  ctx.fillRect(0, 0, width, height);
  ctx.strokeStyle = "#0e0d0b";
  ctx.lineWidth = 2;
  ctx.strokeRect(16, 16, width - 32, height - 32);
  ctx.fillStyle = "#45413a";
  ctx.font = `600 16px ${font}`;
  ctx.fillText(title, 40, 62);
  ctx.font = `600 18px ${font}`;
  ctx.fillText(label, 40, 120);
  ctx.fillStyle = "#0e0d0b";
  ctx.font = `800 44px ${font}`;
  ctx.fillText(code, 40, 176);
  ctx.fillStyle = "#45413a";
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

/** "EG-4H7Q-92KD" read out as "E G, 4 H 7 Q, 9 2 K D". */
function spellOut(code: string) {
  return code
    .split("-")
    .map((part) => part.split("").join(" "))
    .join(", ");
}

/**
 * The receipt ticket: eyebrow, code in display type, time, a dashed tear line with
 * two side notches, then Copy and Save. Render it only after the server has
 * confirmed the report.
 */
export function ReceiptCard({ code, receivedAt, next, animate: rise = true, "data-testid": testId = "receipt-card" }: ReceiptCardProps) {
  const t = useT();
  const { locale } = useLocale();
  const [copy, setCopy] = useState<CopyState>("idle");
  const [swapped, setSwapped] = useState(false);
  const resetTimer = useRef<number | undefined>(undefined);
  const ticketRef = useRef<HTMLDivElement>(null);
  const received = t("ui.receipt.receivedAt", { time: formatWatDateTime(receivedAt, locale) });

  // The ticket settles in once: 8 px up and a fade (240 ms). The code's characters follow it.
  useEffect(() => {
    if (!rise) return;
    const anim = animate(
      ticketRef.current,
      [
        { opacity: 0, transform: "translateY(8px)" },
        { opacity: 1, transform: "translateY(0)" },
      ],
      { duration: 240, easing: "out" },
    );
    return () => anim?.cancel();
  }, [rise]);

  useEffect(() => () => window.clearTimeout(resetTimer.current), []);

  const segments = code.split("-");
  let charIndex = 0;

  return (
    <section className={styles.card} data-testid={testId} aria-labelledby={`${testId}-label`}>
      <div ref={ticketRef} className={styles.ticket}>
        <div className={styles.top}>
          <p className={styles.eyebrow} id={`${testId}-label`}>
            {t("ui.receipt.label")}
          </p>
          <p className={`${styles.code} eg-tnum`} data-testid={`${testId}-code`} aria-hidden="true" data-rise={rise || undefined}>
            {segments.map((segment, index) => (
              <Fragment key={index}>
                {index > 0 ? (
                  <>
                    -<wbr />
                  </>
                ) : null}
                <span className={styles.segment}>
                  {segment.split("").map((char, at) => (
                    <span key={at} className={styles.char} style={{ "--i": charIndex++ } as CSSProperties}>
                      {char}
                    </span>
                  ))}
                </span>
              </Fragment>
            ))}
          </p>
          <p className="eg-sr-only">{spellOut(code)}</p>
          <p className={`${styles.received} eg-tnum`}>{received}</p>
        </div>

        <div className={styles.tear} aria-hidden="true" />

        <div className={styles.actions}>
          <Button
            variant="secondary"
            icon={<span key={copy} className={swapped ? styles.swap : undefined}>{copy === "copied" ? <CheckIcon /> : <CopyIcon />}</span>}
            onClick={async () => {
              const ok = await copyText(code);
              setSwapped(true);
              setCopy(ok ? "copied" : "failed");
              window.clearTimeout(resetTimer.current);
              resetTimer.current = window.setTimeout(() => setCopy("idle"), 2000);
            }}
            data-testid={`${testId}-copy`}
          >
            <span key={copy} className={swapped ? styles.swap : undefined}>
              {copy === "copied" ? t("ui.receipt.copied") : t("ui.receipt.copy")}
            </span>
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
