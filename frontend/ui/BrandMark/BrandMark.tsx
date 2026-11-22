"use client";

import { useT } from "../../lib/i18n/client";
import styles from "./BrandMark.module.css";
import {
  CREDIT_RATIO,
  CREDIT_TEXT,
  CREDIT_VIEWBOX,
  CREDIT_WORDMARK_PATH,
  LOCKUP_RATIO,
  LOCKUP_SYMBOL_PATH,
  LOCKUP_VIEWBOX,
  LOCKUP_WORDMARK_PATH,
  SYMBOL_PATH,
  SYMBOL_VIEWBOX,
} from "./paths";

export type BrandMarkProps = {
  /** "lockup" is the symbol plus the wordmark; "symbol" is the monogram alone. */
  variant?: "lockup" | "symbol";
  /**
   * "bar" is the app bar size (24 px symbol), "md" is 32 px, "lg" is 48 px.
   * Below 24 px use the favicon drawing, never a smaller symbol.
   */
  size?: "bar" | "md" | "lg";
  /**
   * Shows the credit line "by Cairn" (message key ui.byCairn) under the wordmark. Lockup only.
   * The credit lockup is never drawn below 32 px (the "md" size), so "bar" is raised to "md".
   */
  credit?: boolean;
  className?: string;
};

const HEIGHT = { bar: 24, md: 32, lg: 48 } as const;

/**
 * The ElectraGuard AI mark, inline so it follows the surrounding text colour
 * (pure black on light, pure white on dark) and needs no extra request.
 * The accessible name is "ElectraGuard AI". The credit line is plain text and
 * carries no Cairn symbol (docs/design/brand/README.md).
 */
export function BrandMark({ variant = "lockup", size = "bar", credit = false, className }: BrandMarkProps) {
  const t = useT();
  const cls = className ? `${styles.mark} ${className}` : styles.mark;
  const h = credit && variant === "lockup" ? Math.max(HEIGHT[size], HEIGHT.md) : HEIGHT[size];

  if (variant === "symbol") {
    return (
      <svg className={cls} viewBox={SYMBOL_VIEWBOX} width={h} height={h} role="img" aria-label="ElectraGuard AI">
        <path fill="currentColor" d={SYMBOL_PATH} />
      </svg>
    );
  }

  if (credit) {
    const ch = (h * 39.34) / 36;
    return (
      <svg
        className={cls}
        viewBox={CREDIT_VIEWBOX}
        width={ch * CREDIT_RATIO}
        height={ch}
        role="img"
        aria-label="ElectraGuard AI"
      >
        <path fill="currentColor" d={LOCKUP_SYMBOL_PATH} />
        <path fill="currentColor" d={CREDIT_WORDMARK_PATH} />
        <text
          className={styles.credit}
          x={CREDIT_TEXT.x}
          y={CREDIT_TEXT.y}
          fontSize={CREDIT_TEXT.size}
          fill="currentColor"
        >
          {t("ui.byCairn")}
        </text>
      </svg>
    );
  }

  return (
    <svg
      className={cls}
      viewBox={LOCKUP_VIEWBOX}
      width={h * LOCKUP_RATIO}
      height={h}
      role="img"
      aria-label="ElectraGuard AI"
    >
      <path fill="currentColor" d={LOCKUP_SYMBOL_PATH} />
      <path fill="currentColor" d={LOCKUP_WORDMARK_PATH} />
    </svg>
  );
}
