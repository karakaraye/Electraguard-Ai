"use client";

/**
 * The open incident draft (README R2).
 * - One draft per owner: the signed-in observer code, or "citizen".
 * - Created when a category is first chosen on O-05; its `id` (UUID v4) is made
 *   once and becomes the report's Idempotency-Key.
 * - Every change is written within 300 ms (debounced 250 ms), and flushed at once
 *   when the page is hidden, so an app kill or reload never loses input.
 * - Deleted only by "Delete this report", by Send (moved to the outbox in the
 *   same transaction), or by "Sign out and clear this phone".
 */

import { useCallback, useEffect, useRef, useState } from "react";
import { uuidv4 } from "../api/client";
import type { AccessBarrierDetail, Category, ChecklistQuestionId, Language, MediaKind } from "../api/types";
import { atomically, del, get, idbAvailable, put } from "./db";

export const STEPS = ["what", "danger", "where", "when", "describe", "evidence", "check"] as const;
export type StepId = (typeof STEPS)[number];

export type WhenMode = "now" | "today" | "day";

export type DraftMedia = {
  /** Local id, echoed by MED-01 / MED-03 (≤ 64 characters). */
  client_media_id: string;
  kind: MediaKind;
  content_type: string;
  size_bytes: number;
  /** Lower-case hex SHA-256 of the exact bytes that will be sent. */
  sha256: string;
  duration_ms: number | null;
  blur_faces: boolean;
  /** Key of the processed blob in the "blobs" store (location already removed). */
  blob_key: string;
  /** Short label for the row ("Photo 1"). */
  name: string;
  /** Faces were blurred on this phone before storing. */
  blurred_on_phone?: boolean;
  /** The unblurred (but already location-free) copy, kept while blur is on so it can be switched off. */
  plain_blob_key?: string;
};

export type DraftPlace = {
  polling_unit_code: string | null;
  ward_code: string | null;
  state_code: string | null;
  lga_code: string | null;
  /** "Unit name, Ward, LGA" or "Ward, LGA" as officially written (REF-01). */
  label: string | null;
  ward_name: string | null;
  /** "I don't know the polling unit": the ward is enough. */
  unknown_unit?: boolean;
};

export type IncidentDraft = {
  owner: string;
  /** UUID v4, made once per draft; the report's Idempotency-Key. */
  id: string;
  mode: "observer" | "citizen";
  created_at: number;
  updated_at: number;
  last_step: StepId;
  category_observer: Category | null;
  access_barrier_details: AccessBarrierDetail[];
  danger_now: boolean | null;
  place: DraftPlace;
  when: { mode: WhenMode; date?: string; time?: string };
  /** Set when Continue is tapped on O-08 (ISO with offset). */
  occurred_at: string | null;
  description: string;
  firsthand: boolean | null;
  input_method: "typed" | "dictated" | "mixed" | null;
  /** Hash of the text the observer confirmed is not a name (never sent). */
  name_ack_hash: string | null;
  media: DraftMedia[];
  /** Citizen only: base64url of 32 random bytes, made on the phone (REP-05). */
  receipt_secret?: string;
  related_report_id?: string | null;
  from_checklist_question?: ChecklistQuestionId | null;
  /** UI language when the report was made (REP-01 `language`). */
  language: Language;
};

export const emptyPlace: DraftPlace = {
  polling_unit_code: null,
  ward_code: null,
  state_code: null,
  lga_code: null,
  label: null,
  ward_name: null,
};

