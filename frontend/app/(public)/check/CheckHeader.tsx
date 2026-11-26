import type { Translate } from "../../../lib/i18n";
import pageStyles from "../_views/page.module.css";

/** The page heading and lead, server rendered. Shared by the route and the dev preview. */
export function CheckHeader({ t }: { t: Translate }) {
  return (
    <header className={pageStyles.header}>
      <h1 className={pageStyles.title}>{t("p08.heading")}</h1>
      <p className={pageStyles.lead}>{t("p08.lead")}</p>
    </header>
  );
}
