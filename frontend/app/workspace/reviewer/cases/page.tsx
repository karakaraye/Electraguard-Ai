import Link from "next/link";
import { redirectToWorkspace, sessionRequest } from "../../../../lib/session";
import { reportStatuses, type Report } from "../../observer/report-types";

export default async function ReviewQueue() {
  const response = await sessionRequest("review");
  if (response.status === 403 || response.status === 401) await redirectToWorkspace();
  if (!response.ok) throw new Error("Could not retrieve your case queue.");
  const reports: Report[] = await response.json();

  return (
    <section className="panel">
      <h1>Review queue</h1>
      <p><Link href="/workspace/reviewer">Reviewer Workspace</Link></p>
      {reports.length === 0 && <p>You have no assigned cases.</p>}
      <ul className="report-list">
        {reports.map((report) => (
          <li key={report.reference}>
            <Link href={`/workspace/reviewer/cases/${report.reference}`} prefetch={false}>
              {report.location}
            </Link>
            <p>{reportStatuses[report.status]} · {report.reference}</p>
          </li>
        ))}
      </ul>
    </section>
  );
}
