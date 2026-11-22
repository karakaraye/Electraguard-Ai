"use client";

import type { ReactNode } from "react";
import { useT } from "../../lib/i18n/client";
import { CloseIcon } from "../icons";
import { StatusShape, type StatusTone } from "../StatusBadge/StatusBadge";
import styles from "./Banner.module.css";

export type BannerProps = {
  tone: StatusTone;
  title: string;
  children?: ReactNode;
  /** One action (a Button or link). */
  action?: ReactNode;
  /**
   * Critical banners (offline with a queue, intake paused, danger) are never
   * dismissible and are announced at once. Others are announced politely.
   */
  critical?: boolean;
  /** Shows a Close button. Ignored for critical banners. */
  onDismiss?: () => void;
  "data-testid"?: string;
};

/** Page-level message: offline, intake paused, a question waiting. Never auto-dismissed. */
export function Banner({ tone, title, children, action, critical, onDismiss, "data-testid": testId = "banner" }: BannerProps) {
  const t = useT();
  return (
    <section
      className={styles.banner}
      data-tone={tone}
      role={critical ? "alert" : "status"}
      aria-live={critical ? "assertive" : "polite"}
      data-testid={testId}
    >
      <span className={styles.shape}>
        <StatusShape tone={tone} size={18} />
      </span>
      <div className={styles.body}>
        <p className={styles.title}>{title}</p>
        {children ? <div className={styles.text}>{children}</div> : null}
        {action ? <div className={styles.action}>{action}</div> : null}
      </div>
      {onDismiss && !critical ? (
        <button type="button" className={styles.dismiss} onClick={onDismiss}>
          <CloseIcon size={20} />
          <span className="eg-sr-only">{t("ui.close")}</span>
        </button>
      ) : null}
    </section>
  );
}
