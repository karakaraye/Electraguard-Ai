"use client";

import Link from "next/link";
import { useParams, useRouter } from "next/navigation";
import { useEffect, useState } from "react";
import { api } from "../../../../../lib/api/client";
import type {
  CaseDetail,
  Category,
  Channel,
  Outcome,
  QueueResponse,
  ReportStatus,
  Urgency,
} from "../../../../../lib/api/types";
import { useT } from "../../../../../lib/i18n/client";
import { Button } from "../../../../../ui";
import { ArrowLeftIcon } from "../../../../../ui/icons";
import { QueueSplit } from "../../_components/QueueSplit";
import { CaseView } from "../../_views/CaseView";
import { QueueView, type QueueFilters } from "../../_views/QueueView";

export default function CaseDetailPage() {
  const params = useParams();
  const caseId = (params?.ref as string) || "";
  const router = useRouter();
  const t = useT();

  // Queue state for split view
  const [queueData, setQueueData] = useState<QueueResponse | null>(null);
  const [queueLoading, setQueueLoading] = useState(false);
  const [filters, setFilters] = useState<QueueFilters>({});

  // Case state
  const [caseDetail, setCaseDetail] = useState<CaseDetail | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  // Load queue for split view
  useEffect(() => {
    let cancelled = false;
    void (async () => {
      setQueueLoading(true);
      try {
        const res = await api("Q-01", {
          query: {
            urgency: filters.urgency ? [filters.urgency as Urgency] : undefined,
            status: filters.status ? [filters.status as ReportStatus] : undefined,
            category: filters.category ? [filters.category as Category] : undefined,
            channel: filters.channel ? [filters.channel as Channel] : undefined,
            has_evidence: filters.hasEvidence,
          },
        });
        if (!cancelled && res.ok) {
          setQueueData(res.data);
        }
      } catch {
        // Ignored
      } finally {
        if (!cancelled) setQueueLoading(false);
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [filters]);

  // Load case detail
  useEffect(() => {
    if (!caseId) return;
    let cancelled = false;
    void (async () => {
      try {
        const res = await api("CASE-01", { params: { id: caseId } });
        if (cancelled) return;
        if (!res.ok) {
          if (res.status === 404) {
            setError(t("staff.endpointNotReady"));
          } else {
            setError(res.error?.message || t("staff.networkError"));
          }
          return;
        }
        setCaseDetail(res.data);
      } catch {
        if (!cancelled) setError(t("staff.networkError"));
      } finally {
        if (!cancelled) setLoading(false);
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [caseId, t]);

  const refreshCase = async () => {
    if (!caseId) return;
    try {
      const res = await api("CASE-01", { params: { id: caseId } });
      if (res.ok) setCaseDetail(res.data);
    } catch {
      // Ignored
    }
  };

  // Actions
  const handleStartReview = async () => {
    if (!caseDetail) return;
    try {
      const res = await api("CASE-02", {
        params: { id: caseDetail.id },
        body: { action: "start", version: caseDetail.version },
      });
      if (res.ok) {
        refreshCase();
      }
    } catch {
      // Ignored
    }
  };

  const handleAskQuestion = async (question: string) => {
    if (!caseDetail) return;
    try {
      const res = await api("CASE-02", {
        params: { id: caseDetail.id },
        body: { action: "ask", question, version: caseDetail.version },
      });
      if (res.ok) {
        refreshCase();
      }
    } catch {
      // Ignored
    }
  };

  const handleCloseCase = async (outcome: Outcome, rationale: string, expectedMediaIds: string[]) => {
    if (!caseDetail) return;
    try {
      const res = await api("CASE-02", {
        params: { id: caseDetail.id },
        body: {
          action: "close",
          outcome,
          rationale,
          expected_media_ids: expectedMediaIds,
          version: caseDetail.version,
        },
      });
      if (res.ok) {
        refreshCase();
      }
    } catch {
      // Ignored
    }
  };

  const handleAcceptSuggestion = async (type: "category" | "urgency") => {
    if (!caseDetail) return;
    try {
      const res = await api("CASE-03", {
        params: { id: caseDetail.id, type },
        body: { decision: "accept", version: caseDetail.version },
      });
      if (res.ok) {
        refreshCase();
      }
    } catch {
      // Ignored
    }
  };

  const handleCorrectSuggestion = async (type: "category" | "urgency", value: string) => {
    if (!caseDetail) return;
    try {
      const res = await api("CASE-03", {
        params: { id: caseDetail.id, type },
        body: {
          decision: "correct",
          value: value as Category & Urgency,
          version: caseDetail.version,
        },
      });
      if (res.ok) {
        refreshCase();
      }
    } catch {
      // Ignored
    }
  };

  const handleDuplicateDecision = async (otherId: string, decision: "link" | "keep_separate") => {
    if (!caseDetail) return;
    try {
      const res = await api("CASE-04", {
        params: { id: caseDetail.id, other_id: otherId },
        body: { decision, version: caseDetail.version },
      });
      if (res.ok) {
        refreshCase();
      }
    } catch {
      // Ignored
    }
  };

  const handleSaveRedaction = async (spans: Array<{ start: number; end: number }>) => {
    if (!caseDetail) return;
    try {
      const res = await api("CASE-05", {
        params: { id: caseDetail.id },
        body: { spans, version: caseDetail.version },
      });
      if (res.ok) {
        refreshCase();
      }
    } catch {
      // Ignored
    }
  };

  const listView = (
    <QueueView
      data={queueData}
      loading={queueLoading}
      error={null}
      selectedId={caseId}
      filters={filters}
      onFilterChange={setFilters}
      onSelectCase={(id) => {
        router.push(`/s/cases/${id}`);
      }}
    />
  );

  const detailView = (
    <div>
      <div style={{ marginBottom: "var(--s-3)" }}>
        <Link href="/s/queue" style={{ textDecoration: "none" }}>
          <Button variant="quiet">
            <ArrowLeftIcon size={16} />
            <span>{t("staff.backToQueue")}</span>
          </Button>
        </Link>
      </div>
      <CaseView
        caseData={caseDetail}
        loading={loading}
        error={error}
        onStartReview={handleStartReview}
        onAskQuestion={handleAskQuestion}
        onCloseCase={handleCloseCase}
        onAcceptSuggestion={handleAcceptSuggestion}
        onCorrectSuggestion={handleCorrectSuggestion}
        onDuplicateDecision={handleDuplicateDecision}
        onSaveRedaction={handleSaveRedaction}
      />
    </div>
  );

  return <QueueSplit list={listView} detail={detailView} focus="detail" />;
}
