import type { Metadata } from "next";
import { getT } from "../../../lib/i18n/server";
import { AskPageView } from "./AskPageView";
import { AskScreen } from "./AskScreen";

export async function generateMetadata(): Promise<Metadata> {
  const { t } = await getT();
  return { title: t("p04.title") };
}

/** P-04 Ask ElectraGuard. The heading and notes are server rendered; only the form is a client island. */
export default async function AskPage() {
  const { t } = await getT();
  return (
    <AskPageView t={t}>
      <AskScreen />
    </AskPageView>
  );
}
