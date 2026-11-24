/** Builds list rows from the three sources a list can show (README R1, G9): server rows, the outbox and the received index. */

import type { ReportListItem } from "../../../../lib/api/types";
import type { OutboxItem, ReceivedEntry } from "../../../../lib/outbox";
import type { Translate } from "../../../../lib/i18n/core";
import type { ListRow } from "../_views/ListViews";
import type { PendingItem } from "./pending";
import { STAGES } from "./checklist";
import { OUTBOX_BADGE, SERVER_BADGE } from "./status";

const PENDING_BADGE = { queued: "on-phone", sending: "sending", unconfirmed: "not-confirmed", needs_attention: "needs-attention" } as const;

export function serverRow(item: ReportListItem, t: Translate): ListRow {
  const area = item.area;
  const place = area?.polling_unit_name ?? (area?.ward_name ? `${t("o13.unknownPlace")}: ${area.ward_name}` : "");
  return {
    key: item.id,
    href: `/o/reports/${item.id}`,
    kind: item.kind,
    category: item.category_observer,
    stage: item.checklist_stage ? (STAGES.find((stage) => stage.wire === item.checklist_stage)?.slug ?? null) : null,
    place: item.status === "withdrawn" ? "" : place,
    at: item.status === "withdrawn" ? item.received_at : (item.occurred_at ?? item.received_at),
    reference: item.receipt_code,
    status: item.has_open_question ? "question" : SERVER_BADGE[item.status],
    note: item.unread_messages > 0 ? t("o17.newMessage", { count: item.unread_messages }) : undefined,
  };
}

export function outboxRow(item: OutboxItem): ListRow {
  return {
    key: item.id,
    href: `/o/reports/${item.id}`,
    kind: "incident",
    category: item.summary.category_observer,
    place: item.summary.place_label ?? item.summary.ward_name ?? "",
    at: item.summary.occurred_at ?? item.created_at,
    status: OUTBOX_BADGE[item.state],
  };
}

export function receivedRow(entry: ReceivedEntry): ListRow {
  return {
    key: entry.id,
    href: `/o/reports/${entry.id}`,
    kind: "incident",
    category: entry.category_observer,
    place: entry.ward_name ?? "",
    at: entry.occurred_at ?? entry.received_at,
    reference: entry.receipt_code,
    status: SERVER_BADGE[entry.status] ?? "received",
  };
}

export function pendingRow(item: PendingItem): ListRow | null {
  if (item.kind === "checklist") {
    return { key: item.key, href: `/o/checklist/${item.stage}`, kind: "checklist", category: null, stage: item.stage, place: "", at: item.created_at, status: PENDING_BADGE[item.state] };
  }
  if (item.kind === "result_sheet" && !item.report_id) {
    return { key: item.key, href: "/o/checklist/results/sheet", kind: "result_sheet", category: null, place: "", at: item.created_at, status: PENDING_BADGE[item.state] };
  }
  return null;
}

export const needsYou = (row: ListRow) => row.status === "question" || row.status === "needs-attention" || row.status === "waiting-code" || Boolean(row.note);
export const onPhone = (row: ListRow) => row.status === "on-phone" || row.status === "sending" || row.status === "not-confirmed" || row.status === "needs-attention" || row.status === "waiting-code";
