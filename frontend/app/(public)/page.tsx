import { redirect } from "next/navigation";
import { getT } from "../../lib/i18n/server";
import { getGuideList, getResults, homeResults } from "./_lib/data";
import { HomeView } from "./_views/HomeView";

/** P-02 public home. Server rendered: one HTML response carries the results summary and the guide links. */
export default async function PublicHome({ searchParams }: { searchParams: Promise<{ access?: string }> }) {
  // The legacy workspace forms used "/?access=changed" before the home became public.
  if ((await searchParams).access === "changed") redirect("/access-changed");
  const { t, locale } = await getT();
  const [results, guides] = await Promise.all([getResults(locale), getGuideList(locale)]);
  return <HomeView t={t} locale={locale} results={homeResults(results)} guides={guides.ok ? guides.data.documents : null} />;
}
