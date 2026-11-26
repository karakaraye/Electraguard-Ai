"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
import { api, uuidv4 } from "../../../../lib/api/client";
import { API_BASE } from "../../../../lib/api/contracts";
import type { Claim, ClaimMatchesResponse, Language } from "../../../../lib/api/types";
import { useT } from "../../../../lib/i18n/client";
import { RumourView, type ClaimSort, type ClaimSourceFilter, type ClaimStatusFilter, type NewClaimFields } from "../_views/RumourView";

type Failure = { status: number; error?: { code?: string } | null };

/** A claim with a picture goes up as a form (the contract table lists JSON only), with the same CSRF and send key rules. */
async function createWithImage(fields: NewClaimFields & { image: File }): Promise<{ ok: true; data: Claim } | ({ ok: false } & Failure)> {
  const csrf = await api("AUTH-01", {});
  if (!csrf.ok) return { ok: false, status: csrf.status, error: csrf.error };
  const form = new FormData();
  if (fields.text) form.set("text", fields.text);
  form.set("seen_on", fields.seenOn);
  form.set("language", fields.language);
  form.set("image", fields.image);
  try {
    const response = await fetch(`${API_BASE}/rumours/claims`, {
      method: "POST",
      credentials: "same-origin",
      headers: { Accept: "application/json", "X-CSRFToken": csrf.data.csrf_token, "Idempotency-Key": uuidv4() },
      body: form,
    });
    const body = (await response.json().catch(() => null)) as (Claim & { error?: { code?: string } }) | null;
    if (response.ok && body) return { ok: true, data: body };
    return { ok: false, status: response.status, error: body?.error ?? null };
  } catch {
    return { ok: false, status: 0, error: { code: "network_error" } };
  }
}

