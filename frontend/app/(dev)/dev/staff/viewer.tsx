"use client";

import Link from "next/link";
import { useSearchParams } from "next/navigation";
import { type ReactElement } from "react";
import { useT } from "../../../../lib/i18n/client";
import { StaffShell, type StaffNavItem } from "../../../../ui";
import {
  DiscussionIcon,
  InboxIcon,
  KeyIcon,
  LockIcon,
  SearchIcon,
  ShieldCheckIcon,
  SignalIcon,
  SlidersIcon,
  UploadIcon,
  UsersIcon,
} from "../../../../ui/icons";
import { SignInView, type SignInStep } from "../../../(staff)/s/_views/SignInView";
import { EMPTY_QUEUE_FILTERS, QueueTableView } from "../../../(staff)/s/_views/QueueTableView";
import { CaseView } from "../../../(staff)/s/_views/CaseView";
import { AssignView } from "../../../(staff)/s/_views/AssignView";
import { OpsView } from "../../../(staff)/s/_views/OpsView";
import { RumourView } from "../../../(staff)/s/_views/RumourView";
import { PublishView } from "../../../(staff)/s/_views/PublishView";
import { DiscussionModView } from "../../../(staff)/s/_views/DiscussionModView";
import { AdminCodesView } from "../../../(staff)/s/_views/AdminCodesView";
import { AdminStaffView } from "../../../(staff)/s/_views/AdminStaffView";
import { AdminSettingsView } from "../../../(staff)/s/_views/AdminSettingsView";
import { SecurityView } from "../../../(staff)/s/_views/SecurityView";

import {
  FIXTURE_ALERT,
  FIXTURE_BATCHES,
  FIXTURE_ASSIGNMENTS,
  FIXTURE_CASE_DETAIL,
  FIXTURE_CLUSTERS,
  FIXTURE_CASE_IN_REVIEW,
  FIXTURE_CASE_MESSAGES,
  FIXTURE_CASE_RESULT_SHEET,
  FIXTURE_CLAIM,
  FIXTURE_COVERAGE,
  FIXTURE_FLAG,
  FIXTURE_LATE_MATERIALS,
  FIXTURE_OVERVIEW,
  FIXTURE_QUEUE_ITEMS,
  FIXTURE_QUEUE_PAGE,
  FIXTURE_SETTINGS,
  FIXTURE_SNAPSHOT_RECORD,
  FIXTURE_STAFF_ACCOUNT,
} from "./fixtures";

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
const S05_STATES = ["default", "loading", "empty", "partial", "error"] as const;

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

