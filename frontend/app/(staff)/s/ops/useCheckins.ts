"use client";

/** Data and actions for the operations room's Check-ins tab: NOT-01 to NOT-03, NOT-06 and the area lists (REF-01). */

import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { api, uuidv4 } from "../../../../lib/api/client";
import type { CoordinatorNotice, NoticeQuestion, NoticeResultsResponse, StateAreasResponse } from "../../../../lib/api/types";
import { useT } from "../../../../lib/i18n/client";
import type { ComposeValues, Places, Section } from "../_views/CheckinsView";

const REFRESH_MS = 30_000;
const idle = <T,>(): Section<T> => ({ data: null, loading: true, error: null });

type Failure = { status: number; error?: { code?: string; reasons?: string[] } | null };

export function useCheckins(active: boolean) {
  const t = useT();
  const [notices, setNotices] = useState<Section<CoordinatorNotice[]>>(idle);
  const [questions, setQuestions] = useState<NoticeQuestion[]>([]);
  const [places, setPlaces] = useState<Places>({ lgas: [], wards: [], names: {} });
  const [results, setResults] = useState<Section<NoticeResultsResponse>>({ data: null, loading: false, error: null });
  const [selectedId, setSelectedId] = useState<string | null>(null);
  const selectedRef = useRef<string | null>(null);
  useEffect(() => {
    selectedRef.current = selectedId;
  }, [selectedId]);
  const [currentUser, setCurrentUser] = useState("");
  const [serverReasons, setServerReasons] = useState<string[]>([]);
  const [composeError, setComposeError] = useState<string | null>(null);
  const [actionError, setActionError] = useState<string | null>(null);
  const [message, setMessage] = useState<string | null>(null);
  const [tick, setTick] = useState(0);
  // One send key per notice being written: a retry after a dropped connection must not send twice.
  const sendKey = useRef(uuidv4());

  const problem = useCallback(
    (res: Failure): string => {
      const code = res.error?.code;
      if (code === "same_person_approval") return t("notice.errors.samePerson");
      if (res.status === 403) return t("staff.forbidden");
      if (res.status === 404) return t("staff.endpointNotReady");
      if (code === "conflict") return t("notice.errors.conflict");
      if (res.status === 400 || res.status === 422) return t("notice.errors.invalid");
      return t("staff.networkError");
    },
    [t],
  );

  // Who is signed in, the fixed questions, and the places a notice can go to.
  const placesLoaded = useRef(false);
  useEffect(() => {
    if (!active || placesLoaded.current) return;
    placesLoaded.current = true;
    void (async () => {
      const me = await api("AUTH-07", {});
      // The server names a notice's writer by full name, or by email when the account has no name.
      if (me.ok && me.data.authenticated && me.data.user) setCurrentUser(me.data.user.display_name || me.data.user.email || "");
      const list = await api("NOT-06", {});
      if (list.ok) setQuestions(list.data.items);
      const index = await api("REF-01.index", {});
      if (!index.ok) return;
      const states = await Promise.all(index.data.states.slice(0, 12).map((s) => api("REF-01.state", { params: { state_code: s.state_code } })));
      const lgas: Places["lgas"] = [];
      const wards: Places["wards"] = [];
      const names: Places["names"] = {};
      for (const state of states) {
        if (!state.ok) continue;
        const data: StateAreasResponse = state.data;
        for (const lga of data.lgas) {
          lgas.push({ value: lga.lga_code, label: `${lga.name}, ${data.name}` });
          names[lga.lga_code] = lga.name;
          for (const ward of lga.wards) {
            wards.push({ value: ward.ward_code, label: `${ward.name}, ${lga.name}` });
            names[ward.ward_code] = ward.name;
            for (const [code, name] of ward.units) names[code] = name;
          }
        }
      }
      setPlaces({ lgas, wards, names });
    })();
  }, [active]);

  useEffect(() => {
    let cancelled = false;
    void api("NOT-03.list", {}).then((res) => {
      if (cancelled) return;
      if (res.ok) {
        setNotices({ data: res.data.items, loading: false, error: null });
        setSelectedId((current) => current ?? res.data.items[0]?.id ?? null);
      } else setNotices((s) => ({ ...s, loading: false, error: problem(res) }));
    });
    return () => {
      cancelled = true;
    };
  }, [tick, problem]);

  const selected = notices.data?.find((n) => n.id === selectedId) ?? null;
  const selectedStatus = selected?.status ?? null;
  useEffect(() => {
    if (!selectedId || selectedStatus === "pending_approval") return;
    let cancelled = false;
    void api("NOT-03.results", { params: { id: selectedId } }).then((res) => {
      if (cancelled) return;
      setResults(res.ok ? { data: res.data, loading: false, error: null } : (s) => ({ ...s, loading: false, error: problem(res) }));
    });
    return () => {
      cancelled = true;
    };
  }, [selectedId, selectedStatus, tick, problem]);

  useEffect(() => {
    if (!active) return;
    const id = window.setInterval(() => {
      if (document.visibilityState === "visible") setTick((n) => n + 1);
    }, REFRESH_MS);
    return () => window.clearInterval(id);
  }, [active]);

  const select = useCallback((id: string) => {
    // Choosing the notice that is already open must not blank its results: the loader only reruns when the id changes.
    if (id === selectedRef.current) return;
    setResults({ data: null, loading: true, error: null });
    setActionError(null);
    setSelectedId(id);
  }, []);

  async function create(body: Parameters<typeof api<"NOT-01">>[1]["body"], key: string): Promise<{ ok: true; id: string; status: string } | ({ ok: false } & Failure)> {
    const res = await api("NOT-01", { body, idempotency_key: key });
    return res.ok ? { ok: true, id: res.data.id, status: res.data.status } : { ok: false, status: res.status, error: res.error };
  }

  async function send(values: ComposeValues): Promise<boolean> {
    setComposeError(null);
    setServerReasons([]);
    setMessage(null);
    const res = await create(
      {
        scope: { kind: values.scopeKind, code: values.scopeCode },
        type: values.type,
        text: values.text,
        ...(values.mode === "question" && values.questionId ? { question_id: values.questionId } : {}),
        expires_in_minutes: values.minutes,
      },
      sendKey.current,
    );
    if (!res.ok) {
      if (res.error?.code === "blocked_content" || res.error?.reasons) {
        setServerReasons(res.error?.reasons ?? []);
        setComposeError(t("notice.errors.blocked"));
      } else setComposeError(problem(res));
      return false;
    }
    sendKey.current = uuidv4();
    setMessage(res.status === "pending_approval" ? t("notice.sentForApproval") : t("notice.sent"));
    setSelectedId(res.id);
    setResults({ data: null, loading: true, error: null });
    setTick((n) => n + 1);
    return true;
  }

  async function decide(run: () => Promise<{ ok: true } | ({ ok: false } & Failure)>, done: string): Promise<boolean> {
    setActionError(null);
    setMessage(null);
    const res = await run();
    if (!res.ok) {
      setActionError(problem(res));
      return false;
    }
    setMessage(done);
    setTick((n) => n + 1);
    return true;
  }

  const approve = (id: string) =>
    decide(async () => {
      const res = await api("NOT-02.approve", { params: { id }, body: {} });
      return res.ok ? { ok: true } : { ok: false, status: res.status, error: res.error };
    }, t("notice.approved"));
  const reject = (id: string, note: string) =>
    decide(async () => {
      const res = await api("NOT-02.reject", { params: { id }, body: { note } });
      return res.ok ? { ok: true } : { ok: false, status: res.status, error: res.error };
    }, t("notice.rejected"));
  const askAgain = (notice: CoordinatorNotice) =>
    decide(async () => {
      const minutes = Math.min(1440, Math.max(15, Math.round((Date.parse(notice.expires_at) - Date.parse(notice.created_at)) / 60000)));
      const res = await create(
        {
          scope: notice.scope,
          type: notice.type,
          text: notice.text,
          ...(notice.question ? { question_id: notice.question.id } : {}),
          expires_in_minutes: minutes,
        },
        uuidv4(),
      );
      if (res.ok) setSelectedId(res.id);
      return res.ok ? { ok: true } : res;
    }, t("notice.sentAgain"));

  const waiting = useMemo(() => (notices.data ?? []).filter((n) => n.status === "pending_approval").length, [notices.data]);

  return {
    waiting,
    viewProps: {
      places,
      questions,
      notices,
      selectedId,
      onSelect: select,
      results,
      currentUser,
      serverReasons,
      composeError,
      message,
      actionError,
      onSend: send,
      onTextChange: () => {
        setServerReasons([]);
        setComposeError(null);
      },
      onApprove: approve,
      onReject: reject,
      onAskAgain: askAgain,
    },
  };
}
