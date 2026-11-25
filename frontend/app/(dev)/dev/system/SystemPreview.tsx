"use client";

import { useSearchParams } from "next/navigation";
import { useEffect } from "react";
import NotFound from "../../../not-found";
import ErrorPage from "../../../error";
import { SessionEnded } from "../../../session-ended/SessionEnded";
import { AccessChanged } from "../../../access-changed/AccessChanged";
import { IntakePaused } from "../../../paused/IntakePaused";
import { setThemePreference } from "../../../../ui/theme";

export function SystemPreview() {
  const params = useSearchParams();
  const state = params.get("state") ?? "not-found";
  const theme = params.get("theme") === "dark" ? "dark" : "light";
  useEffect(() => setThemePreference(theme), [theme]);
  switch (state) {
    case "error":
      return <ErrorPage error={Object.assign(new Error("preview"), { digest: "preview" })} reset={() => {}} />;
    case "session-ended":
      return <SessionEnded who="staff" />;
    case "session-ended-observer":
      return <SessionEnded who="observer" />;
    case "access-changed":
      return <AccessChanged />;
    case "paused":
      return <IntakePaused />;
    default:
      return <NotFound />;
  }
}
