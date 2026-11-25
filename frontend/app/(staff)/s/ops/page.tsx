"use client";

import { useCallback, useEffect, useState } from "react";
import { api } from "../../../../lib/api/client";
import type { ChecklistStage, Cluster, CoverageResponse, LateMaterialsResponse, OverviewResponse } from "../../../../lib/api/types";
import { useT } from "../../../../lib/i18n/client";
import { watParts } from "../../../../ui/hooks";
import { OpsView, type Section } from "../_views/OpsView";

/** The ops room refreshes itself while it is on screen. */
const REFRESH_MS = 60_000;

const idle = <T,>(): Section<T> => ({ data: null, loading: true, error: null });

export default function OpsPage() {
  const t = useT();
  const [today] = useState(() => watParts(Date.now()).date);
  const [date, setDate] = useState(today);
  const [stage, setStage] = useState<ChecklistStage>("opening");
  const [overview, setOverview] = useState<Section<OverviewResponse>>(idle);
  const [clusters, setClusters] = useState<Section<Cluster[]>>(idle);
  const [coverage, setCoverage] = useState<Section<CoverageResponse>>(idle);
  const [late, setLate] = useState<Section<LateMaterialsResponse>>(idle);
  const [reviewing, setReviewing] = useState<string | null>(null);
  const [tick, setTick] = useState(0);

  const problem = useCallback(
    (res: { status: number }) =>
      res.status === 403 ? t("staff.forbidden") : res.status === 404 ? t("staff.endpointNotReady") : t("staff.networkError"),
    [t],
  );

  // Each section loads and fails on its own; earlier data stays while a refresh runs.
  useEffect(() => {
    let cancelled = false;
    const keep = <T,>(set: (fn: (s: Section<T>) => Section<T>) => void) => set((s) => ({ ...s, loading: true }));
    keep(setOverview);
    keep(setClusters);
    keep(setLate);
    void api("OPS-01", { query: { from: date, to: date } }).then((res) => {
      if (!cancelled) setOverview(res.ok ? { data: res.data, loading: false, error: null } : (s) => ({ ...s, loading: false, error: problem(res) }));
    });
    void api("OPS-02.list", { query: {} }).then((res) => {
      if (!cancelled) setClusters(res.ok ? { data: res.data.items, loading: false, error: null } : (s) => ({ ...s, loading: false, error: problem(res) }));
    });
    void api("OPS-04", {}).then((res) => {
      if (!cancelled) setLate(res.ok ? { data: res.data, loading: false, error: null } : (s) => ({ ...s, loading: false, error: problem(res) }));
    });
    return () => {
      cancelled = true;
    };
  }, [date, tick, problem]);

  useEffect(() => {
    let cancelled = false;
    void api("OPS-03", { query: { date, stage } }).then((res) => {
      if (!cancelled) setCoverage(res.ok ? { data: res.data, loading: false, error: null } : (s) => ({ ...s, loading: false, error: problem(res) }));
    });
    return () => {
      cancelled = true;
    };
  }, [date, stage, tick, problem]);

  useEffect(() => {
    const id = window.setInterval(() => {
      if (document.visibilityState === "visible") setTick((n) => n + 1);
    }, REFRESH_MS);
    return () => window.clearInterval(id);
  }, []);

  async function review(id: string, note?: string) {
    setReviewing(id);
    const res = await api("OPS-02.review", { params: { id }, body: note ? { note } : {} });
    setReviewing(null);
    if (res.ok) setTick((n) => n + 1);
    else setClusters((s) => ({ ...s, error: problem(res) }));
  }

  return (
    <OpsView
      date={date}
      today={today}
      onDateChange={setDate}
      stage={stage}
      onStageChange={setStage}
      overview={overview}
      clusters={clusters}
      coverage={coverage}
      lateMaterials={late}
      reviewing={reviewing}
      onReviewCluster={(id, note) => void review(id, note)}
      onRefresh={() => setTick((n) => n + 1)}
    />
  );
}
