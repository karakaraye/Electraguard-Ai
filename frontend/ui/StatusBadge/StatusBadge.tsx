"use client";

import { useT } from "../../lib/i18n/client";
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

export type StatusBadgeProps =
  | { status: ReportStatus; tone?: never; label?: string; size?: "md" | "lg"; "data-testid"?: string }
  | { status?: never; tone: StatusTone; label: string; size?: "md" | "lg"; "data-testid"?: string };

/** Distinct shape per tone, so status never depends on colour alone. */
export function StatusShape({ tone, size = 14 }: { tone: StatusTone; size?: number }) {
  const common = { width: size, height: size, viewBox: "0 0 16 16", "aria-hidden": true, focusable: false } as const;
  switch (tone) {
    case "ok":
      return (
        <svg {...common}>
          <circle cx="8" cy="8" r="7.25" fill="currentColor" />
          <path d="m4.75 8.25 2.25 2.25 4.25-4.5" fill="none" stroke="var(--badge-bg, #fff)" strokeWidth="1.75" strokeLinecap="square" />
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
  return (
    <span className={styles.badge} data-tone={tone} data-size={props.size ?? "md"} data-testid={props["data-testid"] ?? "status-badge"}>
      <StatusShape tone={tone} size={props.size === "lg" ? 16 : 14} />
      <span>{label}</span>
    </span>
  );
}
