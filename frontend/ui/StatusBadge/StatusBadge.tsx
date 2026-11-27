"use client";

import { useLayoutEffect, useRef } from "react";
import { useT } from "../../lib/i18n/client";
import { prefersReducedMotion } from "../motion";
import styles from "./StatusBadge.module.css";

/** The five status families from design contract 4.2. */
export type StatusTone = "ok" | "attn" | "wait" | "danger" | "info";

/** Report lifecycle states (hackathon plan section 3) plus upload and urgency states. */
export type ReportStatus =
  | "on-phone"
  | "sending"
  | "needs-attention"
  | "waiting-code"
  | "not-confirmed"
  | "received"
  | "in-review"
  | "question"
  | "closed"
  | "withdrawn"
  | "saved"
  | "failed"
  | "urgent";

const statusTone: Record<ReportStatus, StatusTone> = {
  "on-phone": "wait",
  sending: "wait",
  "needs-attention": "attn",
  "waiting-code": "attn",
  "not-confirmed": "wait",
  received: "ok",
  "in-review": "info",
  question: "attn",
  closed: "ok",
  withdrawn: "wait",
  saved: "ok",
  failed: "danger",
  urgent: "danger",
};

const statusKey: Record<ReportStatus, string> = {
  "on-phone": "ui.status.onPhone",
  sending: "common.status.sending",
  "needs-attention": "common.status.needsAttention",
  "waiting-code": "common.status.waitingCode",
  "not-confirmed": "ui.status.notConfirmed",
  received: "ui.status.received",
  "in-review": "ui.status.inReview",
  question: "ui.status.question",
  closed: "ui.status.closed",
  withdrawn: "ui.status.withdrawn",
  saved: "ui.status.saved",
  failed: "ui.status.failed",
  urgent: "ui.status.urgent",
};

type BadgeCommon = {
  size?: "md" | "lg";
  /**
   * When this badge changes tone or words while it stays on screen, the new fill grows from the old
   * chip's width and the words cross-fade (240 ms). Only for a badge that reports one thing's state
   * (a report, a release); never for table cells that are reused when a list changes.
   */
  morph?: boolean;
  "data-testid"?: string;
};

export type StatusBadgeProps =
  | (BadgeCommon & { status: ReportStatus; tone?: never; label?: string })
  | (BadgeCommon & { status?: never; tone: StatusTone; label: string });

/** Distinct shape per tone, so status never depends on colour alone. */
export function StatusShape({ tone, size = 14, dashed }: { tone: StatusTone; size?: number; dashed?: boolean }) {
  const common = { width: size, height: size, viewBox: "0 0 16 16", "aria-hidden": true, focusable: false } as const;
  if (dashed) {
    return (
      <svg {...common}>
        <circle cx="8" cy="8" r="6.25" fill="none" stroke="currentColor" strokeWidth="1.75" strokeDasharray="2.6 2.2" />
      </svg>
    );
  }
  switch (tone) {
    case "ok":
      return (
        <svg {...common}>
          <circle cx="8" cy="8" r="7.25" fill="currentColor" />
          <path d="m4.75 8.25 2.25 2.25 4.25-4.5" fill="none" stroke="var(--badge-bg, var(--paper-raised))" strokeWidth="1.75" strokeLinecap="square" />
        </svg>
      );
    case "attn":
      return (
        <svg {...common}>
          <path d="M8 1.25 14.75 8 8 14.75 1.25 8z" fill="currentColor" />
        </svg>
      );
    case "wait":
      return (
        <svg {...common}>
          <circle cx="8" cy="8" r="6.25" fill="none" stroke="currentColor" strokeWidth="2" />
        </svg>
      );
    case "danger":
      return (
        <svg {...common}>
          <path d="M8 1.5 15 14.25H1z" fill="currentColor" />
        </svg>
      );
    case "info":
      return (
        <svg {...common}>
          <circle cx="8" cy="8" r="6.25" fill="none" stroke="currentColor" strokeWidth="2" />
          <path d="M8 2.75a5.25 5.25 0 0 1 0 10.5z" fill="currentColor" />
        </svg>
      );
  }
}

/** Status: colour + shape + text label (design contract 4.2). */
export function StatusBadge(props: StatusBadgeProps) {
  const t = useT();
  const tone = props.status ? statusTone[props.status] : props.tone!;
  const label = props.label ?? (props.status ? t(statusKey[props.status]) : "");
  const root = useRef<HTMLSpanElement>(null);
  const words = useRef<HTMLSpanElement>(null);
  const before = useRef<{ tone: string; label: string; width: number; fill: string } | null>(null);
  const morph = props.morph;

  useLayoutEffect(() => {
    const el = root.current;
    if (!el) return;
    const now = { tone, label, width: el.offsetWidth, fill: getComputedStyle(el).backgroundColor };
    const was = before.current;
    before.current = now;
    if (!morph || !was || (was.tone === tone && was.label === label) || typeof el.animate !== "function") return;
    if (prefersReducedMotion() || document.hidden) {
      el.animate([{ opacity: 0 }, { opacity: 1 }], { duration: 80, easing: "linear" });
      return;
    }
    const EASE = "cubic-bezier(0.77, 0, 0.175, 1)";
    const layer = (width: number, color: string) => {
      const span = document.createElement("span");
      span.setAttribute("aria-hidden", "true");
      Object.assign(span.style, { position: "absolute", top: "-1px", bottom: "-1px", left: "-1px", width: `${width + 2}px`, background: color, borderRadius: "inherit", zIndex: "-1", pointerEvents: "none", transformOrigin: "left center" });
      el.appendChild(span);
      return span;
    };
    const oldFill = layer(was.width, was.fill);
    const newFill = layer(now.width, now.fill);
    const previous = { background: el.style.background, isolation: el.style.isolation, position: el.style.position };
    el.style.background = "transparent";
    el.style.isolation = "isolate";
    el.style.position = "relative";
    const grow = Math.min(1, Math.max(0.2, was.width / now.width));
    const done = [
      oldFill.animate([{ opacity: 1 }, { opacity: 0 }], { duration: 240, easing: EASE, fill: "both" }),
      newFill.animate([{ transform: `scaleX(${grow})` }, { transform: "scaleX(1)" }], { duration: 240, easing: EASE, fill: "both" }),
      words.current?.animate(
        [
          { opacity: 0, transform: "translateY(4px)" },
          { opacity: 1, transform: "translateY(0)" },
        ],
        { duration: 200, delay: 60, easing: "cubic-bezier(0.2, 0, 0, 1)", fill: "backwards" },
      ),
    ];
    const finish = () => {
      oldFill.remove();
      newFill.remove();
      Object.assign(el.style, previous);
    };
    Promise.allSettled(done.map((a) => a?.finished)).then(finish);
    return () => {
      done.forEach((a) => a?.cancel());
      finish();
    };
  }, [tone, label, morph]);

  return (
    <span
      ref={root}
      className={styles.badge}
      data-tone={tone}
      data-variant={props.status === "withdrawn" ? "withdrawn" : undefined}
      data-size={props.size ?? "md"}
      data-testid={props["data-testid"] ?? "status-badge"}
    >
      <StatusShape tone={tone} size={props.size === "lg" ? 16 : 14} dashed={props.status === "withdrawn"} />
      <span ref={words}>{label}</span>
    </span>
  );
}
