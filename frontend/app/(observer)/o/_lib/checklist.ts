"use client";

/**
 * O-15 polling-day checklist: the fixed definition (contract REP-01 checklist
 * table, shipped with the app) and the per-day state kept on the phone.
 * Answers stay on the phone only until the stage is received (R8); after that
 * the phone keeps the stage's receipt (id, code, time) and the Arrival unit,
 * which the later stages need as their place.
 */

import { useSyncExternalStore } from "react";
import type { Category, ChecklistStage, MissingMaterial, QueueSize, ReportCreateResponse, YesNoQuestion } from "../../../../lib/api/types";

/* ---------- Definition ---------- */

export type StageSlug = "arrival" | "opening" | "accreditation" | "voting" | "closing" | "results";

export const STAGES: Array<{ slug: StageSlug; wire: ChecklistStage }> = [
  { slug: "arrival", wire: "arrival" },
  { slug: "opening", wire: "opening" },
  { slug: "accreditation", wire: "accreditation" },
  { slug: "voting", wire: "voting" },
  { slug: "closing", wire: "closing_counting" },
  { slug: "results", wire: "results_posted" },
];

export function isStage(value: string): value is StageSlug {
  return STAGES.some((stage) => stage.slug === value);
}

export type Question =
  | { id: YesNoQuestion; type: "yesno"; key: string; problem: "no" | "yes" }
  | { id: "queue_size"; type: "queue"; key: string }
  | { id: "arrival_time"; type: "time"; key: string };

const yn = (id: YesNoQuestion, key: string, problem: "no" | "yes" = "no"): Question => ({ id, type: "yesno", key: `o15.q.${key}`, problem });

export const QUESTIONS: Record<StageSlug, Question[]> = {
  arrival: [{ id: "arrival_time", type: "time", key: "o15.q.arrivalTime" }],
  opening: [yn("opened_on_time", "openedOnTime"), yn("materials_all_present", "materialsPresent"), yn("officials_present", "officialsPresent"), yn("party_agents_present", "agentsPresent")],
  accreditation: [yn("device_working", "deviceWorking"), { id: "queue_size", type: "queue", key: "o15.q.queueSize" }, yn("priority_given", "priority")],
  voting: [yn("secrecy_kept", "secrecy"), yn("assistance_available", "assistance"), yn("disruption", "disruption", "yes"), yn("inducement_seen", "inducementSeen", "yes")],
  closing: [yn("closed_on_time", "closedOnTime"), yn("counting_public", "countPublic"), yn("agents_signed", "agentsSigned")],
  results: [yn("sheet_posted", "sheetPosted")],
};

export const MATERIALS: Array<{ value: MissingMaterial; key: string }> = [
  { value: "ballot_papers", key: "o15.material.ballots" },
  { value: "result_sheets", key: "o15.material.resultSheets" },
  { value: "ballot_boxes", key: "o15.material.boxes" },
  { value: "voting_cubicles", key: "o15.material.booths" },
  { value: "indelible_ink", key: "o15.material.ink" },
  { value: "voter_register", key: "o15.material.register" },
  { value: "accreditation_device", key: "o15.material.device" },
  { value: "stamps_seals", key: "o15.material.stamps" },
  { value: "other", key: "o15.material.other" },
];

export const QUEUE_SIZES: Array<{ value: QueueSize; key: string }> = [
  { value: "none", key: "o15.queue.none" },
  { value: "under_50", key: "o15.queue.small" },
  { value: "50_200", key: "o15.queue.medium" },
  { value: "over_200", key: "o15.queue.large" },
];

/** O-15 "Report this as an incident" mapping. Nothing is invented: unclear problems open as "Not sure". */
export function incidentCategoryFor(question: string): Category {
  switch (question) {
    case "opened_on_time":
    case "materials_all_present":
    case "officials_present":
      return "late_materials";
    case "device_working":
      return "equipment_failure";
    case "queue_size":
      return "queues_crowding";
    case "priority_given":
    case "assistance_available":
      return "access_barrier";
    case "disruption":
      return "intimidation_violence";
    case "inducement_seen":
      return "vote_buying";
    case "sheet_posted":
      return "lack_of_information";
    default:
      return "not_sure";
  }
}

