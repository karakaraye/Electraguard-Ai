"use client";

/**
 * Check-in answers waiting on the phone. An answer is saved with the phone's own time and a send key,
 * then sent with the same key until the server confirms (same rules as the report outbox: one key per
 * item, retry on the online event, never a silent duplicate). The answer is small and has no media, so
 * it lives in localStorage, per signed-in code. A notice that expired before the phone got a network is
 * kept as "expired" so the observer sees what happened instead of a vanished answer.
 */

import { useSyncExternalStore } from "react";
import { api, isoWithOffset, uuidv4 } from "../api/client";
import type { NoticeAnswerChoice } from "../api/types";

export type QueuedAnswerState = "queued" | "sending" | "sent" | "expired";

export type QueuedAnswer = {
  /** The notice id. One answer per notice and observer; a change replaces it and gets a new key. */
  notice_id: string;
  owner: string;
  answer: NoticeAnswerChoice;
  /** The phone's time when the observer chose (ISO 8601 with offset). */
  answered_at: string;
  key: string;
  state: QueuedAnswerState;
};

const STORE_KEY = "eg.noticeAnswers.v1";
const EMPTY: QueuedAnswer[] = [];
let items: QueuedAnswer[] | null = null;
const listeners = new Set<() => void>();

function read(): QueuedAnswer[] {
  if (items) return items;
  try {
    const raw = JSON.parse(window.localStorage.getItem(STORE_KEY) ?? "[]");
    items = Array.isArray(raw) ? (raw as QueuedAnswer[]).map((item) => (item.state === "sending" ? { ...item, state: "queued" as const } : item)) : [];
  } catch {
    items = [];
  }
  return items;
}

function write(next: QueuedAnswer[]) {
  items = next;
  try {
    window.localStorage.setItem(STORE_KEY, JSON.stringify(next.slice(-100)));
  } catch {
    /* storage blocked: the answer stays in memory until the page closes */
  }
  for (const listener of listeners) listener();
}

function subscribe(listener: () => void) {
  listeners.add(listener);
  return () => listeners.delete(listener);
}

/** Every answer on this phone for one observer code. */
export function useNoticeAnswers(owner: string | null): QueuedAnswer[] {
  const all = useSyncExternalStore(subscribe, () => (typeof window === "undefined" ? EMPTY : read()), () => EMPTY);
  return owner ? all.filter((item) => item.owner === owner) : EMPTY;
}

/** Save an answer on the phone and try to send it. Returns at once; the screen reads the queue. */
export function answerNotice(owner: string, noticeId: string, answer: NoticeAnswerChoice) {
  const entry: QueuedAnswer = { notice_id: noticeId, owner, answer, answered_at: isoWithOffset(), key: uuidv4(), state: "queued" };
  write([...read().filter((item) => !(item.owner === owner && item.notice_id === noticeId)), entry]);
  void flushNoticeAnswers([owner]);
}

let flushing = false;

/** Send what waits. Safe to call often: online event, sign-in, after saving. */
export async function flushNoticeAnswers(owners: string[]) {
  if (flushing || typeof navigator === "undefined" || navigator.onLine === false) return;
  flushing = true;
  try {
    for (const item of read().filter((entry) => entry.state === "queued" && owners.includes(entry.owner))) {
      write(read().map((entry) => (entry === item ? { ...entry, state: "sending" as const } : entry)));
      const result = await api("NOT-05", {
        params: { id: item.notice_id },
        body: { answer: item.answer, answered_at: item.answered_at },
        idempotency_key: item.key,
      });
      const settle = (state: QueuedAnswerState) => write(read().map((entry) => (entry.key === item.key ? { ...entry, state } : entry)));
      if (result.ok) settle("sent");
      else if (result.status === 409 || result.status === 404 || result.error.code === "stale_answer") settle("expired");
      else {
        settle("queued");
        break; // network, session or server trouble: stop and wait for the next trigger
      }
    }
  } finally {
    flushing = false;
  }
}

/** Waiting to send, for the badge. */
export function waitingCount(list: QueuedAnswer[]): number {
  return list.filter((item) => item.state === "queued" || item.state === "sending").length;
}
