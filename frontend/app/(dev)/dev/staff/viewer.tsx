"use client";

import Link from "next/link";
import { useSearchParams } from "next/navigation";
import { useState, type ReactElement } from "react";
import { useT } from "../../../../lib/i18n/client";
import { StaffShell, type StaffNavItem } from "../../../../ui";
import {
  DiscussionIcon,
  InboxIcon,
  KeyIcon,
  MapPulseIcon,
  MegaphoneIcon,
  ShieldCheckIcon,
  SlidersIcon,
  UploadIcon,
  UserPlusIcon,
  UsersIcon,
} from "../../../../ui/icons";
import { SignInView, type SignInStep } from "../../../(staff)/s/_views/SignInView";
import { EMPTY_QUEUE_FILTERS, QueueTableView } from "../../../(staff)/s/_views/QueueTableView";
import { CaseView } from "../../../(staff)/s/_views/CaseView";
import { AssignView } from "../../../(staff)/s/_views/AssignView";
import { OpsView } from "../../../(staff)/s/_views/OpsView";

import {
  FIXTURE_ASSIGNMENTS,
  FIXTURE_CASE_DETAIL,
  FIXTURE_CLUSTERS,
  FIXTURE_CASE_IN_REVIEW,
  FIXTURE_CASE_MESSAGES,
  FIXTURE_CASE_RESULT_SHEET,
  FIXTURE_COVERAGE,
  FIXTURE_LATE_MATERIALS,
  FIXTURE_OVERVIEW,
  FIXTURE_QUEUE_ITEMS,
  FIXTURE_QUEUE_PAGE,
} from "./fixtures";
import { CheckinsView } from "../../../(staff)/s/_views/CheckinsView";
import { CHECKINS_NOTICES, CHECKINS_NOW, CHECKINS_PLACES, CHECKINS_QUESTIONS, CHECKINS_RESULTS, CHECKINS_USER } from "./previews/checkins.fixtures";
import { PREVIEWS } from "./previews";

/** Screen 38 (S-01) states, from the spec's list. */
const S01_STATES = [
  "default", "loading", "invalid_credentials", "account_locked", "rate_limited",
  "totp", "totp_typing", "totp_invalid", "enrol", "invite", "invite_short", "invite_fair", "invite_strong", "invite_invalid",
] as const;

/** Screen 39 (S-02) states. */
/** Screen 40 (S-03) states. */
const S03_STATES = ["default", "in_review", "result_sheet", "pending_help", "closed", "loading", "error", "stale_version", "invalid_transition", "closure_evidence_changed", "validation"] as const;

/** Screen 41 (S-04) states. */
const S04_STATES = ["default", "results", "loading", "empty", "error"] as const;

/** Screen 42 (S-05) states. */
const S05_STATES = ["default", "loading", "empty", "partial", "error", "checkins", "checkins-approval", "checkins-mine"] as const;

const S02_STATES = ["default", "loading", "empty", "empty_filtered", "error", "forbidden", "new", "more"] as const;

function signInStep(state: string): SignInStep {
  if (state.startsWith("totp")) return "totp";
  if (state === "enrol") return "enrol";
  if (state.startsWith("invite")) return "invite";
  return "credentials";
}

function signInError(state: string, t: (key: string) => string): string | null {
  switch (state) {
    case "invalid_credentials": return t("s01.errors.invalidCredentials");
    case "account_locked": return t("s01.errors.accountLocked");
    case "rate_limited": return t("s01.errors.rateLimited");
    case "totp_invalid": return t("s01.errors.totpInvalid");
    case "invite_invalid": return t("s01.errors.inviteInvalid");
    default: return null;
  }
}

const SCREENS = [
  { id: "s01", name: "Staff sign-in" },
  { id: "s02", name: "Review queue" },
  { id: "s03", name: "Case review" },
  { id: "s04", name: "Case assignments" },
  { id: "s05", name: "Operations room" },
  { id: "s06", name: "Rumour desk" },
  { id: "s07", name: "Publish snapshots" },
  { id: "s08", name: "Discussion moderation" },
  { id: "s09", name: "Observer code batches" },
  { id: "s10", name: "Staff accounts" },
  { id: "s11", name: "Organisation settings" },
  { id: "s12", name: "Security & audit monitoring" },
] as const;

/** Which sidebar group each screen sits in, the same as the live layout. */
const GROUP_OF: Record<string, "review" | "monitor" | "moderate" | "admin"> = {
  s02: "review", s04: "review", s05: "monitor", s06: "monitor", s07: "monitor", s08: "moderate",
  s09: "admin", s10: "admin", s11: "admin", s12: "admin",
};

