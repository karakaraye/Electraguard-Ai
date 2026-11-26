"use client";

/**
 * Ward check-ins for the observer (NOT-04) and "Your LGA today" (AREA-01).
 *
 * Nothing from these reads is written to the phone (contract 1.8). The last notices seen stay in memory
 * for this visit, so a check-in opened from Home or Messages can still be answered when the network drops
 * after the list loaded. The answer itself is saved on the phone (lib/outbox/notices.ts).
 */

import { useEffect, useMemo, useSyncExternalStore } from "react";
import { api } from "../../../../lib/api/client";
import type { AreaTodayResponse, NoticeAnswerChoice, ObserverNotice } from "../../../../lib/api/types";
import { useNoticeAnswers, type QueuedAnswer } from "../../../../lib/outbox/notices";
import { useLoad, type Load } from "./useLoad";

let remembered: ObserverNotice[] = [];
const listeners = new Set<() => void>();
const subscribe = (listener: () => void) => {
  listeners.add(listener);
  return () => listeners.delete(listener);
};

/** Fixtures for the development viewer. */
export function rememberNotices(list: ObserverNotice[]) {
  remembered = list;
  for (const listener of listeners) listener();
}

export type NoticeView = ObserverNotice & {
  /** The answer shown to the observer: the one saved on this phone if newer, else the server's. */
  answer: { choice: NoticeAnswerChoice; at: string; state: "on_phone" | "sent" | "expired" } | null;
};

function merge(notices: ObserverNotice[], queue: QueuedAnswer[]): NoticeView[] {
  return notices.map((notice) => {
    const local = queue.find((entry) => entry.notice_id === notice.id);
    const answer: NoticeView["answer"] = local
      ? { choice: local.answer, at: local.answered_at, state: local.state === "sent" ? "sent" : local.state === "expired" ? "expired" : "on_phone" }
      : notice.my_answer
        ? { choice: notice.my_answer.answer, at: notice.my_answer.answered_at, state: "sent" }
        : null;
    return { ...notice, answer };
  });
}

export function useNotices(code: string | null, offline: boolean): { notices: NoticeView[]; load: Load<{ items: ObserverNotice[] }> } {
  const load = useLoad<{ items: ObserverNotice[] }>(() => api("NOT-04", {}), code ?? "", { enabled: Boolean(code), offline, pollMs: 60_000 });
  const items = load.data?.items;
  useEffect(() => {
    if (items) rememberNotices(items);
  }, [items]);
  const kept = useSyncExternalStore(subscribe, () => remembered, () => remembered);
  const queue = useNoticeAnswers(code);
  const notices = useMemo(() => merge(items ?? kept, queue), [items, kept, queue]);
  return { notices, load };
}

/** Notices that wait for an answer and have not run out. */
export function openNotices(notices: NoticeView[], now: number): NoticeView[] {
  return notices.filter((notice) => !notice.answer && Date.parse(notice.expires_at) > now);
}

export function useAreaToday(code: string | null, offline: boolean): Load<AreaTodayResponse> {
  return useLoad<AreaTodayResponse>(() => api("AREA-01", {}), code ?? "", { enabled: Boolean(code), offline, pollMs: 5 * 60_000 });
}