/* ---------- Per-day state on the phone ---------- */

export type StageAnswers = Partial<Record<YesNoQuestion, "yes" | "no" | "not_seen">> & {
  arrival_time?: string;
  queue_size?: QueueSize;
  materials_missing?: MissingMaterial[];
};

export type StageRecord = {
  answers: StageAnswers;
  state: "draft" | "queued" | "needs_attention" | "received";
  report_id?: string;
  receipt_code?: string;
  received_at?: string;
};

export type ChecklistUnit = { code: string; label: string; state_code: string | null; lga_code: string | null; ward_code: string | null; ward_name: string | null };

export type ChecklistDay = { unit: ChecklistUnit | null; stages: Partial<Record<StageSlug | "sheet", StageRecord>> };

/** Today's date in West Africa Time, "YYYY-MM-DD". */
export function watDay(at: number = Date.now()): string {
  return new Intl.DateTimeFormat("en-CA", { timeZone: "Africa/Lagos", year: "numeric", month: "2-digit", day: "2-digit" }).format(new Date(at));
}

const storageKey = (owner: string, day: string) => `eg.checklist.${owner}.${day}`;
const emptyDay: ChecklistDay = { unit: null, stages: {} };
const cache = new Map<string, ChecklistDay>();
const listeners = new Set<() => void>();

export function readDay(owner: string, day: string): ChecklistDay {
  const key = storageKey(owner, day);
  const cached = cache.get(key);
  if (cached) return cached;
  let value: ChecklistDay = emptyDay;
  try {
    const raw = window.localStorage.getItem(key);
    if (raw) value = JSON.parse(raw) as ChecklistDay;
  } catch {
    value = emptyDay;
  }
  cache.set(key, value);
  return value;
}

function writeDay(owner: string, day: string, value: ChecklistDay) {
  const key = storageKey(owner, day);
  cache.set(key, value);
  try {
    window.localStorage.setItem(key, JSON.stringify(value));
  } catch {
    // Storage blocked: kept for this visit only.
  }
  for (const listener of listeners) listener();
}

export function updateDay(owner: string, day: string, change: (current: ChecklistDay) => ChecklistDay) {
  writeDay(owner, day, change(readDay(owner, day)));
}

export function useChecklistDay(owner: string | null, day: string): ChecklistDay {
  return useSyncExternalStore(
    (listener) => {
      listeners.add(listener);
      return () => listeners.delete(listener);
    },
    () => (owner ? readDay(owner, day) : emptyDay),
    () => emptyDay,
  );
}

/** REP-01 confirmed: keep only the receipt, drop the answers (R8). */
export function markStageReceived(owner: string, day: string, stage: string, data: ReportCreateResponse) {
  updateDay(owner, day, (current) => ({
    ...current,
    stages: { ...current.stages, [stage]: { answers: {}, state: "received", report_id: data.id, receipt_code: data.receipt_code, received_at: data.received_at } },
  }));
}

export function markStageWaiting(owner: string, day: string, stage: string, state: "queued" | "needs_attention") {
  updateDay(owner, day, (current) => {
    const record = current.stages[stage as StageSlug];
    return { ...current, stages: { ...current.stages, [stage]: { answers: record?.answers ?? {}, state } } };
  });
}

/** "Sign out and clear this phone": every code's checklist days. */
export function clearAllChecklists() {
  cache.clear();
  try {
    for (const key of Object.keys(window.localStorage)) if (key.startsWith("eg.checklist.")) window.localStorage.removeItem(key);
  } catch {
    // ignore
  }
  for (const listener of listeners) listener();
}
