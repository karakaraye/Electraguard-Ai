import Link from "next/link";
import { notFound } from "next/navigation";
import { redirectToWorkspace, sessionRequest } from "../../../../../lib/session";
import { reportStatuses, reviewOutcomes, type ReviewCase } from "../../../observer/report-types";
import { formatReportTime, ReportDetails } from "../../../report-details";
import { WorkflowForm } from "../../../workflow-form";
import { matchDecisions } from "./match-decisions";
import { TriagePanel } from "./triage-panel";
import { Suspense } from "react";

export default async function ReviewCasePage({ params }: { params: Promise<{ reference: string }> }) {
  const { reference } = await params;
  if (!/^[0-9a-f-]{36}$/.test(reference)) notFound();
  const response = await sessionRequest(`review/${reference}`);
  if (response.status === 403 || response.status === 401) await redirectToWorkspace();
  if (response.status === 404) notFound();
  if (!response.ok) throw new Error("Could not retrieve the review case.");
  const report: ReviewCase = await response.json();
  const actionPath = `/api/review/${reference}/actions`;

  return (
    <section className="panel">
      <h1>Review case</h1>
      <p><Link href="/workspace/reviewer/cases">Review queue</Link></p>
      <p>Review decisions are internal observation assessments. Official electoral decisions remain with the appropriate authorities.</p>
      <ReportDetails report={report} />

      {report.status === "submitted" && (
        <WorkflowForm key={report.version} path={actionPath} version={report.version}
          action="start" label="Start review" />
      )}
      {report.status === "in_review" && (
        <section className="review-section">
          <h2>Review actions</h2>
          <WorkflowForm key={`clarify-${report.version}`} path={actionPath} version={report.version}
            action="request_clarification" label="Request clarification">
            <label htmlFor="clarification-request">Question for the Observer</label>
            <textarea id="clarification-request" name="note" maxLength={2000} rows={3} required />
          </WorkflowForm>
          <WorkflowForm key={`close-${report.version}`} path={actionPath} version={report.version}
            action="close" label="Close case">
            <label htmlFor="outcome">Internal assessment outcome</label>
            <select id="outcome" name="outcome" defaultValue="" required>
              <option value="">Choose an outcome</option>
              {Object.entries(reviewOutcomes).map(([value, label]) =>
                <option key={value} value={value}>{label}</option>
              )}
            </select>
            <label htmlFor="rationale">Closing rationale</label>
            <textarea id="rationale" name="note" maxLength={2000} rows={4} required />
          </WorkflowForm>
        </section>
      )}
      {report.status === "needs_clarification" && <p>Awaiting a clarification response from the Observer.</p>}

      <Suspense fallback={<p>Loading triage suggestions…</p>}>
        <TriagePanel reference={reference} version={report.version} />
      </Suspense>
      <section className="review-section">
        <h2>Audit history</h2>
        <ol className="report-list">
          {report.history.map(({ version, action_label, actor, created_at, change }) => (
            <li key={version}>
              <strong>{action_label}</strong>
              <p>{actor} · {formatReportTime(created_at)}</p>
              {change.reviewer && <p>{change.previous_reviewer ?? "Unassigned"} → {change.reviewer}</p>}
              {change.from_status && change.to_status &&
                <p>{reportStatuses[change.from_status]} → {reportStatuses[change.to_status]}</p>}
              {change.outcome && <p>{reviewOutcomes[change.outcome]}</p>}
              {change.category && <p>{change.previous_category} → {change.category}</p>}
              {change.match_decision && change.candidate &&
                <p>{matchDecisions[change.match_decision]} · {change.candidate}</p>}
              {change.previous_decision && change.candidate &&
                <p>{matchDecisions[change.previous_decision]} → {matchDecisions.reversed} · {change.candidate}</p>}
              {change.reason && <p className="review-note">Reason: {change.reason}</p>}
              {change.note && <p className="review-note">{change.note}</p>}
            </li>
          ))}
        </ol>
      </section>
    </section>
  );
}
