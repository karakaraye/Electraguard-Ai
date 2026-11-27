"use client";

import { useT } from "../../../../../lib/i18n/client";
import { AdminCodesView, type CardSet, type CodesDialogSeed } from "../../../../(staff)/s/_views/AdminCodesView";
import { S09_BATCHES, S09_CARDS, S09_CODES, S09_ONE_CARD } from "./s09.fixtures";

/** Screen 46 (S-09) preview states. Each state is one screenshot. */
export const states = [
  "default",
  "loading",
  "empty",
  "error",
  "forbidden",
  "not-ready",
  "create_sheet",
  "create_invalid",
  "create_rate_limited",
  "batch_created",
  "print",
  "single_card",
  "confirm_required",
  "confirm_failed",
  "revoke_sheet",
  "revoke_already_revoked",
  "reissue_sheet",
  "reset_sheet",
  "filter_locked",
  "search_no_match",
] as const;

const ok = async () => ({ ok: true as const });

export function Preview({ state }: { state: string }) {
  const t = useT();

  const dialogs: Record<string, CodesDialogSeed> = {
    create_sheet: { kind: "create", label: "Gwale observers", count: "60" },
    create_invalid: {
      kind: "create",
      label: "",
      count: "900",
      fields: { label: t("s09.create.errors.label"), count: t("s09.create.errors.count") },
    },
    create_rate_limited: { kind: "create", label: "Gwale observers", count: "500", message: t("s09.errors.rateLimited") },
    confirm_required: { kind: "print", batchId: S09_BATCHES[0].id },
    confirm_failed: { kind: "print", batchId: S09_BATCHES[0].id, message: t("s09.errors.confirmation") },
    revoke_sheet: { kind: "revoke", code: "OBS-AB2C3D" },
    revoke_already_revoked: { kind: "revoke", code: "OBS-AB4E5F", reason: "suspected_misuse", message: t("s09.errors.alreadyRevoked") },
    reissue_sheet: { kind: "reissue", code: "OBS-AB6G7H", reason: "left_programme" },
    reset_sheet: { kind: "reset", code: "OBS-CE4C5D" },
  };

  const failed = state === "error" ? t("staff.networkError") : state === "forbidden" ? t("staff.forbidden") : state === "not-ready" ? t("staff.endpointNotReady") : null;

  const cardSet: CardSet | null =
    state === "batch_created" ? { cards: S09_CARDS, kind: "batch", label: "Gwale observers" }
    : state === "print" ? { cards: S09_CARDS, kind: "batch", label: S09_BATCHES[0].label }
    : state === "single_card" ? { cards: S09_ONE_CARD, kind: "single" }
    : null;

  const notice =
    state === "batch_created" ? t("s09.notice.created")
    : state === "print" ? t("s09.notice.printed", { label: S09_BATCHES[0].label })
    : state === "single_card" ? t("s09.notice.reissued", { code: "OBS-AC2M3N" })
    : null;

  const empty = state === "empty" || failed !== null || state === "loading";

  return (
    <AdminCodesView
      key={state}
      batches={empty ? [] : S09_BATCHES}
      codes={empty ? [] : S09_CODES}
      cardSet={cardSet}
      loading={state === "loading"}
      error={failed}
      initialDialog={dialogs[state] ?? null}
      initialFilter={state === "filter_locked" ? "locked" : "all"}
      initialSearch={state === "search_no_match" ? "OBS-ZZ9" : ""}
      initialNotice={notice}
      onCreateBatch={ok}
      onPrintBatch={ok}
      onRevoke={ok}
      onReissue={ok}
      onResetPin={ok}
      onCloseCards={() => {}}
      onRetry={() => {}}
    />
  );
}
