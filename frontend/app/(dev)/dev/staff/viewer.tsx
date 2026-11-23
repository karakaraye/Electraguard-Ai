"use client";

import Link from "next/link";
import { useSearchParams } from "next/navigation";
import { type ReactElement } from "react";
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
import { SignInView } from "../../../(staff)/s/_views/SignInView";
import { QueueView } from "../../../(staff)/s/_views/QueueView";
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
  FIXTURE_CASE_DETAIL,
  FIXTURE_CLAIM,
  FIXTURE_COVERAGE,
  FIXTURE_FLAG,
  FIXTURE_LATE_MATERIALS,
  FIXTURE_OVERVIEW,
  FIXTURE_QUEUE_ITEM,
  FIXTURE_QUEUE_RESPONSE,
  FIXTURE_SETTINGS,
  FIXTURE_SNAPSHOT_RECORD,
  FIXTURE_STAFF_ACCOUNT,
} from "./fixtures";

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
            step={state === "totp" ? "totp" : "credentials"}
            email="f.musa@electraguard.ng"
            loading={state === "loading"}
            error={state === "error" ? "Invalid email or password" : null}
            onEmailChange={() => {}}
            onSubmitCredentials={() => {}}
            onSubmitTotp={() => {}}
            onBackToCredentials={() => {}}
          />
        );

      case "s02":
        return (
          <QueueView
            data={state === "empty" ? { items: [], next_cursor: null, counts: {} } : FIXTURE_QUEUE_RESPONSE}
            loading={state === "loading"}
            error={state === "error" ? "Failed to load triage queue" : null}
            filters={{}}
            onFilterChange={() => {}}
          />
        );

      case "s03":
        return (
          <CaseView
            caseData={state === "empty" ? null : FIXTURE_CASE_DETAIL}
            loading={state === "loading"}
            error={state === "error" ? "Case not found" : null}
          />
        );

      case "s04":
        return (
          <AssignView
            data={
              state === "empty"
                ? { items: [], next_cursor: null, reviewers: [] }
                : {
                    items: [
                      {
                        id: FIXTURE_QUEUE_ITEM.id,
                        receipt_code: FIXTURE_QUEUE_ITEM.receipt_code,
                        kind: FIXTURE_QUEUE_ITEM.kind,
                        channel: FIXTURE_QUEUE_ITEM.channel,
                        status: FIXTURE_QUEUE_ITEM.status,
                        version: 1,
                        urgency: FIXTURE_QUEUE_ITEM.urgency,
                        category: FIXTURE_QUEUE_ITEM.category,
                        area: FIXTURE_QUEUE_ITEM.area,
                        received_at: FIXTURE_QUEUE_ITEM.received_at,
                        assigned_reviewer: null,
                        suggested_reviewer: {
                          id: FIXTURE_STAFF_ACCOUNT.id,
                          display_name: FIXTURE_STAFF_ACCOUNT.display_name,
                          reason: "fewest_open_cases_in_area",
                        },
                      },
                    ],
                    next_cursor: null,
                    reviewers: [
                      {
                        id: FIXTURE_STAFF_ACCOUNT.id,
                        display_name: FIXTURE_STAFF_ACCOUNT.display_name,
                        open_cases: 2,
                        urgent_open: 1,
                        areas: ["1901"],
                        active_now: true,
                      },
                    ],
                  }
            }
            loading={state === "loading"}
            assigning={false}
            error={state === "error" ? "Failed to load assignments" : null}
          />
        );

      case "s05":
        return (
          <OpsView
            overview={state === "empty" ? null : FIXTURE_OVERVIEW}
            clusters={[]}
            coverage={state === "empty" ? null : FIXTURE_COVERAGE}
            lateMaterials={state === "empty" ? null : FIXTURE_LATE_MATERIALS}
            loading={state === "loading"}
            error={state === "error" ? "Operations data unavailable" : null}
          />
        );

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
          <div style={{ display: "flex", gap: "6px", alignItems: "center" }}>
            <span style={{ color: "var(--ink-2)" }}>State:</span>
            {(["default", "loading", "empty", "error", "totp"] as const).map((st) => (
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
