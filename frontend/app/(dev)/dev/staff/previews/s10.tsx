"use client";

import { useT } from "../../../../../lib/i18n/client";
import { AdminStaffView, type StaffDialogSeed } from "../../../../(staff)/s/_views/AdminStaffView";
import { S10_INVITE, S10_ME, S10_STAFF } from "./s10.fixtures";

/** Screen 47 (S-10) preview states. Each state is one screenshot. */
export const states = [
  "default",
  "loading",
  "empty",
  "error",
  "forbidden",
  "not-ready",
  "invite",
  "create",
  "create-duplicate",
  "create-invalid",
  "reset",
  "reset-stale",
  "offboard",
  "offboard-last-admin",
  "offboard-stale",
  "offboard-self",
] as const;

const ok = async () => ({ ok: true as const });

export function Preview({ state }: { state: string }) {
  const t = useT();

  const dialogs: Record<string, StaffDialogSeed> = {
    create: { kind: "create", email: "hauwa.garba@electraguard.ng", name: "Hauwa Garba", roles: ["reviewer"] },
    "create-duplicate": {
      kind: "create",
      email: "ibrahim.sule@electraguard.ng",
      name: "Ibrahim Sule",
      roles: ["reviewer"],
      fields: { email: t("s10.errors.duplicate") },
    },
    "create-invalid": {
      kind: "create",
      email: "hauwa.garba",
      name: "H",
      roles: [],
      fields: { email: t("s10.errors.invalidEmail"), name: t("s10.errors.invalidName"), roles: t("s10.errors.invalidRoles") },
    },
    reset: { kind: "reset", staffId: "st-ibrahim" },
    "reset-stale": { kind: "reset", staffId: "st-ibrahim", message: t("s10.errors.stale") },
    offboard: { kind: "offboard", staffId: "st-chinedu" },
    "offboard-last-admin": { kind: "offboard", staffId: "st-adaeze", message: t("s10.errors.lastAdmin"), reason: "role_changed" },
    "offboard-stale": { kind: "offboard", staffId: "st-chinedu", message: t("s10.errors.stale") },
    "offboard-self": { kind: "offboard", staffId: "st-adaeze", message: t("s10.errors.selfOffboard") },
  };

  const failed = state === "error" ? t("staff.networkError") : state === "forbidden" ? t("staff.forbidden") : state === "not-ready" ? t("staff.endpointNotReady") : null;

  return (
    <AdminStaffView
      key={state}
      staffList={state === "empty" || failed ? [] : S10_STAFF}
      loading={state === "loading"}
      error={failed}
      currentUserId={S10_ME}
      inviteResult={state === "invite" ? S10_INVITE : null}
      initialDialog={dialogs[state] ?? null}
      onCreateStaff={ok}
      onReset2fa={ok}
      onOffboard={ok}
      onCloseInvite={() => {}}
      onRetry={() => {}}
    />
  );
}
