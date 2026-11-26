"use client";

import { useEffect } from "react";
import { useT } from "../lib/i18n/client";
import { AlertIcon } from "../ui/icons";
import { SystemPage } from "./_system/SystemPage";
import { ErrorSpot } from "./_system/spots";
import { useHomeHref } from "./_system/useHomeHref";
import { defaultLocale, isLocale, LOCALE_COOKIE, localeTags } from "../lib/i18n/config";

/** Screen 50: the last-resort boundary, when even the root layout failed. It brings its own html and body. */
export default function GlobalError() {
  const t = useT();
  const home = useHomeHref();
  useEffect(() => {
    // The root layout is gone, so read the language the person chose from the cookie after mount.
    const match = document.cookie.split("; ").find((part) => part.startsWith(`${LOCALE_COOKIE}=`));
    const value = match?.slice(LOCALE_COOKIE.length + 1);
    if (isLocale(value)) document.documentElement.lang = localeTags[value];
  }, []);
  return (
    <html lang={localeTags[defaultLocale]} suppressHydrationWarning>
      <body>
        <SystemPage
          icon={AlertIcon}
          spot={ErrorSpot}
          tone="danger"
          title={t("sys.error.title")}
          body={t("sys.error.body")}
          action={{ label: t("sys.error.reload"), onClick: () => window.location.reload() }}
          secondary={{ label: t("sys.home"), href: home }}
          data-testid="sys-global-error"
        />
      </body>
    </html>
  );
}
