"use client";

import Link from "next/link";
import { useSearchParams } from "next/navigation";
import { useEffect, type ReactElement } from "react";
import { setLocale, useLocale, useT } from "../../../../lib/i18n/client";
import { isLocale } from "../../../../lib/i18n/config";
import type { Cell, GuideDocument, GuideSummary, PublicResultsResponse } from "../../../../lib/api/types";
import { PublicShell } from "../../../(public)/_components/PublicShell";
import { HomeView } from "../../../(public)/_views/HomeView";
import { ResultsView } from "../../../(public)/_views/ResultsView";
import { AskScreen } from "../../../(public)/ask/AskScreen";
import { GuideDocumentView, GuideIndexView } from "../../../(public)/_views/GuideViews";
import { PrivacyView } from "../../../(public)/_views/PrivacyView";
import { PhoneSimulator } from "../../../(public)/phone/PhoneSimulator";

const cell = (count: number): Cell => ({ count, suppressed: false });

const FIXTURE_GUIDES: Array<GuideSummary & { fallback_language_used: boolean }> = [
  { document_id: "voting-rights", title: "Your rights at the polling unit", slug: "voting-rights", version: "2026.1", language: "en", fallback_language_used: false },
  { document_id: "late-opening", title: "What to do if opening is delayed", slug: "late-opening", version: "2026.1", language: "en", fallback_language_used: false },
  { document_id: "counting-rules", title: "Official vote-counting procedure", slug: "counting-rules", version: "2026.1", language: "en", fallback_language_used: false },
];

const FIXTURE_DOC: GuideDocument = {
  document_id: "voting-rights",
  title: "Your rights at the polling unit",
  slug: "voting-rights",
  version: "2026.1",
  language: "en",
  fallback_language_used: false,
  approved_on: "2026-11-20",
  sections: [
    {
      id: "rights",
      heading: "Voter Rights",
      body: `Every registered voter has the right to cast a ballot in secret and without intimidation.

- Arrive at your designated polling unit before accreditation ends.
- Present your voter card to the official for BVAS verification.
- If your fingerprint fails, facial recognition must be attempted.
- You are entitled to see that the ballot box is empty before voting begins.

Never accept money or gifts in exchange for your vote. Report any pressure to our team.`,
    },
    {
      id: "accreditation",
      heading: "Accreditation",
      body: `Officials check your voter card and confirm who you are before you can vote.

- Join the queue and keep your voter card with you.
- Elderly voters, voters with disabilities and pregnant women may be helped to the front.`,
    },
    {
      id: "problems",
      heading: "If something goes wrong",
      body: `Stay calm and stay safe. Do not argue with officials or other voters.

- Note the time and what happened.
- If someone is in danger, call 112. ElectraGuard does not send help.`,
    },
    {
      id: "report",
      heading: "Report what you saw",
      body: `You can report on ElectraGuard without an account. Describe roles, not names, and you will get a receipt code to check your report.`,
    },
  ],
};

