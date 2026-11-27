"use client";

/**
 * The Messages count in the bottom bar. Home and the lists already read REP-02; they publish the
 * numbers here, and the shell reads them on every other screen. Without a number yet, the shell asks
 * once (online, signed in) and then re-asks at most once a minute.
 */

import { useEffect, useSyncExternalStore } from "react";
import { api } from "../../../../lib/api/client";
import { getSession } from "./session";

export type NavCounts = {
  /** Open reviewer questions. */
  questions: number;
  /** Reports with unread reviewer messages. */
  unread: number;
};

const EMPTY: NavCounts = { questions: 0, unread: 0 };
const listeners = new Set<() => void>();
let counts: NavCounts = EMPTY;
let lastRead = 0;
let reading = false;

function emit() {
  for (const listener of listeners) listener();
}

/** Publish counts that a screen has just read (or fixture counts in the development viewer). */
export function setNavCounts(next: NavCounts) {
  lastRead = Date.now();
  if (next.questions === counts.questions && next.unread === counts.unread) return;
  counts = next;
  emit();
}

async function refresh() {
  if (reading || typeof navigator === "undefined" || !navigator.onLine || !getSession()) return;
  if (Date.now() - lastRead < 60_000) return;
  reading = true;
  const result = await api("REP-02", { query: { limit: 1 } });
  reading = false;
  if (result.ok) setNavCounts({ questions: result.data.counts.open_questions, unread: result.data.counts.unread_messages });
}

function subscribe(listener: () => void) {
  listeners.add(listener);
  return () => listeners.delete(listener);
}

/** Messages that need the observer: open questions plus reports with unread replies. */
export function useNavCounts(enabled: boolean): NavCounts {
  useEffect(() => {
    if (enabled) void refresh();
  }, [enabled]);
  return useSyncExternalStore(subscribe, () => counts, () => EMPTY);
}
