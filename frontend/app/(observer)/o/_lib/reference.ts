"use client";

/**
 * Polling-unit reference list (REF-01), stored on the phone in IndexedDB and
 * revalidated with If-None-Match. Only the states the observer chooses are
 * downloaded (contract gap G4: the coverage area is not known to the app yet).
 */

import { useCallback, useEffect, useState } from "react";
import { downloadJson, getWithRetry } from "../../../../lib/api/client";
import type { AreaIndexResponse, StateAreasResponse } from "../../../../lib/api/types";
import { get, idbAvailable, put } from "../../../../lib/drafts/db";
import type { StateListStatus } from "../../../../ui";

type Cached<T> = { key: string; etag: string | null; data: T; saved_at: number };

async function cached<T>(key: string): Promise<Cached<T> | undefined> {
  if (!idbAvailable()) return undefined;
  try {
    return await get<Cached<T>>("refdata", key);
  } catch {
    return undefined;
  }
}

export async function loadIndex(): Promise<AreaIndexResponse | null> {
  const stored = await cached<AreaIndexResponse>("index");
  if (typeof navigator !== "undefined" && navigator.onLine === false) return stored?.data ?? null;
  const result = await getWithRetry("REF-01.index", { headers: stored?.etag ? { "If-None-Match": stored.etag } : {} }, 2);
  if (result.ok && result.status !== 304 && result.data) {
    await put<Cached<AreaIndexResponse>>("refdata", { key: "index", etag: result.etag, data: result.data, saved_at: Date.now() });
    return result.data;
  }
  return stored?.data ?? null;
}

export function useReference(stateCode: string | null) {
  const [index, setIndex] = useState<AreaIndexResponse | null>(null);
  const [indexLoaded, setIndexLoaded] = useState(false);
  const [areas, setAreas] = useState<Record<string, StateAreasResponse>>({});
  const [status, setStatus] = useState<StateListStatus>({ kind: "ready" });
  const [attempt, setAttempt] = useState(0);

  useEffect(() => {
    let cancelled = false;
    void (async () => {
      const data = await loadIndex();
      if (cancelled) return;
      setIndex(data);
      setIndexLoaded(true);
      // Put every state already on the phone into the search.
      if (data) {
        const loaded: Record<string, StateAreasResponse> = {};
        for (const state of data.states) {
          const stored = await cached<StateAreasResponse>(`state:${state.state_code}`);
          if (stored) loaded[state.state_code] = stored.data;
        }
        if (!cancelled) setAreas((current) => ({ ...loaded, ...current }));
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [attempt]);

  useEffect(() => {
    if (!stateCode || !indexLoaded) return;
    let cancelled = false;
    void (async () => {
      const key = `state:${stateCode}`;
      const stored = await cached<StateAreasResponse>(key);
      const fresh = stored && index?.states.find((s) => s.state_code === stateCode)?.version === stored.data.version;
      if (stored) {
        setAreas((current) => ({ ...current, [stateCode]: stored.data }));
        setStatus({ kind: "ready" });
        if (fresh || navigator.onLine === false) return;
      } else if (navigator.onLine === false) {
        setStatus({ kind: "missing" });
        return;
      }
      if (!stored) setStatus({ kind: "downloading", percent: 0 });
      const result = await downloadJson(
        "REF-01.state",
        { params: { state_code: stateCode }, headers: stored?.etag ? { "If-None-Match": stored.etag } : {} },
        (received, total) => {
          if (!cancelled && !stored) setStatus({ kind: "downloading", percent: total ? Math.min(100, Math.round((received / total) * 100)) : null });
        },
      );
      if (cancelled) return;
      if (result.ok && result.status !== 304 && result.data) {
        await put<Cached<StateAreasResponse>>("refdata", { key, etag: result.etag, data: result.data, saved_at: Date.now() });
        setAreas((current) => ({ ...current, [stateCode]: result.data }));
        setStatus({ kind: "ready" });
      } else if (!stored) {
        setStatus(result.ok ? { kind: "ready" } : result.status === 0 ? { kind: "missing" } : { kind: "error" });
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [stateCode, index, indexLoaded, attempt]);

  const retry = useCallback(() => setAttempt((n) => n + 1), []);

  return {
    states: index ? index.states.map(({ state_code, name }) => ({ state_code, name })) : indexLoaded ? null : [],
    areas,
    status: stateCode ? status : ({ kind: "ready" } as StateListStatus),
    retry,
  };
}