const FIXTURE_RESULTS: PublicResultsResponse = {
  generated_at: "2026-12-05T14:30:00+01:00",
  notice_key: "results.notice",
  snapshots: [
    {
      organisation: { id: "cairn-org", name: "ElectraGuard AI, by Cairn" },
      snapshot_id: "snap-20261205-1400",
      published_at: "2026-12-05T14:00:00+01:00",
      cutoff: "2026-12-05T13:00:00+01:00",
      delay_minutes: 60,
      total: cell(1240),
      by_state: [
        {
          state_code: "KAN",
          state_name: "Kano",
          total: cell(215),
          by_category: {
            late_materials: cell(70),
            equipment_failure: cell(55),
            queues_crowding: cell(45),
            intimidation_violence: cell(25),
            vote_buying: cell(12),
          },
        },
        {
          state_code: "LA",
          state_name: "Lagos",
          total: cell(340),
          by_category: {
            late_materials: cell(110),
            equipment_failure: cell(90),
            queues_crowding: cell(85),
            intimidation_violence: cell(30),
            vote_buying: cell(15),
          },
        },
        {
          state_code: "RI",
          state_name: "Rivers",
          total: cell(185),
          by_category: {
            late_materials: cell(50),
            equipment_failure: cell(45),
            queues_crowding: cell(40),
            intimidation_violence: cell(35),
            vote_buying: cell(10),
          },
        },
      ],
      outcomes: [
        { outcome: "corroborated", count: 810, share_percent: 65.3, suppressed: false },
        { outcome: "insufficient_evidence", count: 95, share_percent: 7.7, suppressed: false },
        { outcome: "out_of_scope", count: 35, share_percent: 2.8, suppressed: false },
      ],
      timeline: [
        { hour_start: "2026-12-05T08:00:00+01:00", count: cell(180) },
        { hour_start: "2026-12-05T09:00:00+01:00", count: cell(290) },
        { hour_start: "2026-12-05T10:00:00+01:00", count: cell(320) },
        { hour_start: "2026-12-05T11:00:00+01:00", count: cell(250) },
        { hour_start: "2026-12-05T12:00:00+01:00", count: cell(200) },
      ],
      audit_chain_head: {
        hash: "e3b0c44298fc1c149afbf4c8996fb92427ae41e4649b934ca495991b7852b855",
        event_count: 1420,
        at: "2026-12-05T14:00:00+01:00",
      },
    },
  ],
  combined: null,
};

const PAGES = [
  { id: "home", label: "Home" },
  { id: "results", label: "Results" },
  { id: "ask", label: "Ask" },
  { id: "guide", label: "Guide" },
  { id: "guide-doc", label: "Guide Doc" },
  { id: "privacy", label: "Privacy" },
  { id: "phone", label: "Phone" },
] as const;

