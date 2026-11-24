import type { Metadata } from "next";
import { getT } from "../../../lib/i18n/server";
import { PrivacyView } from "../_views/PrivacyView";

export async function generateMetadata(): Promise<Metadata> {
  const { t } = await getT();
  return { title: t("p06.title"), description: t("p06.lead") };
}

/** P-06 privacy notice. Static text, server rendered in the reader's language. */
export default async function PrivacyPage() {
  const { t, locale } = await getT();
  return <PrivacyView t={t} locale={locale} />;
}
