"use client";

import { useT } from "../lib/i18n/client";
import { SearchIcon } from "../ui/icons";
import { SystemPage } from "./_system/SystemPage";
import { NotFoundSpot } from "./_system/spots";
import { useHomeHref } from "./_system/useHomeHref";

/** Screen 50: any address that does not exist. */
export default function NotFound() {
  const t = useT();
  const home = useHomeHref();
  return (
    <SystemPage
      icon={SearchIcon}
      spot={NotFoundSpot}
      title={t("sys.notFound.title")}
      body={t("sys.notFound.body")}
      action={{ label: t("sys.home"), href: home }}
      data-testid="sys-not-found"
    />
  );
}