export default function RumoursPage() {
  const t = useT();

  const [claims, setClaims] = useState<Claim[]>([]);
  const [nextCursor, setNextCursor] = useState<string | null>(null);
  const [loadingMore, setLoadingMore] = useState(false);
  const [selectedId, setSelectedId] = useState<string | null>(null);
  /** Similar reports, kept with the claim they were fetched for so a new selection never shows old ones. */
  const [matchesFor, setMatchesFor] = useState<{ id: string; data: ClaimMatchesResponse | null; error: string | null } | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [actionError, setActionError] = useState<string | null>(null);
  const [createError, setCreateError] = useState<string | null>(null);
  const [notice, setNotice] = useState<string | null>(null);
  const [currentUser, setCurrentUser] = useState("");
  const [filter, setFilter] = useState<ClaimStatusFilter>("all");
  const [source, setSource] = useState<ClaimSourceFilter>("all");
  const [sort, setSort] = useState<ClaimSort>("recent");
  const [attempt, setAttempt] = useState(0);
  const query = useMemo(
    () => ({
      ...(filter === "all" ? {} : { status: filter }),
      ...(source === "all" ? {} : { source }),
      ...(sort === "demand" ? { sort } : {}),
    }),
    [filter, source, sort],
  );

  const problem = useCallback(
    (res: Failure): string => {
      const code = res.error?.code;
      if (code === "same_person_approval") return t("s06.errors.samePerson");
      if (res.status === 403) return t("staff.forbidden");
      if (res.status === 404) return t("staff.endpointNotReady");
      if (code === "stale_version") return t("s06.errors.stale");
      if (code === "invalid_transition") return t("s06.errors.transition");
      if (code === "rate_limited") return t("s06.errors.rateLimited");
      if (code === "payload_too_large") return t("s06.errors.imageSize");
      if (code === "unsupported_media_type") return t("s06.errors.imageType");
      if (code === "media_unreadable") return t("s06.errors.imageUnreadable");
      if (res.status === 400 || res.status === 422 || code === "validation_failed" || code === "bad_request") return t("s06.errors.invalid");
      return t("staff.networkError");
    },
    [t],
  );

  useEffect(() => {
    let cancelled = false;
    void (async () => {
      const res = await api("AUTH-07", {});
      if (!cancelled && res.ok && res.data.authenticated && res.data.user) setCurrentUser(res.data.user.display_name || "");
    })();
    return () => {
      cancelled = true;
    };
  }, []);

  useEffect(() => {
    let cancelled = false;
    void (async () => {
      setLoading(true);
      setError(null);
      const res = await api("RUM-01.list", { query });
      if (cancelled) return;
      setLoading(false);
      if (!res.ok) {
        setError(problem(res));
        return;
      }
      setClaims(res.data.items);
      setNextCursor(res.data.next_cursor);
      setSelectedId((current) => (current && res.data.items.some((c) => c.id === current) ? current : null));
    })();
    return () => {
      cancelled = true;
    };
  }, [query, attempt, problem]);

  useEffect(() => {
    if (!selectedId) return;
    let cancelled = false;
    void (async () => {
      const res = await api("RUM-02", { params: { id: selectedId } });
      if (cancelled) return;
      setMatchesFor(res.ok ? { id: selectedId, data: res.data, error: null } : { id: selectedId, data: null, error: t("s06.matches.error") });
    })();
    return () => {
      cancelled = true;
    };
  }, [selectedId, t]);

  const listed = claims.find((c) => c.id === selectedId) ?? null;
  // Only the single-claim read carries the check-in evidence, so it is read for the open claim and kept with its id.
  const [evidence, setEvidence] = useState<{ id: string; items: Claim["checkin_evidence"] } | null>(null);
  const listedAsks = listed?.ask_count;
  useEffect(() => {
    if (!selectedId) return;
    let cancelled = false;
    void api("RUM-01.get", { params: { id: selectedId } }).then((res) => {
      if (!cancelled && res.ok) setEvidence({ id: selectedId, items: res.data.checkin_evidence ?? [] });
    });
    return () => {
      cancelled = true;
    };
  }, [selectedId, listedAsks]);
  const selectedClaim = listed && evidence?.id === listed.id ? { ...listed, checkin_evidence: evidence.items } : listed;
  const current = selectedId && matchesFor?.id === selectedId ? matchesFor : null;
  const matches = current?.data ?? null;
  const matchesError = current?.error ?? null;
  const matchesLoading = Boolean(selectedId) && !current;

  const clearMessages = useCallback(() => {
    setActionError(null);
    setCreateError(null);
    setNotice(null);
  }, []);

  const select = useCallback(
    (id: string) => {
      clearMessages();
      setSelectedId(id);
    },
    [clearMessages],
  );

  async function loadMore() {
    if (!nextCursor) return;
    setLoadingMore(true);
    const res = await api("RUM-01.list", { query: { ...query, cursor: nextCursor } });
    setLoadingMore(false);
    if (!res.ok) {
      setError(problem(res));
      return;
    }
    const known = new Set(claims.map((c) => c.id));
    setClaims([...claims, ...res.data.items.filter((c) => !known.has(c.id))]);
    setNextCursor(res.data.next_cursor);
  }

  async function createClaim(fields: NewClaimFields): Promise<boolean> {
    clearMessages();
    const res = fields.image
      ? await createWithImage({ ...fields, image: fields.image })
      : await api("RUM-01.create", { body: { text: fields.text, seen_on: fields.seenOn, language: fields.language } });
    if (!res.ok) {
      setCreateError(problem(res));
      return false;
    }
    setNotice(t("s06.notice.created"));
    if (filter !== "all" && filter !== "new") setFilter("all");
    else setClaims((current) => [res.data, ...current.filter((c) => c.id !== res.data.id)]);
    setSelectedId(res.data.id);
    return true;
  }

  /** Every action returns the updated claim; the list row is replaced with it. */
  async function change(
    run: () => Promise<{ ok: true; data: Claim } | ({ ok: false } & Failure)>,
    done: string,
  ): Promise<boolean> {
    clearMessages();
    const res = await run();
    if (!res.ok) {
      setActionError(problem(res));
      return false;
    }
    setClaims((current) => current.map((c) => (c.id === res.data.id ? res.data : c)));
    setNotice(done);
    return true;
  }

  const saveDraft = (id: string, text: string, language: Language, version: number) =>
    change(() => api("RUM-03.save_draft", { params: { id }, body: { text, language, version } }), t("s06.notice.saved"));
  const approve = (id: string, version: number) =>
    change(() => api("RUM-03.approve", { params: { id }, body: { version } }), t("s06.notice.approved"));
  const reject = (id: string, note: string, version: number) =>
    change(() => api("RUM-03.reject", { params: { id }, body: { note, version } }), t("s06.notice.rejected"));
  const dismiss = (id: string, note: string, version: number) =>
    change(() => api("RUM-03.dismiss", { params: { id }, body: { note, version } }), t("s06.notice.dismissed"));

  return (
    <RumourView
      claims={claims}
      selectedClaim={selectedClaim}
      matches={matches}
      matchesLoading={matchesLoading}
      matchesError={matchesError}
      loading={loading}
      error={error}
      actionError={actionError}
      createError={createError}
      notice={notice}
      currentUserName={currentUser}
      statusFilter={filter}
      sourceFilter={source}
      sort={sort}
      onSourceFilter={(value) => {
        clearMessages();
        setSource(value);
      }}
      onSort={(value) => {
        clearMessages();
        setSort(value);
      }}
      hasMore={Boolean(nextCursor)}
      loadingMore={loadingMore}
      onStatusFilter={(value) => {
        clearMessages();
        setFilter(value);
      }}
      onLoadMore={() => void loadMore()}
      onRetry={() => setAttempt((n) => n + 1)}
      onSelectClaim={select}
      onCreateClaim={createClaim}
      onSaveDraft={saveDraft}
      onApprove={approve}
      onReject={reject}
      onDismiss={dismiss}
      onClearMessages={clearMessages}
    />
  );
}
