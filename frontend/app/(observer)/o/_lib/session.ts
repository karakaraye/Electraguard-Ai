"use client";

/**
 * Observer session as the phone knows it. The real session is the server's
 * HttpOnly cookie (contract 1.2); the phone keeps only what it needs to work
 * offline: which code is signed in (to scope drafts and the outbox, R2), the
 * organisation name, the intake-paused flag and the server clock offset.
 * The PIN is never stored.
 */

import { useSyncExternalStore } from "react";
import type { MeResponse } from "../../../../lib/api/types";

const KEY = "eg.observer";
const LAST_CODE = "eg.observer.lastCode";

export type ObserverSession = {
  code: string;
  organisation: string;
  intake_paused: boolean;
  /** server_time − phone time, ms (AUTH-07). */
  clock_offset_ms: number;
  signed_in_at: number;
};

type State = { session: ObserverSession | null; expired: boolean };

const listeners = new Set<() => void>();
let state: State | null = null;

function read(): State {
  if (state) return state;
  let session: ObserverSession | null = null;
  try {
    const raw = window.localStorage.getItem(KEY);
    session = raw ? (JSON.parse(raw) as ObserverSession) : null;
  } catch {
    session = null;
  }
  state = { session, expired: false };
  return state;
}

function write(next: State) {
  state = next;
  try {
    if (next.session) window.localStorage.setItem(KEY, JSON.stringify(next.session));
    else window.localStorage.removeItem(KEY);
  } catch {
    // Storage blocked: the session works for this visit only.
  }
  for (const listener of listeners) listener();
}

const serverState: State = { session: null, expired: false };

export function useObserverSession(): State & { ready: boolean } {
  const value = useSyncExternalStore(
    (listener) => {
      listeners.add(listener);
      return () => listeners.delete(listener);
    },
    read,
    () => serverState,
  );
  return { ...value, ready: value !== serverState };
}

export function getSession(): ObserverSession | null {
  return typeof window === "undefined" ? null : read().session;
}

/** After AUTH-02 / AUTH-03 success. */
export function signedIn(me: Extract<MeResponse, { authenticated: true }>) {
  const code = me.user.observer_code ?? "";
  try {
    window.localStorage.setItem(LAST_CODE, code);
  } catch {
    // ignore
  }
  write({
    session: {
      code,
      organisation: me.user.organisation.name,
      intake_paused: me.user.organisation.intake_paused,
      clock_offset_ms: Date.parse(me.server_time) - Date.now(),
      signed_in_at: Date.now(),
    },
    expired: false,
  });
}

/** Refresh from AUTH-07 while signed in. */
export function updateFromMe(me: MeResponse) {
  const current = read();
  if (!me.authenticated) {
    if (current.session) write({ ...current, expired: true });
    return;
  }
  if (!current.session || me.user.observer_code !== current.session.code) {
    signedIn(me);
    return;
  }
  write({
    session: {
      ...current.session,
      organisation: me.user.organisation.name,
      intake_paused: me.user.organisation.intake_paused,
      clock_offset_ms: Date.parse(me.server_time) - Date.now(),
    },
    expired: false,
  });
}

export function markExpired() {
  const current = read();
  if (current.session && !current.expired) write({ ...current, expired: true });
}

/** Code revoked or signed out: forget the session (drafts and outbox stay scoped to the code). */
export function clearSession() {
  write({ session: null, expired: false });
}

export function lastCode(): string {
  try {
    return window.localStorage.getItem(LAST_CODE) ?? "";
  } catch {
    return "";
  }
}

/** "Now" corrected by the server clock when the phone is more than 10 minutes off (O-08). */
export function correctedNow(): number {
  const offset = getSession()?.clock_offset_ms ?? 0;
  return Math.abs(offset) > 10 * 60_000 ? Date.now() + offset : Date.now();
}

/* ---------- Device flags ---------- */

const NOTICE_KEY = "eg.noticeSeen";

export function noticeSeen(version: string): boolean {
  try {
    return window.localStorage.getItem(NOTICE_KEY) === version;
  } catch {
    return false;
  }
}

export function markNoticeSeen(version: string) {
  try {
    window.localStorage.setItem(NOTICE_KEY, version);
  } catch {
    // ignore
  }
}

export function localeChosen(): boolean {
  try {
    return Boolean(window.localStorage.getItem("eg.locale"));
  } catch {
    return false;
  }
}
