import Link from "next/link";
import { redirectToWorkspace, sessionRequest } from "../../../../lib/session";

type Counts = { label: string; count: number }[];
type Dashboard = {
  report_count: number;
  incident_count: number;
  statuses: Counts;
  categories: Counts;
};

function Breakdown({ title, counts }: { title: string; counts: Counts }) {
  return (
    <section className="review-section">
      <h2>{title}</h2>
      <table className="dashboard-table">
        <thead><tr><th scope="col">{title === "Reports by status" ? "Status" : "Category"}</th><th scope="col">Reports</th></tr></thead>
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
      <p>ElectraGuard AI supports election observation and incident documentation alongside Nigeria’s existing electoral processes.</p>

      <form method="get">
        <fieldset>
          <legend>Incident dates (WAT)</legend>
          <label htmlFor="dashboard-start">From</label>
          <input id="dashboard-start" name="start" type="date" defaultValue={start} />
          <label htmlFor="dashboard-end">Through</label>
          <input id="dashboard-end" name="end" type="date" defaultValue={end} />
        </fieldset>
        <button>Apply date filter</button>
      </form>

      {data ? (
        <>
          <dl className="dashboard-totals">
            <div><dt>Submitted reports</dt><dd>{data.report_count}</dd></div>
            <div><dt>Distinct incidents</dt><dd>{data.incident_count}</dd></div>
          </dl>
          <p>Submitted reports include all review statuses. Reviewer-confirmed links group reports into incidents.</p>
          <Breakdown title="Reports by status" counts={data.statuses} />
          <Breakdown title="Reports by category" counts={data.categories} />
        </>
      ) : <p role="alert">Enter valid dates with the start on or before the end date.</p>}
    </section>
  );
}
