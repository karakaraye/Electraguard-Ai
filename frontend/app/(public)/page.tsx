import { redirect } from "next/navigation";
import { getT } from "../../lib/i18n/server";
import { createTranslator, loadMessages, locales } from "../../lib/i18n";
import { getGuideList, getResults, homeResults } from "./_lib/data";
import { HomeView } from "./_views/HomeView";

/** P-02 public home. Server rendered; the results summary and the guide links stream into the same response. */
export default async function PublicHome({ searchParams }: { searchParams: Promise<{ access?: string }> }) {
  // The legacy workspace forms used "/?access=changed" before the home became public.
  if ((await searchParams).access === "changed") redirect("/access-changed");
  const { t, locale } = await getT();
  // Results and guides come from the API; they stream in after the rest of the page, so a slow API never delays the hero.
  const results = getResults(locale).then(homeResults);
  const guides = getGuideList(locale).then((list) => (list.ok ? list.data.documents : null));
  const reportLines = await reportInEachLanguage();
  return <HomeView t={t} locale={locale} results={results} guides={guides} reportLines={reportLines} />;
}

/** The main action in every language: step 1 of the story draws the language picker, and the form changes words as it is switched. */
async function reportInEachLanguage() {
  const entries = await Promise.all(
    locales.map(async (code) => [code, createTranslator(code, await loadMessages(code))("p02.report")] as const),
  );
  return Object.fromEntries(entries);
}
