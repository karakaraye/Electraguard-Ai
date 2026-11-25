import type { GuideListResponse, PublicResultsResponse } from "../../../lib/api/types";
import type { Locale } from "../../../lib/i18n";
import type { HomeResults } from "../_views/HomeView";
import { publicGet, type ServerResult } from "./server-api";

/** PUB-02 is public and cacheable for 5 minutes (contract); the page keeps the same window. */
export const RESULTS_REVALIDATE = 300;

export function getResults(locale: Locale): Promise<ServerResult<PublicResultsResponse>> {
  return publicGet<PublicResultsResponse>("/public/results", { language: locale, revalidate: RESULTS_REVALIDATE });
}

export function getGuideList(locale: Locale): Promise<ServerResult<GuideListResponse>> {
  return publicGet<GuideListResponse>("/public/guides", { language: locale, revalidate: RESULTS_REVALIDATE, query: { language: locale } });
}

/** The home summary: the combined totals when several organisations publish, otherwise the one snapshot. */
export function homeResults(result: ServerResult<PublicResultsResponse>): HomeResults {
  if (!result.ok) return { kind: "unavailable" };
  const { snapshots, combined } = result.data;
  if (!snapshots.length) return { kind: "empty" };
  const source = combined ?? snapshots[0];
  return {
    kind: "published",
    total: source.total,
    publishedAt: source.published_at ?? null,
    cutoff: source.cutoff,
    organisations: snapshots.length,
    categories: topCategories(source.by_state),
  };
}

/**
 * The three largest categories summed across states (spec screen 32). A category with any
 * suppressed cell is left out, so a small number hidden in one state is never implied by a sum.
 */
export function topCategories(byState: PublicResultsResponse["snapshots"][number]["by_state"]): Array<{ category: string; count: number }> {
  const sums = new Map<string, number>();
  const hidden = new Set<string>();
  for (const state of byState) {
    for (const [category, cell] of Object.entries(state.by_category)) {
      if (!cell) continue;
      if (cell.suppressed) hidden.add(category);
      else sums.set(category, (sums.get(category) ?? 0) + cell.count);
    }
  }
  return [...sums.entries()]
    .filter(([category]) => !hidden.has(category))
    .map(([category, count]) => ({ category, count }))
    .sort((a, b) => b.count - a.count)
    .slice(0, 3);
}
