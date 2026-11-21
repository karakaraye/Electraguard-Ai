import Link from "next/link";
import { redirectToWorkspace, sessionRequest } from "../../../../lib/session";
import { reportStatuses, type Report } from "../report-types";
import { formatReportTime } from "../../report-details";

export default async function MyReports() {
  const response = await sessionRequest("reports");
  if (response.status === 403 || response.status === 401) await redirectToWorkspace();
  if (!response.ok) throw new Error("Could not retrieve your reports.");
  const reports: Report[] = await response.json();
  reports.sort((first, second) =>
    Number(second.status === "needs_clarification") - Number(first.status === "needs_clarification"));

  return (
    <section className="panel">
      <h1>My Reports</h1>
      <p><Link href="/workspace/observer#new-report">New report</Link></p>
      <p>After an interrupted submission, check this list for your report before submitting again.</p>
      {reports.length === 0 && <p>You have no reports yet.</p>}
      <ul className="report-list">
        {reports.map((report) => (
          <li key={report.reference}>
            <a href={`/workspace/observer/reports/${report.reference}`}>
              {report.location}
            </a>
            <p>{reportStatuses[report.status]} · {report.reference}</p>
            <p>{formatReportTime(report.occurred_at)}</p>
          </li>
        ))}
      </ul>
    </section>
  );
}
