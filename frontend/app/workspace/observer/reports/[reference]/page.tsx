import { notFound } from "next/navigation";
import { redirectToWorkspace, sessionRequest } from "../../../../../lib/session";
import { formatReportTime, ReportDetails } from "../../../report-details";
import { WorkflowForm } from "../../../workflow-form";
import { EvidenceForm } from "../../evidence-form";
import type { ObserverReport } from "../../report-types";

export default async function ReportPage({ params }: { params: Promise<{ reference: string }> }) {
  const { reference } = await params;
  if (!/^[0-9a-f-]{36}$/.test(reference)) notFound();
  const response = await sessionRequest(`reports/${reference}`);
  if (response.status === 403 || response.status === 401) await redirectToWorkspace();
  if (response.status === 404) notFound();
  if (!response.ok) throw new Error("Could not retrieve the report.");
  const report: ObserverReport = await response.json();

  return (
    <section className="panel">
      <h1>Incident report</h1>
      <p><a href={"/workspace/observer/reports"}>My Reports</a></p>
      {report.clarification && (
        <section className="review-section">
          <h2>Clarification requested</h2>
          <p className="review-note">{report.clarification}</p>
          <WorkflowForm key={report.version} path={`/api/reports/${reference}/clarification`}
            version={report.version} label="Send clarification">
            <label htmlFor="clarification-response">Clarification response</label>
            <textarea id="clarification-response" name="note" maxLength={2000} rows={4} required />
          </WorkflowForm>
        </section>
      )}
      <ReportDetails report={report} />
      {report.status === "closed" ? (
        <section className="review-section">
          <h2>Observation assessment</h2>
          <p>{report.outcome ?? "No outcome is available for this case."}</p>
        </section>
      ) : <EvidenceForm reference={report.reference} />}
      {report.clarification_history?.length > 0 && (
        <section className="review-section">
          <h2>Clarification history</h2>
          <ol className="report-list">
            {report.clarification_history.map(({ action, note, created_at }) => (
              <li key={`${created_at}-${action}`}>
                <strong>{action === "respond" ? "Your reply" : "Clarification requested"}</strong>
                <p>{formatReportTime(created_at)}</p>
                <p className="review-note">{note}</p>
              </li>
            ))}
          </ol>
        </section>
      )}
    </section>
  );
}
