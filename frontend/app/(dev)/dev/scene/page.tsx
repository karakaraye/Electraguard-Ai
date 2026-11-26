import type { Metadata } from "next";
import { notFound } from "next/navigation";
import { getT } from "../../../../lib/i18n/server";
import { SMS_SHORT_CODE } from "../../../../lib/config";
import { ButtonLink } from "../../../../ui/Button/Button";
import { LivingScene, type SceneMotion } from "../../../(public)/_components/living-scene/LivingScene";
import { USSD_SERVICE_CODE } from "../../../(public)/_lib/public";
import styles from "./scene.module.css";
import "../../../../ui/tokens.css";

export const metadata: Metadata = {
  title: "Living scene preview",
  robots: { index: false, follow: false },
};

const MOTIONS: SceneMotion[] = ["full", "ambient", "still"];

/**
 * Development only: the landing-page hero with the living scene (landing plan §4.2, step 2),
 * for review before the rest of the page is built. ?motion=full|ambient|still fixes the
 * motion level; ?theme=dark shows the night colours; ?variant=evening shows the footer scene.
 */
export default async function ScenePreview({ searchParams }: { searchParams: Promise<Record<string, string | undefined>> }) {
  if (process.env.NODE_ENV === "production") notFound();
  const params = await searchParams;
  const { t } = await getT();
  const motion = MOTIONS.includes(params.motion as SceneMotion) ? (params.motion as SceneMotion) : undefined;
  const theme = params.theme === "dark" ? "dark" : "light";
  const variant = params.variant === "evening" ? "evening" : "day";

  return (
    <div className={`eg-public ${styles.page}`} data-theme={theme}>
      <section className={styles.hero} aria-labelledby="scene-title" data-variant={variant}>
        <div className={styles.sky}>
          <h1 id="scene-title" className={styles.title}>
            {t("p02.heading")}
          </h1>
          <p className={styles.lead}>{t("p02.lead")}</p>
          <div className={styles.actions}>
            <ButtonLink href="/o/new/what?as=citizen">{t("p02.report")}</ButtonLink>
            <p className={styles.hint}>{t("p02.reportHint")}</p>
          </div>
          <p className={styles.basic}>{t("p02.basicPhone", { ussd: USSD_SERVICE_CODE, shortCode: SMS_SHORT_CODE })}</p>
        </div>
        <div className={styles.stage}>
          <LivingScene variant={variant} motion={motion} className={styles.scene} />
        </div>
      </section>
    </div>
  );
}
