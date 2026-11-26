"use client";

import { useT } from "../../../../lib/i18n/client";
import { ButtonLink, EmptyState } from "../../../../ui";

/**
 * Any staff address that does not exist. It renders inside the staff shell, so the rail and
 * header stay in place and the person is one click from the queue (audit row 75).
 */
export default function StaffNotFoundPage() {
  const t = useT();
  return (
    <EmptyState
      title={t("staff.notFound.title")}
      action={
        <ButtonLink href="/s/queue" variant="primary">
          {t("staff.backToQueue")}
        </ButtonLink>
      }
      data-testid="staff-not-found"
    >
      {t("staff.notFound.body")}
    </EmptyState>
  );
}