/** 32 random bytes as base64url (43 characters), for REP-05. */
export function makeReceiptSecret(): string {
  const bytes = new Uint8Array(32);
  crypto.getRandomValues(bytes);
  let binary = "";
  for (const byte of bytes) binary += String.fromCharCode(byte);
  return btoa(binary).replace(/\+/g, "-").replace(/\//g, "_").replace(/=+$/, "");
}

export function newDraft(owner: string, mode: IncidentDraft["mode"], language: Language): IncidentDraft {
  const now = Date.now();
  return {
    owner,
    id: uuidv4(),
    mode,
    created_at: now,
    updated_at: now,
    last_step: "what",
    category_observer: null,
    access_barrier_details: [],
    danger_now: null,
    place: emptyPlace,
    when: { mode: "now" },
    occurred_at: null,
    description: "",
    firsthand: null,
    input_method: null,
    name_ack_hash: null,
    media: [],
    ...(mode === "citizen" ? { receipt_secret: makeReceiptSecret() } : {}),
    language,
  };
}

export async function loadDraft(owner: string): Promise<IncidentDraft | null> {
  if (!idbAvailable()) return null;
  return (await get<IncidentDraft>("drafts", owner)) ?? null;
}

export async function saveDraft(draft: IncidentDraft): Promise<void> {
  await put("drafts", draft);
}

/** "Delete this report": the draft and its media blobs go, nothing else. */
export async function discardDraft(draft: IncidentDraft): Promise<void> {
  await atomically(["drafts", "blobs"], (tx) => {
    tx.objectStore("drafts").delete(draft.owner);
    for (const item of draft.media) tx.objectStore("blobs").delete(item.blob_key);
  });
}

export async function deleteDraft(owner: string): Promise<void> {
  await del("drafts", owner);
}

export const SAVE_DEBOUNCE_MS = 250;

export type DraftHandle = {
  draft: IncidentDraft | null;
  ready: boolean;
  /** Apply a change; written to the phone within 300 ms. Creates the draft if none exists. */
  update: (patch: Partial<IncidentDraft> | ((draft: IncidentDraft) => Partial<IncidentDraft>)) => void;
  /** Write pending changes now (before navigating away or sending). */
  flush: () => Promise<void>;
  discard: () => Promise<void>;
  /** Forget the in-memory copy after it moved to the outbox. */
  release: () => void;
};

/** The open draft for `owner`, kept in memory and mirrored to IndexedDB. */
export function useDraft(owner: string | null, mode: IncidentDraft["mode"], language: Language): DraftHandle {
  const [draft, setDraft] = useState<IncidentDraft | null>(null);
  const [ready, setReady] = useState(false);
  const pending = useRef<IncidentDraft | null>(null);
  const timer = useRef<number | undefined>(undefined);
  const current = useRef<IncidentDraft | null>(null);

  const flush = useCallback(async () => {
    window.clearTimeout(timer.current);
    const value = pending.current;
    pending.current = null;
    if (value) await saveDraft(value);
  }, []);

  useEffect(() => {
    let cancelled = false;
    setReady(false);
    if (!owner) return;
    loadDraft(owner)
      .then((stored) => {
        if (cancelled) return;
        current.current = stored;
        setDraft(stored);
        setReady(true);
      })
      .catch(() => {
        if (!cancelled) setReady(true);
      });
    return () => {
      cancelled = true;
    };
  }, [owner]);

  useEffect(() => {
    const onHide = () => {
      if (document.visibilityState === "hidden") void flush();
    };
    window.addEventListener("pagehide", flush);
    document.addEventListener("visibilitychange", onHide);
    return () => {
      window.removeEventListener("pagehide", flush);
      document.removeEventListener("visibilitychange", onHide);
      void flush();
    };
  }, [flush]);

  const update = useCallback<DraftHandle["update"]>(
    (patch) => {
      if (!owner) return;
      const base = current.current ?? newDraft(owner, mode, language);
      const changes = typeof patch === "function" ? patch(base) : patch;
      const next: IncidentDraft = { ...base, ...changes, updated_at: Date.now() };
      current.current = next;
      setDraft(next);
      pending.current = next;
      window.clearTimeout(timer.current);
      timer.current = window.setTimeout(() => void flush(), SAVE_DEBOUNCE_MS);
    },
    [owner, mode, language, flush],
  );

  const discard = useCallback(async () => {
    window.clearTimeout(timer.current);
    pending.current = null;
    const value = current.current;
    current.current = null;
    setDraft(null);
    if (value) await discardDraft(value);
  }, []);

  const release = useCallback(() => {
    window.clearTimeout(timer.current);
    pending.current = null;
    current.current = null;
    setDraft(null);
  }, []);

  return { draft, ready, update, flush, discard, release };
}
