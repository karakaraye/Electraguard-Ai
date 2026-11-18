import Link from "next/link";
import { redirectToWorkspace, sessionRequest } from "../../../../lib/session";
import { reportStatuses, type ReportStatus } from "../../observer/report-types";
import { WorkflowForm } from "../../workflow-form";

type Assignments = {
  reports: { reference: string; status: ReportStatus; reviewer: string | null; version: number }[];
  reviewers: { id: number; email: string }[];
};

export default async function AssignmentPage() {
  const response = await sessionRequest("assignments");
  if (response.status === 403 || response.status === 401) await redirectToWorkspace();
  if (!response.ok) throw new Error("Could not retrieve reviewer assignments.");
  const { reports, reviewers }: Assignments = await response.json();

  return (
    <section className="panel">
      <h1>Reviewer assignments</h1>
      <p><Link href="/workspace/administrator">Administrator Workspace</Link></p>
      {reports.length === 0 && <p>There are no open reports to assign.</p>}
      {reviewers.length === 0 && reports.length > 0 && <p>There are no active Reviewers.</p>}
      <ul className="assignment-list">
        {reports.map((report) => {
          const candidates = reviewers.filter((reviewer) => reviewer.email !== report.reviewer);
          const controlId = `reviewer-${report.reference}`;
          return (
            <li key={report.reference}>
              <dl className="report-details">
                <dt>Reference</dt><dd>{report.reference}</dd>
                <dt>Status</dt><dd>{reportStatuses[report.status]}</dd>
                <dt>Assigned Reviewer</dt><dd>{report.reviewer ?? "Unassigned"}</dd>
              </dl>
              {candidates.length > 0 && (
                <WorkflowForm key={report.version} path={`/api/assignments/${report.reference}`}
                  version={report.version} label={report.reviewer ? "Reassign" : "Assign"}>
                  <label htmlFor={controlId}>Active Reviewer</label>
                  <select id={controlId} name="reviewer" defaultValue="" required>
                    <option value="">Choose a Reviewer</option>
                    {candidates.map((reviewer) =>
                      <option key={reviewer.id} value={reviewer.id}>{reviewer.email}</option>
                    )}
                  </select>
                </WorkflowForm>
              )}
            </li>
          );
        })}
      </ul>
    </section>
  );
}
