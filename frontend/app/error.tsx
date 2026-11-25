"use client";

import { useEffect } from "react";
import { useT } from "../lib/i18n/client";
import { AlertIcon } from "../ui/icons";
import { SystemPage } from "./_system/SystemPage";
import { ErrorSpot } from "./_system/spots";
import { useHomeHref } from "./_system/useHomeHref";

/** Counts tries across remounts: the first button press retries in place, the next one reloads. */
let attempts = 0;

/** Screen 50: the error boundary. Saved reports live on the phone, so they are safe whatever failed here. */
export default function ErrorPage({ error, reset }: { error: Error & { digest?: string }; reset: () => void }) {
  const t = useT();
  const home = useHomeHref();
  useEffect(() => {
    // The digest identifies the failure in the server log without exposing any detail here.
    if (error.digest) console.error("Page failed", error.digest);
  }, [error]);
  return (
    <SystemPage
      icon={AlertIcon}
      spot={ErrorSpot}
      tone="danger"
      title={t("sys.error.title")}
      body={t("sys.error.body")}
      action={
        attempts === 0
          ? {
              label: t("ui.retry"),
              onClick: () => {
                attempts += 1;
                reset();
              },
            }
          : { label: t("sys.error.reload"), onClick: () => window.location.reload() }
      }
      secondary={{ label: t("sys.home"), href: home }}
      data-testid="sys-error"
    />
  );
}
