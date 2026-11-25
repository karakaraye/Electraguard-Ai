"use client";

import { useT } from "../lib/i18n/client";
import { AlertIcon } from "../ui/icons";
import { SystemPage } from "./_system/SystemPage";
import { ErrorSpot } from "./_system/spots";

/** Screen 50: the last-resort boundary, when even the root layout failed. It brings its own html and body. */
export default function GlobalError() {
  const t = useT();
  return (
    <html lang="en">
      <body>
        <SystemPage
          icon={AlertIcon}
          spot={ErrorSpot}
          tone="danger"
          title={t("sys.error.title")}
          body={t("sys.error.body")}
          action={{ label: t("sys.error.reload"), onClick: () => window.location.reload() }}
          secondary={{ label: t("sys.home"), href: "/" }}
          data-testid="sys-global-error"
        />
      </body>
    </html>
  );
}
