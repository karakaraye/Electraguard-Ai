import Link from "next/link";
import { redirectToWorkspace, sessionRequest } from "../../../../lib/session";
import { reportStatuses, type Report } from "../report-types";

export default async function MyReports() {
  const response = await sessionRequest("reports");
  if (response.status === 403 || response.status === 401) await redirectToWorkspace();
  if (!response.ok) throw new Error("Could not retrieve your reports.");
  const reports: Report[] = await response.json();

  return (
    <section className="panel">
      <h1>My Reports</h1>
      <p><Link href="/workspace/observer">Observer Workspace</Link></p>
      {reports.length === 0 && <p>You have no reports yet.</p>}
      <ul className="report-list">
        {reports.map((report) => (
          <li key={report.reference}>
            <Link href={`/workspace/observer/reports/${report.reference}`} prefetch={false}>
              {report.location}
            </Link>
            <p>{reportStatuses[report.status]} · {report.reference}</p>
          </li>
        ))}
      </ul>
    </section>
  );
}