export function StaffStateViewer(): ReactElement {
  const searchParams = useSearchParams();
  const screen = searchParams?.get("screen") ?? "s01";
  const state = searchParams?.get("state") ?? "default";
  // Light only: the product has no other theme.
  const theme = "light";
  const t = useT();
  const [search, setSearch] = useState("");

  // The roles the viewer pretends to hold: ?role=reviewer|coordinator|moderator|org_admin|all (default all).
  const roleParam = searchParams?.get("role") ?? "all";
  const has = (role: string) => roleParam === "all" || roleParam === role;
  const link = (id: string) => `/dev/staff?screen=${id}&state=${state}&role=${roleParam}`;
  const groups = {
    review: t("staff.nav.groups.review"),
    monitor: t("staff.nav.groups.monitor"),
    moderate: t("staff.nav.groups.moderate"),
    admin: t("staff.nav.groups.admin"),
  };
  const nav: StaffNavItem[] = [];
  if (has("reviewer")) nav.push({ href: link("s02"), label: t("staff.nav.queue"), icon: InboxIcon, group: groups.review, current: screen === "s02" || screen === "s03", count: 2, countTone: "needs" });
  if (has("coordinator")) {
    nav.push({ href: link("s04"), label: t("staff.nav.assign"), icon: UserPlusIcon, group: groups.review, current: screen === "s04" });
    nav.push({ href: link("s05"), label: t("staff.nav.ops"), icon: MapPulseIcon, group: groups.monitor, current: screen === "s05" });
    nav.push({ href: link("s06"), label: t("staff.nav.rumours"), icon: MegaphoneIcon, group: groups.monitor, current: screen === "s06" });
    nav.push({ href: link("s07"), label: t("staff.nav.publish"), icon: UploadIcon, group: groups.monitor, current: screen === "s07" });
  }
  if (has("moderator")) nav.push({ href: link("s08"), label: t("staff.nav.discussions"), icon: DiscussionIcon, group: groups.moderate, current: screen === "s08" });
  if (has("org_admin")) {
    nav.push({ href: link("s09"), label: t("staff.nav.codes"), icon: KeyIcon, group: groups.admin, current: screen === "s09" });
    nav.push({ href: link("s10"), label: t("staff.nav.staff"), icon: UsersIcon, group: groups.admin, current: screen === "s10" });
    nav.push({ href: link("s11"), label: t("staff.nav.settings"), icon: SlidersIcon, group: groups.admin, current: screen === "s11" });
  }
  if (has("coordinator") || has("org_admin")) nav.push({ href: link("s12"), label: t("staff.nav.security"), icon: ShieldCheckIcon, group: groups.admin, current: screen === "s12" });
  const roleLabel = roleParam === "all" ? t("staff.roles.org_admin") : t(`staff.roles.${roleParam}`);


  const renderContent = () => {
    switch (screen) {
      case "s01":
        return (
          <SignInView
            key={state}
            step={signInStep(state)}
            email="f.musa@electraguard.ng"
            loading={state === "loading"}
            error={signInError(state, t)}
            enrolData={{
              secret: "JBSWY3DPEHPK3PXPJBSWY3DPEHPK3PXP",
              otpauth_uri: "otpauth://totp/ElectraGuard:f.musa%40electraguard.ng?secret=JBSWY3DPEHPK3PXPJBSWY3DPEHPK3PXP&issuer=ElectraGuard",
            }}
            initialValues={{
              totp: state === "totp_invalid" ? "482913" : state === "totp_typing" ? "482" : undefined,
              invitePassword: state === "invite_short" ? "polling" : state === "invite_fair" ? "pollingunitday" : state === "invite_strong" ? "Polling-unit 042, Kano" : undefined,
            }}
            onEmailChange={() => {}}
            onSubmitCredentials={() => {}}
            onSubmitTotp={() => {}}
            onSubmitEnrol={() => {}}
            onSubmitInvitePassword={() => {}}
            onBackToCredentials={() => {}}
          />
        );

      case "s02":
        return (
          <QueueTableView
            key={state}
            data={
              state === "empty" || state === "empty_filtered"
                ? { items: [], next_cursor: null, counts: {} }
                : state === "loading" || state === "error" || state === "forbidden"
                  ? null
                  : { ...FIXTURE_QUEUE_PAGE, next_cursor: state === "more" ? "c2" : null }
            }
            loading={state === "loading"}
            error={state === "error" ? t("staff.networkError") : state === "forbidden" ? t("staff.forbidden") : null}
            filters={state === "empty_filtered" ? { ...EMPTY_QUEUE_FILTERS, urgency: ["urgent"], channel: ["ussd"] } : EMPTY_QUEUE_FILTERS}
            onFiltersChange={() => {}}
            onLoadMore={() => {}}
            onRetry={() => {}}
            newCount={state === "new" ? 3 : 0}
            onShowNew={() => {}}
            savedViews={[{ name: "Urgent in Kano", filters: { ...EMPTY_QUEUE_FILTERS, urgency: ["urgent"] } }]}
            onSaveView={() => {}}
            onRemoveView={() => {}}
            onOpenCase={() => {}}
            search={search}
            onClearSearch={() => setSearch("")}
            initialPreviewId={state === "default" || state === "new" || state === "more" ? FIXTURE_QUEUE_ITEMS[0].id : undefined}
          />
        );

      case "s03":
        return (
          <CaseView
            key={state}
            caseData={
              state === "loading" || state === "error"
                ? null
                : state === "default"
                  ? { ...FIXTURE_CASE_DETAIL, allowed_actions: ["start", "redact"] }
                  : state === "result_sheet"
                    ? FIXTURE_CASE_RESULT_SHEET
                    : state === "closed"
                      ? { ...FIXTURE_CASE_IN_REVIEW, status: "closed", outcome: "corroborated", allowed_actions: [], open_question: null }
                      : state === "pending_help"
                        ? { ...FIXTURE_CASE_IN_REVIEW, suggestions: { ...FIXTURE_CASE_IN_REVIEW.suggestions, status: "pending" }, duplicates: [] }
                        : FIXTURE_CASE_IN_REVIEW
            }
            loading={state === "loading"}
            error={state === "error" ? t("staff.networkError") : null}
            messages={state === "default" ? [] : FIXTURE_CASE_MESSAGES}
            conflict={
              state === "stale_version" ? "stale_version"
                : state === "invalid_transition" ? "invalid_transition"
                  : state === "closure_evidence_changed" ? "closure_evidence_changed"
                    : state === "validation" ? "validation"
                      : null
            }
            onReload={() => {}}
            onSendMessage={() => {}}
            onViewUnblurred={async () => ({ error: "unavailable" })}
          />
        );

      case "s04":
        return (
          <AssignView
            key={state}
            data={
              state === "loading" || state === "error"
                ? null
                : state === "empty"
                  ? { ...FIXTURE_ASSIGNMENTS, items: [] }
                  : state === "results"
                    ? {
                        ...FIXTURE_ASSIGNMENTS,
                        items: FIXTURE_ASSIGNMENTS.items.map((item, i) =>
                          i === 0 ? { ...item, assigned_reviewer: { id: "st-4", display_name: "H. Bello" } } : item,
                        ),
                      }
                    : FIXTURE_ASSIGNMENTS
            }
            loading={state === "loading"}
            error={state === "error" ? t("staff.networkError") : null}
            assigning={false}
            scope="none"
            onScopeChange={() => {}}
            onRefresh={() => {}}
            onAssign={() => {}}
            results={
              state === "results"
                ? {
                    [FIXTURE_ASSIGNMENTS.items[0].id]: { report_id: FIXTURE_ASSIGNMENTS.items[0].id, ok: true, version: 3, assigned_reviewer: { id: "st-4", display_name: "H. Bello" } },
                    [FIXTURE_ASSIGNMENTS.items[1].id]: { report_id: FIXTURE_ASSIGNMENTS.items[1].id, ok: false, error: { code: "already_assigned", message: "" } },
                    [FIXTURE_ASSIGNMENTS.items[2].id]: { report_id: FIXTURE_ASSIGNMENTS.items[2].id, ok: false, error: { code: "stale_version", message: "" } },
                  }
                : {}
            }
          />
        );

      case "s05": {
        const sec = <T,>(data: T): { data: T | null; loading: boolean; error: string | null } =>
          state === "loading" ? { data: null, loading: true, error: null }
            : state === "error" ? { data: null, loading: false, error: t("staff.networkError") }
              : { data, loading: false, error: null };
        if (state.startsWith("checkins")) {
          const pending = state !== "checkins";
          return (
            <OpsView
              key={state}
              date="2026-12-05"
              today="2026-12-05"
              stage="voting"
              tab="checkins"
              checkinsWaiting={1}
              overview={sec(FIXTURE_OVERVIEW)}
              clusters={sec(FIXTURE_CLUSTERS)}
              coverage={sec(FIXTURE_COVERAGE)}
              lateMaterials={sec(FIXTURE_LATE_MATERIALS)}
              checkins={
                <CheckinsView
                  places={CHECKINS_PLACES}
                  questions={CHECKINS_QUESTIONS}
                  notices={{ data: CHECKINS_NOTICES, loading: false, error: null }}
                  selectedId={pending ? "n-junction" : "n-voting"}
                  results={{ data: CHECKINS_RESULTS, loading: false, error: null }}
                  currentUser={state === "checkins-mine" ? "Musa Bello" : CHECKINS_USER}
                  now={CHECKINS_NOW}
                  onSend={() => true}
                  onApprove={() => true}
                  onReject={() => true}
                  onAskAgain={() => true}
                />
              }
            />
          );
        }
        return (
          <OpsView
            key={state}
            date="2026-12-05"
            today="2026-12-05"
            stage="voting"
            overview={sec(state === "empty" ? { ...FIXTURE_OVERVIEW, by_lga: [], totals: { reports: 0, incidents_after_links: 0, urgent_open: 0, open_questions: 0, result_sheet_flags_open: 0, withdrawn: 0 } } : FIXTURE_OVERVIEW)}
            clusters={sec(state === "empty" ? [] : FIXTURE_CLUSTERS)}
            coverage={
              state === "partial"
                ? { data: null, loading: false, error: t("staff.endpointNotReady") }
                : sec(state === "empty" ? { ...FIXTURE_COVERAGE, rows: [], most_no_answers: [] } : FIXTURE_COVERAGE)
            }
            lateMaterials={sec(state === "empty" ? { ...FIXTURE_LATE_MATERIALS, rows: [] } : FIXTURE_LATE_MATERIALS)}
            onReviewCluster={() => {}}
            onRefresh={() => {}}
          />
        );
      }

      case "s06":
      case "s07":
      case "s08":
      case "s09":
      case "s10":
      case "s11":
      case "s12": {
        const { Preview } = PREVIEWS[screen];
        return <Preview key={state} state={state} />;
      }

      default:
        return <div>Select a screen</div>;
    }
  };

  return (
    <div
      style={{
        minHeight: "100vh",
        display: "flex",
        flexDirection: "column",
        background: "var(--paper-2)",
        color: "var(--ink)",
      }}
      data-theme={theme}
      data-density="staff"
    >
      {/* Dev Navigation Bar */}
      <div
        data-dev-bar
        role="navigation"
        aria-label="Viewer"
        style={{
          background: "var(--paper)",
          color: "var(--ink)",
          padding: "8px 16px",
          borderBottom: "1px solid var(--rule)",
          display: "flex",
          gap: "12px",
          flexWrap: "wrap",
          alignItems: "center",
          fontSize: "13px",
          fontFamily: "var(--font)",
        }}
      >
        <strong style={{ marginRight: "8px" }}>Staff Dev Viewer:</strong>
        {SCREENS.map((s) => (
          <Link
            key={s.id}
            href={`/dev/staff?screen=${s.id}&state=${state}`}
            style={{
              color: screen === s.id ? "var(--ink)" : "var(--ink-2)",
              fontWeight: screen === s.id ? "bold" : "normal",
              textDecoration: screen === s.id ? "underline" : "none",
            }}
          >
            {s.name}
          </Link>
        ))}

        <div style={{ marginLeft: "auto", display: "flex", gap: "12px", alignItems: "center" }}>
          <div style={{ display: "flex", flexWrap: "wrap", gap: "6px", alignItems: "center" }}>
            <span style={{ color: "var(--ink-2)" }}>State:</span>
            {(screen === "s01" ? S01_STATES : screen === "s02" ? S02_STATES : screen === "s03" ? S03_STATES : screen === "s04" ? S04_STATES : screen === "s05" ? S05_STATES : (PREVIEWS[screen]?.states ?? ["default", "loading", "empty", "error"])).map((st) => (
              <Link
                key={st}
                href={`/dev/staff?screen=${screen}&state=${st}`}
                style={{
                  color: state === st ? "var(--ink)" : "var(--ink-2)",
                  fontWeight: state === st ? "bold" : "normal",
                  textDecoration: state === st ? "underline" : "none",
                }}
              >
                {st}
              </Link>
            ))}
          </div>

        </div>
      </div>

      {/* Screen Content wrapped in StaffShell if not sign-in */}
      {screen === "s01" ? (
        <main data-theme={theme} data-density="staff" id="eg-staff-content">{renderContent()}</main>
      ) : (
        <StaffShell
          nav={nav}
          preview
          title={screen === "s03" ? FIXTURE_CASE_DETAIL.receipt_code : t(`${screen}.title`)}
          crumbs={screen === "s03" ? [{ label: t("staff.nav.queue"), href: link("s02") }] : [{ label: groups[GROUP_OF[screen] ?? "review"] }]}
          organisation="Kano observers network"
          intake={{ paused: state === "paused", href: link("s11") }}
          user={{ name: "Fatima Musa", role: roleLabel }}
          onSignOut={() => undefined}
          onSearch={setSearch}
        >
          {renderContent()}
        </StaffShell>
      )}
    </div>
  );
}
