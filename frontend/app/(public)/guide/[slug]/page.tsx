import type { Metadata } from "next";
import type { GuideDocument } from "../../../../lib/api/types";
import { getT } from "../../../../lib/i18n/server";
import { RESULTS_REVALIDATE } from "../../_lib/data";
import { publicGet } from "../../_lib/server-api";
import { GuideDocumentView, type GuideDocState } from "../../_views/GuideViews";

const SLUG = /^[a-z0-9][a-z0-9-]{0,80}$/;

async function load(slug: string, language: string): Promise<GuideDocState> {
  if (!SLUG.test(slug)) return { kind: "not_found" };
  const result = await publicGet<GuideDocument>(`/public/guides/${slug}`, { language, revalidate: RESULTS_REVALIDATE, query: { language } });
  if (result.ok) return { kind: "ok", data: result.data };
  return result.status === 404 ? { kind: "not_found" } : { kind: "error" };
}

export async function generateMetadata({ params }: { params: Promise<{ slug: string }> }): Promise<Metadata> {
  const { t, locale } = await getT();
  const state = await load((await params).slug, locale);
  return { title: state.kind === "ok" ? state.data.title : t("p05.title") };
}

/** P-05 one approved guide (GUIDE-01 get). */
export default async function GuidePage({ params }: { params: Promise<{ slug: string }> }) {
  const { t, locale } = await getT();
  const state = await load((await params).slug, locale);
  return <GuideDocumentView t={t} locale={locale} state={state} />;
}
