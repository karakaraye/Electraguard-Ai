import type { Metadata } from "next";
import { getT } from "../../../lib/i18n/server";
import { getResults } from "../_lib/data";
import { ResultsView, type ResultsState } from "../_views/ResultsView";

export async function generateMetadata(): Promise<Metadata> {
  const { t } = await getT();
  return { title: t("p03.title"), description: t("results.notice") };
}

/** P-03 transparency results (PUB-02), server rendered as plain tables. */
export default async function ResultsPage({ searchParams }: { searchParams: Promise<{ view?: string }> }) {
  const { t, locale } = await getT();
  const { view } = await searchParams;
  const result = await getResults(locale);
  const state: ResultsState = !result.ok
    ? { kind: "error" }
    : result.data.snapshots.length === 0
      ? { kind: "empty" }
      : { kind: "ok", data: result.data, view };
  return <ResultsView t={t} locale={locale} state={state} />;
}
