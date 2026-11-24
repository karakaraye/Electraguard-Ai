"use client";

/**
 * Network state for the network bar (R6): offline when the browser says so OR
 * the last request failed with a network error. When the network returns, the
 * "Network is back" line shows for 4 s while the queue flushes.
 */

import { useEffect, useLayoutEffect, useRef, useState, useSyncExternalStore } from "react";
import { onApiEvent } from "../../../../lib/api/client";

let lastRequestFailed = false;
const listeners = new Set<() => void>();
let wired = false;

function notify() {
  for (const listener of listeners) listener();
}

function wire() {
  if (wired || typeof window === "undefined") return;
  wired = true;
  onApiEvent((event) => {
    if (event.type === "network_error" && !lastRequestFailed) {
      lastRequestFailed = true;
      notify();
    }
    if (event.type === "network_ok" && lastRequestFailed) {
      lastRequestFailed = false;
      notify();
    }
  });
  window.addEventListener("online", () => {
    lastRequestFailed = false;
    notify();
  });
  window.addEventListener("offline", notify);
}

function subscribe(listener: () => void) {
  wire();
  listeners.add(listener);
  return () => listeners.delete(listener);
}

function isOffline() {
  return !navigator.onLine || lastRequestFailed;
}

export function useNetwork(): { offline: boolean; back: boolean } {
  const offline = useSyncExternalStore(subscribe, isOffline, () => false);
  const [back, setBack] = useState(false);
  const was = useRef(offline);
  useEffect(() => {
    if (was.current && !offline) {
      setBack(true);
      const timer = window.setTimeout(() => setBack(false), 4_000);
      was.current = offline;
      return () => window.clearTimeout(timer);
    }
    was.current = offline;
  }, [offline]);
  return { offline, back };
}

/** Move focus to the screen question (h1) on every route and step change (R7). */
export function useFocusTitle(key: string, ready = true) {
  useLayoutEffect(() => {
    if (!ready) return;
    function focusHeading() {
      const active = document.activeElement;
      if (active && active.closest("#eg-content") && /^(INPUT|TEXTAREA|SELECT)$/.test(active.tagName)) return true;
      const heading = document.querySelector<HTMLElement>("#eg-content h1");
      if (!heading) return false;
      heading.tabIndex = -1;
      if (document.activeElement !== heading) heading.focus({ preventScroll: false });
      return true;
    }
    if (!focusHeading()) return;
    window.scrollTo({ top: 0 });
    // After a client-side navigation the router moves focus itself once the page has committed; take it back.
    const frame = window.requestAnimationFrame(() => window.requestAnimationFrame(focusHeading));
    const timer = window.setTimeout(focusHeading, 150);
    return () => {
      window.cancelAnimationFrame(frame);
      window.clearTimeout(timer);
    };
  }, [key, ready]);
}
