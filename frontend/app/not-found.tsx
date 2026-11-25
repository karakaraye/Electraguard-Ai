"use client";

import { useT } from "../lib/i18n/client";
import { SearchIcon } from "../ui/icons";
import { SystemPage } from "./_system/SystemPage";

/** Screen 50: any address that does not exist. */
export default function NotFound() {
  const t = useT();
  return (
    <SystemPage
      icon={SearchIcon}
      title={t("sys.notFound.title")}
      body={t("sys.notFound.body")}
      action={{ label: t("sys.home"), href: "/" }}
      data-testid="sys-not-found"
    />
  );
}
