"use client";

import { useCallback, useEffect, useState } from "react";
import { api } from "../../../../lib/api/client";
import type { HideReason, ModerationFlag, StateAreasResponse } from "../../../../lib/api/types";
import { useT } from "../../../../lib/i18n/client";
import {
  DiscussionModView,
  type CreateDiscussionInput,
  type CreateDiscussionResult,
  type ModResult,
} from "../_views/DiscussionModView";

const PAGE_SIZE = 50;

export default function DiscussionModerationPage() {
  const t = useT();

  const [flags, setFlags] = useState<ModerationFlag[]>([]);
  const [cursor, setCursor] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);
  const [loadingMore, setLoadingMore] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [attempt, setAttempt] = useState(0);
  const [areaStates, setAreaStates] = useState<Array<{ state_code: string; name: string }> | null>(null);
  const [areaDetail, setAreaDetail] = useState<Record<string, StateAreasResponse>>({});

  /** Page loads: 403, 404 and everything else each get their own plain sentence. */
  const loadProblem = useCallback(
    (res: { status: number }) =>
      res.status === 403 ? t("staff.forbidden") : res.status === 404 ? t("staff.endpointNotReady") : t("staff.networkError"),
    [t],
  );

  /** Moderation actions: also the codes the backend sends for these calls. */
  const actionProblem = useCallback(
    (res: { status: number; error?: { code?: string } }): ModResult => {
      const code = res.error?.code;
      const message =
        res.status === 403
          ? t("staff.forbidden")
          : code === "discussion_closed"
            ? t("s08.errClosed")
            : res.status === 404
              ? t("s08.errNotFound")
              : res.status === 422 || code === "invalid" || code === "bad_request"
                ? t("s08.errInvalid")
                : t("staff.networkError");
      return { ok: false, message };
    },
    [t],
  );

  useEffect(() => {
    let cancelled = false;
    void (async () => {
      setLoading(true);
      setError(null);
      const res = await api("DIS-05.flags", { query: { status: "open", limit: PAGE_SIZE } });
      if (cancelled) return;
      setLoading(false);
      if (!res.ok) {
        setError(loadProblem(res));
        return;
      }
      setFlags(res.data.items);
      setCursor(res.data.next_cursor ?? null);
    })();
    return () => {
      cancelled = true;
    };
  }, [attempt, loadProblem]);

  async function loadMore() {
    if (!cursor) return;
    setLoadingMore(true);
    const res = await api("DIS-05.flags", { query: { status: "open", limit: PAGE_SIZE, cursor } });
    setLoadingMore(false);
    if (!res.ok) {
      setError(loadProblem(res));
      return;
    }
    const seen = new Set(flags.map((f) => f.post.id));
    setFlags([...flags, ...res.data.items.filter((f) => !seen.has(f.post.id))]);
    setCursor(res.data.next_cursor ?? null);
  }

  async function hidePost(discussionId: string, postId: string, reason: HideReason, note?: string): Promise<ModResult> {
    const res = await api("DIS-05.hide_post", { params: { id: discussionId, post_id: postId }, body: { reason, ...(note ? { note } : {}) } });
    if (!res.ok) return actionProblem(res);
    setFlags((current) =>
      current.map((f) => (f.post.id === postId ? { ...f, post: { ...f.post, state: "hidden", hidden_reason: reason, hidden_body: f.post.body } } : f)),
    );
    return { ok: true };
  }

  async function unhidePost(discussionId: string, postId: string): Promise<ModResult> {
    const res = await api("DIS-05.unhide_post", { params: { id: discussionId, post_id: postId }, body: {} });
    if (!res.ok) return actionProblem(res);
    setFlags((current) =>
      current.map((f) => (f.post.id === postId ? { ...f, post: { ...f.post, state: "visible", hidden_reason: null, hidden_body: null } } : f)),
    );
    return { ok: true };
  }

  async function removeMember(discussionId: string, observerCode: string, reason: string): Promise<ModResult> {
    const res = await api("DIS-05.remove_member", { params: { id: discussionId, observer_code: observerCode }, body: { reason } });
    return res.ok ? { ok: true } : actionProblem(res);
  }

  async function closeDiscussion(discussionId: string): Promise<ModResult> {
    const res = await api("DIS-05.close", { params: { id: discussionId }, body: {} });
    if (!res.ok) return actionProblem(res);
    setFlags((current) => current.filter((f) => f.discussion_id !== discussionId));
    return { ok: true };
  }

  async function createDiscussion(input: CreateDiscussionInput): Promise<CreateDiscussionResult> {
    const scope = input.scope.kind === "ward" ? { ward_code: input.scope.code } : { lga_code: input.scope.code };
    const created = await api("DIS-05.create", { body: { title: input.title, topic: input.topic, ...scope } });
    if (!created.ok) {
      const fields = (created.error as { fields?: Record<string, unknown> } | undefined)?.fields ?? {};
      const message =
        created.status === 403
          ? t("staff.forbidden")
          : "lga_code" in fields || "ward_code" in fields
            ? t("s08.errArea")
            : created.status === 422
              ? t("s08.errInvalid")
              : t("staff.networkError");
      return { ok: false, message };
    }
    if (input.invites.length === 0) return { ok: true, invited: 0, notFound: [] };
    const invite = await api("DIS-05.invite", { params: { id: created.data.discussion.id }, body: { observer_codes: input.invites } });
    if (!invite.ok) {
      // The discussion exists; only the invitations failed.
      return { ok: false, message: invite.status === 422 ? t("s08.errInvalid") : t("staff.networkError") };
    }
    return { ok: true, invited: invite.data.invited.length, notFound: invite.data.not_found };
  }

  /** The state list loads when the create sheet opens; a state's LGAs and wards load when it is chosen. */
  const needAreas = useCallback(
    (stateCode?: string) => {
      if (!stateCode) {
        if (areaStates !== null) return;
        void (async () => {
          const res = await api("REF-01.index", { query: undefined });
          setAreaStates(res.ok ? res.data.states.map((s) => ({ state_code: s.state_code, name: s.name })) : []);
        })();
        return;
      }
      if (areaDetail[stateCode]) return;
      void (async () => {
        const res = await api("REF-01.state", { params: { state_code: stateCode } });
        if (res.ok) setAreaDetail((current) => ({ ...current, [stateCode]: res.data }));
      })();
    },
    [areaStates, areaDetail],
  );

  return (
    <DiscussionModView
      flags={flags}
      loading={loading}
      error={error}
      loadingMore={loadingMore}
      hasMore={cursor !== null}
      onLoadMore={() => void loadMore()}
      onRefresh={() => setAttempt((n) => n + 1)}
      onHidePost={hidePost}
      onUnhidePost={unhidePost}
      onRemoveMember={removeMember}
      onCloseDiscussion={closeDiscussion}
      onCreateDiscussion={createDiscussion}
      areaStates={areaStates}
      areaDetail={areaDetail}
      onNeedAreas={needAreas}
    />
  );
}
