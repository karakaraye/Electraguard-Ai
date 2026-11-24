"use client";

import { useRouter } from "next/navigation";
import { useEffect, useState } from "react";
import { api } from "../../../../lib/api/client";
import type {
  CaseDetail,
  Category,
  Channel,
  Outcome,
  QueueResponse,
  ReportStatus,
  Urgency,
} from "../../../../lib/api/types";
import { useT } from "../../../../lib/i18n/client";
import { QueueSplit } from "../_components/QueueSplit";
import { CaseView } from "../_views/CaseView";
import { QueueView, type QueueFilters } from "../_views/QueueView";

export default function QueuePage() {
  const router = useRouter();
  const t = useT();

  const [queueData, setQueueData] = useState<QueueResponse | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [filters, setFilters] = useState<QueueFilters>({});

  // Split view selected case state
  const [selectedCaseId, setSelectedCaseId] = useState<string | null>(null);
  const [caseDetail, setCaseDetail] = useState<CaseDetail | null>(null);
  const [caseLoading, setCaseLoading] = useState(false);
  const [caseError, setCaseError] = useState<string | null>(null);

  // Fetch queue
  useEffect(() => {
    let cancelled = false;
    void (async () => {
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

        if (cancelled) return;
        if (!res.ok) {
          if (res.status === 404) {
            setError(t("staff.endpointNotReady"));
          } else {
            setError(res.error?.message || t("staff.networkError"));
          }
          return;
        }

        setQueueData(res.data);
        if (!selectedCaseId && res.data.items.length > 0) {
          setSelectedCaseId(res.data.items[0].id);
        }
      } catch {
        if (!cancelled) setError(t("staff.networkError"));
      } finally {
        if (!cancelled) setLoading(false);
      }
    })();

    return () => {
      cancelled = true;
    };
  }, [filters, selectedCaseId, t]);

  // Load selected case detail
  useEffect(() => {
    if (!selectedCaseId) {
      return;
    }
    let cancelled = false;
    void (async () => {
      setCaseLoading(true);
      try {
        const res = await api("CASE-01", { params: { id: selectedCaseId } });
        if (cancelled) return;
        if (!res.ok) {
          if (res.status === 404) {
            setCaseError(t("staff.endpointNotReady"));
          } else {
            setCaseError(res.error?.message || t("staff.networkError"));
          }
          return;
        }
        setCaseDetail(res.data);
      } catch {
        if (!cancelled) setCaseError(t("staff.networkError"));
      } finally {
        if (!cancelled) setCaseLoading(false);
      }
    })();

    return () => {
      cancelled = true;
    };
  }, [selectedCaseId, t]);

  const refreshCase = async (id: string) => {
    try {
      const res = await api("CASE-01", { params: { id } });
      if (res.ok) setCaseDetail(res.data);
    } catch {
      // Ignored
    }
  };

  // Case actions
  const handleStartReview = async () => {
    if (!caseDetail) return;
    try {
      const res = await api("CASE-02", {
        params: { id: caseDetail.id },
        body: { action: "start", version: caseDetail.version },
      });
      if (res.ok) {
        refreshCase(caseDetail.id);
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
        refreshCase(caseDetail.id);
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
        refreshCase(caseDetail.id);
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
        refreshCase(caseDetail.id);
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
        refreshCase(caseDetail.id);
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
        refreshCase(caseDetail.id);
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
        refreshCase(caseDetail.id);
      }
    } catch {
      // Ignored
    }
  };

  const listView = (
    <QueueView
      data={queueData}
      loading={loading}
      error={error}
      selectedId={selectedCaseId}
      filters={filters}
      onFilterChange={setFilters}
      onSelectCase={(id) => {
        setSelectedCaseId(id);
        if (typeof window !== "undefined" && window.innerWidth < 900) {
          router.push(`/s/cases/${id}`);
        }
      }}
    />
  );

  const detailView = (
    <CaseView
      caseData={caseDetail}
      loading={caseLoading}
      error={caseError}
      onStartReview={handleStartReview}
      onAskQuestion={handleAskQuestion}
      onCloseCase={handleCloseCase}
      onAcceptSuggestion={handleAcceptSuggestion}
      onCorrectSuggestion={handleCorrectSuggestion}
      onDuplicateDecision={handleDuplicateDecision}
      onSaveRedaction={handleSaveRedaction}
    />
  );

  return <QueueSplit list={listView} detail={detailView} focus="list" />;
}
