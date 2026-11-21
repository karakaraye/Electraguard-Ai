import Link from "next/link";
import { redirectToWorkspace, sessionRequest } from "../../../../lib/session";

type Counts = { label: string; count: number }[];
type Dashboard = {
  report_count: number;
  incident_count?: number;
  statuses: Counts;
  categories: Counts;
  outcomes: Counts;
};

function Breakdown({ title, column, counts }: { title: string; column: string; counts: Counts }) {
  return (
    <section className="review-section">
      <h2>{title}</h2>
      <table className="dashboard-table">
        <thead><tr><th scope="col">{column}</th><th scope="col">Reports</th></tr></thead>
        <tbody>{counts.map(({ label, count }) => (
          <tr key={label}><th scope="row">{label}</th><td>{count}</td></tr>
        ))}</tbody>
      </table>
    </section>
  );
}

export default async function DashboardPage({ searchParams }: {
  searchParams: Promise<{ start?: string; end?: string }>;
}) {
  const { start, end } = await searchParams;
  const filters = new URLSearchParams();
  if (start) filters.set("start", start);
  if (end) filters.set("end", end);
  const response = await sessionRequest(`dashboard?${filters}`);
  if (response.status === 403 || response.status === 401) await redirectToWorkspace();
  if (!response.ok && response.status !== 400) throw new Error("Could not retrieve the dashboard.");
  const data: Dashboard | null = response.ok ? await response.json() : null;

  return (
    <section className="panel">
      <h1>Observation dashboard</h1>
      <p><Link href="/workspace/administrator">Administrator Workspace</Link></p>
      <p><strong>Internal observation data</strong></p>
      <p>Counts describe reports received by this workspace. They do not measure election-wide coverage. Electoral authorities retain responsibility for official determinations.</p>

      <form method="get">
        <fieldset>
          <legend>Incident dates (WAT)</legend>
          <label htmlFor="dashboard-start">From</label>
          <input id="dashboard-start" name="start" type="date" defaultValue={start} />
          <label htmlFor="dashboard-end">Through</label>
          <input id="dashboard-end" name="end" type="date" defaultValue={end} />
        </fieldset>
        <button>Apply date filter</button>
        {(start || end) && <Link href="/workspace/administrator/dashboard">Reset dates</Link>}
      </form>

      {data ? (
        <>
          <dl className="dashboard-totals">
            <div><dt>Submitted reports</dt><dd>{data.report_count}</dd></div>
            {data.incident_count !== undefined && <div><dt>Distinct incident groups</dt><dd>{data.incident_count}</dd></div>}
          </dl>
          <p>Submitted reports include all review statuses within the selected incident dates. Both dates are inclusive in West Africa Time. Assessment outcomes count closed reports.</p>
          {data.report_count === 0 && <p>No reports in the selected incident dates.</p>}
          {data.incident_count !== undefined && <p>Reviewer-confirmed links group reports into incidents.</p>}
          <Breakdown title="Reports by status" column="Status" counts={data.statuses} />
          <Breakdown title="Closed reports by outcome" column="Outcome" counts={data.outcomes} />
          <Breakdown title="Reports by category" column="Category" counts={data.categories} />
        </>
      ) : <p role="alert">Enter valid dates with the start on or before the end date.</p>}
    </section>
  );
}
