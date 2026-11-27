"use client";

import { useEffect, useState, useSyncExternalStore, type RefObject } from "react";

/* ---------- Network: navigator.onLine with online/offline events ---------- */

function subscribeNetwork(callback: () => void) {
  window.addEventListener("online", callback);
  window.addEventListener("offline", callback);
  return () => {
    window.removeEventListener("online", callback);
    window.removeEventListener("offline", callback);
  };
}

/** True when the browser reports no network. Always false during server render. */
export function useOffline(): boolean {
  return useSyncExternalStore(
    subscribeNetwork,
    () => !navigator.onLine,
    () => false,
  );
}

/* ---------- On-screen keyboard: how much of the layout viewport it covers ---------- */

function subscribeViewport(callback: () => void) {
  const viewport = window.visualViewport;
  if (!viewport) return () => {};
  viewport.addEventListener("resize", callback);
  viewport.addEventListener("scroll", callback);
  return () => {
    viewport.removeEventListener("resize", callback);
    viewport.removeEventListener("scroll", callback);
  };
}

function keyboardInset(): number {
  const viewport = window.visualViewport;
  if (!viewport) return 0;
  const covered = window.innerHeight - (viewport.height + viewport.offsetTop);
  // Ignore small changes from browser toolbars collapsing; keyboards are taller than 80px.
  return covered > 80 ? Math.round(covered) : 0;
}

/** Height in px hidden behind the on-screen keyboard (0 when it is closed). */
export function useKeyboardInset(enabled = true): number {
  return useSyncExternalStore(
    enabled ? subscribeViewport : () => () => {},
    () => (enabled ? keyboardInset() : 0),
    () => 0,
  );
}

/* ---------- Media queries ---------- */

function mediaStore(query: string) {
  return {
    subscribe(callback: () => void) {
      const list = window.matchMedia(query);
      list.addEventListener("change", callback);
      return () => list.removeEventListener("change", callback);
    },
    get: () => window.matchMedia(query).matches,
  };
}

const reducedMotion = mediaStore("(prefers-reduced-motion: reduce)");

export function useReducedMotion(): boolean {
  return useSyncExternalStore(reducedMotion.subscribe, reducedMotion.get, () => true);
}

const stores = new Map<string, ReturnType<typeof mediaStore>>();

export function useMediaQuery(query: string, serverValue = false): boolean {
  let store = stores.get(query);
  if (!store) {
    store = mediaStore(query);
    stores.set(query, store);
  }
  return useSyncExternalStore(store.subscribe, store.get, () => serverValue);
}

/* ---------- West Africa Time clock (UTC+1, no daylight saving) ---------- */

const WAT_OFFSET_MS = 60 * 60 * 1000;

function subscribeMinute(callback: () => void) {
  const id = window.setInterval(callback, 30_000);
  return () => window.clearInterval(id);
}

let lastMinute = 0;
function currentMinute() {
  const minute = Math.floor(Date.now() / 60_000) * 60_000;
  if (minute !== lastMinute) lastMinute = minute;
  return lastMinute;
}

/** Current time rounded to the minute, refreshed twice a minute. null on the server. */
export function useNow(): number | null {
  return useSyncExternalStore(subscribeMinute, currentMinute, () => null);
}

/** "YYYY-MM-DD" and "HH:MM" for an instant, in West Africa Time. */
export function watParts(epochMs: number): { date: string; time: string } {
  const iso = new Date(epochMs + WAT_OFFSET_MS).toISOString();
  return { date: iso.slice(0, 10), time: iso.slice(11, 16) };
}

/** Epoch ms for a WAT wall-clock date and time. */
export function fromWat(date: string, time = "00:00"): number {
  return Date.parse(`${date}T${time}:00+01:00`);
}

/**
 * True once content has scrolled under a sticky bar. Put a 1 px sentinel element
 * at the top of the scrolling content and pass its ref: the bar shows its bottom
 * rule only while the sentinel is out of view.
 */
export function useScrolled(sentinelRef: RefObject<Element | null>): boolean {
  const [scrolled, setScrolled] = useState(false);
  useEffect(() => {
    const sentinel = sentinelRef.current;
    if (!sentinel || typeof IntersectionObserver === "undefined") return;
    const observer = new IntersectionObserver(([entry]) => setScrolled(!entry.isIntersecting));
    observer.observe(sentinel);
    return () => observer.disconnect();
  }, [sentinelRef]);
  return scrolled;
}
