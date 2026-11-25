"use client";

import { useEffect, useState } from "react";
import type { HideReason, ModerationFlag } from "../../../../../lib/api/types";
import { useT } from "../../../../../lib/i18n/client";
import { DiscussionModView, type ModResult } from "../../../../(staff)/s/_views/DiscussionModView";
import { S08_AREA_DETAIL, S08_AREA_STATES, S08_FLAGS, S08_HIDDEN_FLAG } from "./s08.fixtures";

/** Screen 45 (S-08) preview states. Each state is one screenshot. */
export const states = [
  "default",
  "name_detected",
  "hidden",
  "loading",
  "empty",
  "error",
  "forbidden",
  "not_ready",
  "hide_sheet",
  "hide_done",
  "remove_sheet",
  "close_sheet",
  "close_closed",
  "create_sheet",
  "create_filled",
] as const;

/** Presses the named controls one after another, the way a person would. Preview only. */
function useScript(steps: string[]) {
  const key = steps.join("|");
  useEffect(() => {
    let cancelled = false;
    const list = key ? key.split("|") : [];
    (async () => {
      for (const step of list) {
        for (let tries = 0; tries < 40 && !cancelled; tries += 1) {
          const el = document.querySelector<HTMLElement>(`[data-testid="${step}"]`);
          if (el) {
            el.click();
            break;
          }
          await new Promise((r) => setTimeout(r, 100));
        }
        await new Promise((r) => setTimeout(r, 350));
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [key]);
}

function setNative(el: HTMLInputElement | HTMLTextAreaElement | HTMLSelectElement, value: string) {
  const proto = Object.getPrototypeOf(el) as object;
  Object.getOwnPropertyDescriptor(proto, "value")?.set?.call(el, value);
  el.dispatchEvent(new Event(el instanceof HTMLSelectElement ? "change" : "input", { bubbles: true }));
}

/** Fills the create sheet like a moderator would. Preview only. */
function useFillCreate(on: boolean) {
  useEffect(() => {
    if (!on) return;
    let cancelled = false;
    (async () => {
      const wait = (ms: number) => new Promise((r) => setTimeout(r, ms));
      const until = async <T,>(get: () => T | null) => {
        for (let i = 0; i < 60 && !cancelled; i += 1) {
          const v = get();
          if (v) return v;
          await wait(100);
        }
        return null;
      };
      const sheet = await until(() => document.querySelector<HTMLElement>('[data-testid="s08-create-sheet"]'));
      if (!sheet) return;
      const inputs = () => sheet.querySelectorAll<HTMLInputElement>("input");
      const areas = () => sheet.querySelectorAll<HTMLTextAreaElement>("textarea");
      const selects = () => sheet.querySelectorAll<HTMLSelectElement>("select");
      const title = await until(() => inputs()[0] ?? null);
      if (title) setNative(title, "Dala market observers: morning queue");
      const topic = await until(() => areas()[0] ?? null);
      if (topic) setNative(topic, "Share what you see at the market polling units. Keep names and exact places out of your posts.");
      const state = await until(() => (selects()[0] && selects()[0].options.length > 1 ? selects()[0] : null));
      if (state) setNative(state, "KN");
      const lga = await until(() => (selects()[1] && selects()[1].options.length > 1 ? selects()[1] : null));
      if (lga) setNative(lga, "1901");
      const ward = await until(() => (selects()[2] && selects()[2].options.length > 1 ? selects()[2] : null));
      if (ward) setNative(ward, "190101");
      const invites = areas()[1];
      if (invites) setNative(invites, "OBS-3M9Q4T\nOBS-8RD2KC\nOBS-7K2P9X");
    })();
    return () => {
      cancelled = true;
    };
  }, [on]);
}

export function Preview({ state }: { state: string }) {
  const t = useT();
  const [flags, setFlags] = useState<ModerationFlag[]>(() =>
    state === "empty" || state === "loading" || state === "error" || state === "forbidden" || state === "not_ready"
      ? []
      : state === "hidden"
        ? [S08_HIDDEN_FLAG, ...S08_FLAGS.slice(0, 2)]
        : state === "name_detected"
          ? [S08_FLAGS[0]]
          : S08_FLAGS,
  );

  const script =
    state === "hide_sheet" ? ["s08-hide-post-name"]
      : state === "hide_done" ? ["s08-hide-post-name", "s08-hide-confirm"]
        : state === "remove_sheet" ? ["s08-remove-post-name"]
          : state === "close_sheet" || state === "close_closed" ? ["s08-close-post-place"]
            : state === "create_sheet" || state === "create_filled" ? ["s08-create"]
              : [];
  useScript(state === "close_closed" ? [...script, "s08-close-confirm"] : script);
  useFillCreate(state === "create_filled");

  const done = () => new Promise<ModResult>((r) => setTimeout(() => r({ ok: true }), 150));

  const error =
    state === "error" ? t("staff.networkError")
      : state === "forbidden" ? t("staff.forbidden")
        : state === "not_ready" ? t("staff.endpointNotReady")
          : null;

  return (
    <DiscussionModView
      flags={flags}
      loading={state === "loading"}
      error={error}
      onRefresh={() => undefined}
      onHidePost={async (_d, postId, reason: HideReason) => {
        await done();
        setFlags((cur) =>
          cur.map((f) => (f.post.id === postId ? { ...f, post: { ...f.post, state: "hidden", hidden_reason: reason, hidden_body: f.post.body } } : f)),
        );
        return { ok: true };
      }}
      onUnhidePost={async (_d, postId) => {
        await done();
        setFlags((cur) => cur.map((f) => (f.post.id === postId ? { ...f, post: { ...f.post, state: "visible", hidden_reason: null, body: f.post.hidden_body ?? f.post.body } } : f)));
        return { ok: true };
      }}
      onRemoveMember={() => done()}
      onCloseDiscussion={async () => (state === "close_closed" ? { ok: false, message: t("s08.errClosed") } : done())}
      onCreateDiscussion={async () => ({ ok: true, invited: 2, notFound: ["OBS-7K2P9X"] })}
      areaStates={S08_AREA_STATES}
      areaDetail={S08_AREA_DETAIL}
    />
  );
}