export function StaffStateViewer(): ReactElement {
  const searchParams = useSearchParams();
  const screen = searchParams?.get("screen") ?? "s01";
  const state = searchParams?.get("state") ?? "default";
  const themeParam = searchParams?.get("theme");
  const theme = themeParam === "dark" ? "dark" : "light";
  const t = useT();

  const nav: StaffNavItem[] = [
    { href: `/dev/staff?screen=s02&state=${state}&theme=${theme}`, label: "Queue", icon: InboxIcon, current: screen === "s02" || screen === "s03", count: 2 },
    { href: `/dev/staff?screen=s04&state=${state}&theme=${theme}`, label: "Assign", icon: SearchIcon, current: screen === "s04" },
    { href: `/dev/staff?screen=s05&state=${state}&theme=${theme}`, label: "Ops", icon: SignalIcon, current: screen === "s05" },
    { href: `/dev/staff?screen=s06&state=${state}&theme=${theme}`, label: "Rumours", icon: DiscussionIcon, current: screen === "s06" },
    { href: `/dev/staff?screen=s07&state=${state}&theme=${theme}`, label: "Publish", icon: UploadIcon, current: screen === "s07" },
    { href: `/dev/staff?screen=s08&state=${state}&theme=${theme}`, label: "Mod", icon: LockIcon, current: screen === "s08" },
    { href: `/dev/staff?screen=s09&state=${state}&theme=${theme}`, label: "Codes", icon: KeyIcon, current: screen === "s09" },
    { href: `/dev/staff?screen=s10&state=${state}&theme=${theme}`, label: "Staff", icon: UsersIcon, current: screen === "s10" },
    { href: `/dev/staff?screen=s11&state=${state}&theme=${theme}`, label: "Settings", icon: SlidersIcon, current: screen === "s11" },
    { href: `/dev/staff?screen=s12&state=${state}&theme=${theme}`, label: "Security", icon: ShieldCheckIcon, current: screen === "s12" },
  ];

  const currentScreenObj = SCREENS.find((s) => s.id === screen) ?? SCREENS[0];

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
        return (
          <RumourView
            claims={state === "empty" ? [] : [FIXTURE_CLAIM]}
            selectedClaim={state === "empty" ? null : FIXTURE_CLAIM}
            matches={null}
            loading={state === "loading"}
            error={state === "error" ? "Failed to load rumours" : null}
            currentUserName="F. Musa"
          />
        );

      case "s07":
        return (
          <PublishView
            snapshots={state === "empty" ? [] : [FIXTURE_SNAPSHOT_RECORD]}
            selectedSnapshot={state === "empty" ? null : FIXTURE_SNAPSHOT_RECORD}
            hourlySchedule={true}
            loading={state === "loading"}
            error={state === "error" ? "Snapshot preview generation failed" : null}
          />
        );

      case "s08":
        return (
          <DiscussionModView
            flags={state === "empty" ? [] : [FIXTURE_FLAG]}
            loading={state === "loading"}
            error={state === "error" ? "Failed to load flagged posts" : null}
          />
        );

      case "s09":
        return (
          <AdminCodesView
            batches={state === "empty" ? [] : FIXTURE_BATCHES}
            codes={[]}
            activeCards={null}
            loading={state === "loading"}
            error={state === "error" ? "Failed to load code batches" : null}
          />
        );

      case "s10":
        return (
          <AdminStaffView
            staffList={state === "empty" ? [] : [FIXTURE_STAFF_ACCOUNT]}
            loading={state === "loading"}
            error={state === "error" ? "Failed to load staff list" : null}
            inviteResult={null}
          />
        );

      case "s11":
        return (
          <AdminSettingsView
            settings={state === "empty" ? null : FIXTURE_SETTINGS}
            loading={state === "loading"}
            error={state === "error" ? "Failed to load settings" : null}
          />
        );

      case "s12":
        return (
          <SecurityView
            alerts={state === "empty" ? [] : [FIXTURE_ALERT]}
            verification={{
              intact: true,
              events_checked: 18422,
              head: {
                hash: "b5d12a884f3e9c1b72a0d9e8c6f1a4e2b0c9d7e5f3a1b4c6d8e0f2a4b6c8d0e2",
                event_count: 18422,
                at: "2026-12-05T11:00:00+01:00",
              },
              first_broken_event_id: null,
              checked_at: "2026-12-05T11:02:00+01:00",
            }}
            loading={state === "loading"}
            verifying={false}
            error={state === "error" ? "Security verification failed" : null}
            statusFilter="all"
          />
        );

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
        }}
      >
        <strong style={{ marginRight: "8px" }}>Staff Dev Viewer:</strong>
        {SCREENS.map((s) => (
          <Link
            key={s.id}
            href={`/dev/staff?screen=${s.id}&state=${state}&theme=${theme}`}
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
            {(screen === "s01" ? S01_STATES : screen === "s02" ? S02_STATES : screen === "s03" ? S03_STATES : screen === "s04" ? S04_STATES : screen === "s05" ? S05_STATES : (["default", "loading", "empty", "error"] as const)).map((st) => (
              <Link
                key={st}
                href={`/dev/staff?screen=${screen}&state=${st}&theme=${theme}`}
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

          <div style={{ display: "flex", gap: "6px", alignItems: "center", borderLeft: "1px solid var(--rule)", paddingLeft: "12px" }}>
            <span style={{ color: "var(--ink-2)" }}>Theme:</span>
            {(["light", "dark"] as const).map((th) => (
              <Link
                key={th}
                href={`/dev/staff?screen=${screen}&state=${state}&theme=${th}`}
                style={{
                  color: theme === th ? "var(--ink)" : "var(--ink-2)",
                  fontWeight: theme === th ? "bold" : "normal",
                  textDecoration: theme === th ? "underline" : "none",
                }}
              >
                {th}
              </Link>
            ))}
          </div>
        </div>
      </div>

      {/* Screen Content wrapped in StaffShell if not sign-in */}
      {screen === "s01" ? (
        <main data-theme={theme} data-density="staff">{renderContent()}</main>
      ) : (
        <StaffShell nav={nav} title={currentScreenObj.name} theme={theme}>
          {renderContent()}
        </StaffShell>
      )}
    </div>
  );
}
