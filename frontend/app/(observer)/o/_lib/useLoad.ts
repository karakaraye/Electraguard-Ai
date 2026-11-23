"use client";

/**
 * Server reads for observer screens (R6): the last good answer stays on screen
 * with its time while a refresh fails; nothing is written to the phone
 * (contract 1.8). Polls while the screen is open and online, and refreshes when
 * the screen comes back into view (at most once per 30 s).
 */

import { useCallback, useEffect, useRef, useState } from "react";
import type { ApiResult } from "../../../../lib/api/contracts";

export type LoadStatus = "loading" | "ok" | "error" | "not_found" | "unavailable" | "offline" | "auth";

export type Load<T> = {
  status: LoadStatus;
  data: T | null;
  updatedAt: number | null;
  /** True while a refresh runs over data already on screen. */
  refreshing: boolean;
  /** The last refresh failed while older data stays on screen. */
  stale: LoadStatus | null;
  reload: () => void;
};

type Options = {
  /** Skip the call (no session yet, or offline). */
  enabled: boolean;
  offline: boolean;
  pollMs?: number;
  /**
   * A collection path (no id): a 404 means the server does not offer this
   * contract yet, which is shown as "not available yet", never as empty.
   */
  collection?: boolean;
};

export function useLoad<T>(fetcher: () => Promise<ApiResult<T>>, key: string, { enabled, offline, pollMs, collection }: Options): Load<T> {
  const [state, setState] = useState<Omit<Load<T>, "reload">>({ status: "loading", data: null, updatedAt: null, refreshing: false, stale: null });
  const fetcherRef = useRef(fetcher);
  const last = useRef(0);
  useEffect(() => {
    fetcherRef.current = fetcher;
  });

  const run = useCallback(async () => {
    last.current = Date.now();
    setState((current) => ({ ...current, refreshing: current.data !== null }));
    const result = await fetcherRef.current();
    setState((current) => {
      if (result.ok) return { status: "ok", data: result.data, updatedAt: Date.now(), refreshing: false, stale: null };
      const status: LoadStatus =
        result.status === 0
          ? "offline"
          : result.status === 404
            ? collection
              ? "unavailable"
              : "not_found"
            : result.error.code === "not_authenticated"
              ? "auth"
              : "error";
      const keep = current.data !== null && status !== "not_found";
      return { ...current, status: keep ? "ok" : status, refreshing: false, stale: keep ? status : null };
    });
    return result;
  }, [collection]);

  useEffect(() => {
    if (!enabled) return;
    if (offline) {
      setState((current) => (current.data ? current : { ...current, status: "offline" }));
      return;
    }
    void run();
    const timers: number[] = [];
    if (pollMs) timers.push(window.setInterval(() => void run(), pollMs));
    const onVisible = () => {
      if (document.visibilityState === "visible" && Date.now() - last.current > 30_000) void run();
    };
    document.addEventListener("visibilitychange", onVisible);
    return () => {
      for (const timer of timers) window.clearInterval(timer);
      document.removeEventListener("visibilitychange", onVisible);
    };
  }, [enabled, offline, key, pollMs, run]);

  return { ...state, reload: () => void run() };
}

