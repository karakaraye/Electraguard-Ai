"use client";

import { useT } from "../../lib/i18n/client";
import { LockIcon } from "../../ui/icons";
import { SystemPage } from "../_system/SystemPage";

export function SessionEnded({ who }: { who: "staff" | "observer" }) {
  const t = useT();
  return (
    <SystemPage
      icon={LockIcon}
      title={t("sys.session.title")}
      body={t("sys.session.body")}
      action={who === "observer" ? { label: t("sys.session.observer"), href: "/o" } : { label: t("sys.session.staff"), href: "/s/sign-in" }}
      data-testid="sys-session-ended"
    />
  );
}
