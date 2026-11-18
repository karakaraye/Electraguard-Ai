import Link from "next/link";
import { notFound } from "next/navigation";
import { redirectToWorkspace, sessionRequest } from "../../../../../lib/session";
import { ReportDetails } from "../../../report-details";
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
      <p><Link href="/workspace/observer/reports">My Reports</Link></p>
      <ReportDetails report={report} />
      {report.status === "closed" ? (
        <p>Evidence uploads are unavailable because this case is closed. You can still download existing evidence.</p>
      ) : <EvidenceForm reference={report.reference} />}
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
    </section>
  );
}
