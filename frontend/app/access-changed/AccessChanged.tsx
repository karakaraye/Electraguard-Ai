"use client";

import { useT } from "../../lib/i18n/client";
import { KeyIcon } from "../../ui/icons";
import { SystemPage } from "../_system/SystemPage";

export function AccessChanged() {
  const t = useT();
  return (
    <SystemPage
      icon={KeyIcon}
      title={t("sys.access.title")}
      body={t("sys.access.body")}
      action={{ label: t("sys.access.action"), href: "/s/queue" }}
      data-testid="sys-access-changed"
    />
  );
}
