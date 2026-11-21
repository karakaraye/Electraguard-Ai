import Link from "next/link";
import { redirectToWorkspace, sessionRequest } from "../../../../lib/session";
import { reportStatuses, type Report } from "../../observer/report-types";
import { formatReportTime } from "../../report-details";

export default async function ReviewQueue({ searchParams }: { searchParams: Promise<{ status?: string }> }) {
  const { status } = await searchParams;
  const selectedStatus = Object.keys(reportStatuses).find((key) => key === status);
  const response = await sessionRequest("review");
  if (response.status === 403 || response.status === 401) await redirectToWorkspace();
  if (!response.ok) throw new Error("Could not retrieve your case queue.");
  const reports: Report[] = await response.json();
  const visibleReports = selectedStatus ? reports.filter((report) => report.status === selectedStatus) : reports;

  return (
    <section className="panel">
      <h1>Review queue</h1>
      <p><Link href="/workspace/reviewer">Reviewer Workspace</Link></p>
      <form method="get">
        <label htmlFor="queue-status">Filter by status</label>
        <select id="queue-status" name="status" defaultValue={selectedStatus ?? ""}>
          <option value="">All statuses</option>
          {Object.entries(reportStatuses).map(([key, label]) => <option key={key} value={key}>{label}</option>)}
        </select>
        <button>Apply status filter</button>
      </form>
      {visibleReports.length === 0 && <p>{selectedStatus ? "No assigned cases match this status." : "You have no assigned cases."}</p>}
      <ul className="report-list">
        {visibleReports.map((report) => (
          <li key={report.reference}>
            <a href={`/workspace/reviewer/cases/${report.reference}${selectedStatus ? `?status=${selectedStatus}` : ""}`}>
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
