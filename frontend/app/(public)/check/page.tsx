import type { Metadata } from "next";
import { getT } from "../../../lib/i18n/server";
import { CheckScreen } from "./CheckScreen";
import { CheckHeader } from "./CheckHeader";
import pageStyles from "../_views/page.module.css";

export async function generateMetadata(): Promise<Metadata> {
  const { t } = await getT();
  return { title: t("p08.title") };
}

/** P-08 Check a rumour. The heading is server rendered; the form and result are one client island. */
export default async function CheckPage() {
  const { t } = await getT();
  return (
    <div className={pageStyles.page}>
      <CheckHeader t={t} />
      <CheckScreen />
    </div>
  );
}
