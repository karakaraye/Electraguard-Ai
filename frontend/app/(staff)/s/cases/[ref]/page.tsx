"use client";

import Link from "next/link";
import { useParams } from "next/navigation";
import { useCallback, useEffect, useRef, useState } from "react";
import { api } from "../../../../../lib/api/client";
import { API_BASE } from "../../../../../lib/api/contracts";
import type { CaseDetail, Category, Message, Outcome, Urgency } from "../../../../../lib/api/types";
import { useT } from "../../../../../lib/i18n/client";
import { ArrowLeftIcon } from "../../../../../ui/icons";
import { CaseView, type CaseConflict, type CaseViewProps, type UnblurResult } from "../../_views/CaseView";
import styles from "../../_views/CaseView.module.css";

type Busy = NonNullable<CaseViewProps["busy"]>;

/** Maps a refused action to the banner the reviewer needs. */
function conflictOf(res: { status: number; error: { code: string } }): CaseConflict {
  const code = res.error.code;
  if (code === "stale_version") return "stale_version";
  if (code === "invalid_transition") return "invalid_transition";
  if (code === "closure_evidence_changed") return "closure_evidence_changed";
  if (res.status === 422 || code === "validation_failed") return "validation";
  if (res.status === 409) return "stale_version";
  return "network";
}

export default function CaseDetailPage() {
  const params = useParams();
  const caseId = (params?.ref as string) || "";
  const t = useT();

  const [caseDetail, setCaseDetail] = useState<CaseDetail | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [messages, setMessages] = useState<Message[] | null>(null);
  const [conflict, setConflict] = useState<CaseConflict | null>(null);
  const [busy, setBusy] = useState<Busy | null>(null);
  const [attempt, setAttempt] = useState(0);
  const objectUrls = useRef<string[]>([]);

  const loadError = useCallback(
    (res: { status: number }) =>
      res.status === 403 ? t("staff.forbidden") : res.status === 404 ? t("s03.errors.notFound") : t("staff.networkError"),
    [t],
  );

  useEffect(() => {
    if (!caseId) return;
    let cancelled = false;
    void (async () => {
      setLoading(true);
      setError(null);
      const res = await api("CASE-01", { params: { id: caseId } });
      if (cancelled) return;
      setLoading(false);
      if (!res.ok) {
        setError(loadError(res));
        return;
      }
      setConflict(null);
      setCaseDetail(res.data);
      const msgs = await api("MSG-01.list", { params: { report_id: caseId } });
      if (!cancelled) setMessages(msgs.ok ? msgs.data.items : []);
    })();
    return () => {
      cancelled = true;
    };
  }, [caseId, attempt, loadError]);

  useEffect(() => {
    const urls = objectUrls.current;
    return () => urls.forEach((url) => URL.revokeObjectURL(url));
  }, []);

  const reload = () => setAttempt((n) => n + 1);

  /** Runs one action; on success reloads the case, on refusal shows why. */
  async function run(kind: Busy, call: () => Promise<{ ok: boolean; status: number; error?: { code: string } }>) {
    setBusy(kind);
    setConflict(null);
    const res = await call();
    setBusy(null);
    if (!res.ok) {
      setConflict(conflictOf(res as { status: number; error: { code: string } }));
      return;
    }
    reload();
  }

  const c = caseDetail;
  const version = c?.version ?? 0;

  async function viewUnblurred(mediaId: string, reason: string): Promise<UnblurResult> {
    try {
      const response = await fetch(`${API_BASE}/media/${mediaId}/content?variant=original`, {
        credentials: "same-origin",
        headers: { "X-Media-Access-Reason": reason },
      });
      if (response.status === 404 || response.status === 409) return { error: "unavailable" };
      if (!response.ok) return { error: "network" };
      const url = URL.createObjectURL(await response.blob());
      objectUrls.current.push(url);
      return { url };
    } catch {
      return { error: "network" };
    }
  }

  return (
    <div className={styles.stack}>
      <div>
        <Link href="/s/queue" className={styles.back}>
          <ArrowLeftIcon size={18} />
          <span>{t("staff.backToQueue")}</span>
        </Link>
      </div>
      <CaseView
        caseData={c}
        loading={loading}
        error={error}
        messages={messages}
        conflict={conflict}
        busy={busy}
        onReload={reload}
        onStartReview={() => c && void run("start", () => api("CASE-02", { params: { id: c.id }, body: { action: "start", version } }))}
        onAskQuestion={(question) => c && void run("ask", () => api("CASE-02", { params: { id: c.id }, body: { action: "ask", question, version } }))}
        onCloseCase={(outcome: Outcome, rationale: string, expected: string[]) =>
          c && void run("close", () => api("CASE-02", { params: { id: c.id }, body: { action: "close", outcome, rationale, expected_media_ids: expected, version } }))
        }
        onAcceptSuggestion={(type) => c && void run("suggestion", () => api("CASE-03", { params: { id: c.id, type }, body: { decision: "accept", version } }))}
        onCorrectSuggestion={(type, value) =>
          c && void run("suggestion", () => api("CASE-03", { params: { id: c.id, type }, body: { decision: "correct", value: value as Category & Urgency, version } }))
        }
        onDuplicateDecision={(otherId, decision) =>
          c && void run("duplicate", () => api("CASE-04", { params: { id: c.id, other_id: otherId }, body: { decision, version } }))
        }
        onSaveRedaction={(spans) => c && void run("redaction", () => api("CASE-05", { params: { id: c.id }, body: { spans, version } }))}
        onSendMessage={(body) => c && void run("message", () => api("MSG-02", { params: { report_id: c.id }, body: { kind: "message", body } }))}
        onViewUnblurred={viewUnblurred}
      />
    </div>
  );
}
