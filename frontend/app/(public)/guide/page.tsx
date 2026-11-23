import type { Metadata } from "next";
import { getT } from "../../../lib/i18n/server";
import { getGuideList } from "../_lib/data";
import { GuideIndexView } from "../_views/GuideViews";

export async function generateMetadata(): Promise<Metadata> {
  const { t } = await getT();
  return { title: t("p05.title") };
}

/** P-05 guide list (GUIDE-01 list). A missing endpoint (404) is the same honest empty state as no documents. */
export default async function GuideIndexPage() {
  const { t, locale } = await getT();
  const result = await getGuideList(locale);
  const state = result.ok
    ? { kind: "ok" as const, data: result.data }
    : result.status === 404
      ? { kind: "ok" as const, data: { language: locale, documents: [] } }
      : { kind: "error" as const };
  return <GuideIndexView t={t} state={state} />;
}
