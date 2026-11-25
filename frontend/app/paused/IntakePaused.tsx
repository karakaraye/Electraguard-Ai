"use client";

import { useT } from "../../lib/i18n/client";
import { SystemPage } from "../_system/SystemPage";

/** A pause sign: two upright bars. */
function PauseIcon({ size = 24 }: { size?: number }) {
  return (
    <svg width={size} height={size} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={1.75} strokeLinecap="round" aria-hidden="true" focusable="false">
      <path d="M9 6v12M15 6v12" />
    </svg>
  );
}

export function IntakePaused() {
  const t = useT();
  return (
    <SystemPage
      icon={PauseIcon}
      title={t("sys.paused.title")}
      body={t("sys.paused.body")}
      action={{ label: t("sys.paused.action"), href: "/results" }}
      data-testid="sys-paused"
    />
  );
}
