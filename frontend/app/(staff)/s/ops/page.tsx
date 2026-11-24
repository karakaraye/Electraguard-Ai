"use client";

import { useEffect, useState } from "react";
import { api } from "../../../../lib/api/client";
import type {
  Cluster,
  CoverageResponse,
  LateMaterialsResponse,
  OverviewResponse,
} from "../../../../lib/api/types";
import { useT } from "../../../../lib/i18n/client";
import { OpsView } from "../_views/OpsView";

export default function OpsPage() {
  const t = useT();

  const [overview, setOverview] = useState<OverviewResponse | null>(null);
  const [clusters, setClusters] = useState<Cluster[]>([]);
  const [coverage, setCoverage] = useState<CoverageResponse | null>(null);
  const [lateMaterials, setLateMaterials] = useState<LateMaterialsResponse | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    let cancelled = false;
    void (async () => {
      try {
        const [resOverview, resClusters, resCoverage, resLate] = await Promise.allSettled([
          api("OPS-01", {}),
          api("OPS-02.list", {}),
          api("OPS-03", {}),
          api("OPS-04", {}),
        ]);

        if (cancelled) return;

        let has404 = false;

        if (resOverview.status === "fulfilled") {
          if (resOverview.value.ok) setOverview(resOverview.value.data);
          else if (resOverview.value.status === 404) has404 = true;
        }

        if (resClusters.status === "fulfilled") {
          if (resClusters.value.ok) setClusters(resClusters.value.data.items);
          else if (resClusters.value.status === 404) has404 = true;
        }

        if (resCoverage.status === "fulfilled") {
          if (resCoverage.value.ok) setCoverage(resCoverage.value.data);
          else if (resCoverage.value.status === 404) has404 = true;
        }

        if (resLate.status === "fulfilled") {
          if (resLate.value.ok) setLateMaterials(resLate.value.data);
          else if (resLate.value.status === 404) has404 = true;
        }

        if (has404 && !overview) {
          setError(t("staff.endpointNotReady"));
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
  }, [t, overview]);

  const handleReviewCluster = async (id: string, note?: string) => {
    try {
      const res = await api("OPS-02.review", {
        params: { id },
        body: note ? { note } : {},
      });
      if (res.ok) {
        setClusters(clusters.map((c) => (c.id === id ? { ...c, status: "reviewed" } : c)));
      }
    } catch {
      // Ignored
    }
  };

  return (
    <OpsView
      overview={overview}
      clusters={clusters}
      coverage={coverage}
      lateMaterials={lateMaterials}
      loading={loading}
      error={error}
      onReviewCluster={handleReviewCluster}
    />
  );
}