export function PublicStateViewer(): ReactElement {
  const searchParams = useSearchParams();
  const page = searchParams?.get("page") ?? searchParams?.get("screen") ?? "home";
  const state = searchParams?.get("state") ?? "default";
  const themeParam = searchParams?.get("theme");
  const theme = themeParam === "dark" ? "dark" : "light";
  const langParam = searchParams?.get("lang") ?? "en";

  const t = useT();
  const { locale } = useLocale();

  useEffect(() => {
    if (isLocale(langParam) && langParam !== locale) {
      setLocale(langParam);
    }
  }, [langParam, locale]);

  const renderContent = () => {
    switch (page) {
      case "home":
        return (
          <HomeView
            t={t}
            locale={locale}
            results={
              state === "empty"
                ? { kind: "empty" }
                : state === "unavailable"
                  ? { kind: "unavailable" }
                  : {
                      kind: "published",
                      total: cell(1240),
                      publishedAt: "2026-12-05T14:00:00+01:00",
                      cutoff: "2026-12-05T13:00:00+01:00",
                      organisations: 4,
                      categories: [
                        { category: "late_materials", count: 412 },
                        { category: "queues_crowding", count: 318 },
                        { category: "equipment_failure", count: 207 },
                      ],
                    }
            }
            guides={state === "error" ? null : FIXTURE_GUIDES}
          />
        );

      case "results":
        return (
          <ResultsView
            t={t}
            locale={locale}
            state={
              state === "empty"
                ? { kind: "empty" }
                : state === "error"
                  ? { kind: "error" }
                  : { kind: "ok", data: FIXTURE_RESULTS, view: "cairn-org" }
            }
          />
        );

      case "ask":
        return (
          <AskScreen
            initial={
              state === "answered"
                ? {
                    kind: "answered",
                    question: "What should I do if the polling unit opens late?",
                    data: {
                      status: "answered",
                      language: "en",
                      fallback_language_used: false,
                      passages: [
                        {
                          text: "If the polling unit has not opened 30 minutes after the official time, record the time it opens, note which materials or officials were missing, and send a report under Late or missing materials. Do not leave the unit to look for officials.",
                          score: 0.88,
                          source: {
                            document_id: "voting-rights",
                            title: "Observer field guide",
                            section: "4.2 Late opening",
                            version: "2026.1",
                            language: "en",
                            url: "/guide/voting-rights",
                          },
                        },
                      ],
                    },
                  }
                : state === "abstained"
                  ? { kind: "abstained", question: "Who will win the election?" }
                  : state === "offline"
                    ? { kind: "offline" }
                    : { kind: "idle" }
            }
            initialQuestion={state === "answered" ? "What should I do if the polling unit opens late?" : ""}
          />
        );

      case "guide":
        return (
          <GuideIndexView
            t={t}
            state={
              state === "error"
                ? { kind: "error" }
                : state === "empty"
                  ? { kind: "ok", data: { language: "en", documents: [] } }
                  : { kind: "ok", data: { language: "en", documents: FIXTURE_GUIDES } }
            }
          />
        );

      case "guide-doc":
        return (
          <GuideDocumentView
            t={t}
            locale={locale}
            state={
              state === "not_found"
                ? { kind: "not_found" }
                : state === "error"
                  ? { kind: "error" }
                  : state === "fallback"
                    ? { kind: "ok", data: { ...FIXTURE_DOC, fallback_language_used: true } }
                    : { kind: "ok", data: FIXTURE_DOC }
            }
          />
        );

      case "privacy":
        return <PrivacyView t={t} locale={locale} />;

      case "phone":
        return (
          <PhoneSimulator
            seed={{
              status: "ready",
              phoneLabel: "Basic Feature Phone (SIM-01)",
              view: state === "ussd" ? { name: "ussd", sessionId: "sess-1", text: "Welcome to ElectraGuard USSD\n1. Report incident\n2. Check receipt" } : { name: "home" },
            }}
          />
        );

      default:
        return <div>Select a page above</div>;
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
      data-viewer-ready
    >
      {/* Dev Bar */}
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
        <strong style={{ marginRight: "8px" }}>Public Dev Viewer:</strong>
        {PAGES.map((p) => (
          <Link
            key={p.id}
            href={`/dev/public?page=${p.id}&state=${state}&theme=${theme}&lang=${locale}`}
            style={{
              color: page === p.id ? "var(--ink)" : "var(--ink-2)",
              fontWeight: page === p.id ? "bold" : "normal",
              textDecoration: page === p.id ? "underline" : "none",
            }}
          >
            {p.label}
          </Link>
        ))}

        <div style={{ marginLeft: "auto", display: "flex", gap: "12px", alignItems: "center" }}>
          <div style={{ display: "flex", gap: "6px", alignItems: "center" }}>
            <span style={{ color: "var(--ink-2)" }}>State:</span>
            {(["default", "empty", "error", "answered", "abstained", "offline"] as const).map((st) => (
              <Link
                key={st}
                href={`/dev/public?page=${page}&state=${st}&theme=${theme}&lang=${locale}`}
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
                href={`/dev/public?page=${page}&state=${state}&theme=${th}&lang=${locale}`}
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

          <div style={{ display: "flex", gap: "6px", alignItems: "center", borderLeft: "1px solid var(--rule)", paddingLeft: "12px" }}>
            <span style={{ color: "var(--ink-2)" }}>Lang:</span>
            {(["en", "ha", "yo", "ig", "pcm"] as const).map((l) => (
              <Link
                key={l}
                href={`/dev/public?page=${page}&state=${state}&theme=${theme}&lang=${l}`}
                style={{
                  color: locale === l ? "var(--ink)" : "var(--ink-2)",
                  fontWeight: locale === l ? "bold" : "normal",
                  textDecoration: locale === l ? "underline" : "none",
                }}
              >
                {l}
              </Link>
            ))}
          </div>
        </div>
      </div>

      <main style={{ flex: 1 }}>
        <PublicShell t={t} theme={theme}>
          {renderContent()}
        </PublicShell>
      </main>
    </div>
  );
}
