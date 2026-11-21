import Link from "next/link";
import { sessionRequest } from "../../../../../lib/session";
import { formatReportTime } from "../../../report-details";
import { WorkflowForm } from "../../../workflow-form";

export const matchDecisions = {
  pending: "Awaiting review",
  confirmed: "Confirmed by Reviewer",
  dismissed: "Dismissed by Reviewer",
} as const;

type Triage = {
  method_version: string;
  attempted_at?: string;
} & ({
  status: "pending" | "failed";
} | {
  status: "ready";
  category: string;
  corrected_category: string;
  categories: Record<string, string>;
  matches?: {
    reference: string;
    location: string;
    occurred_at: string;
    decision: keyof typeof matchDecisions;
  }[];
});

async function loadTriage(reference: string): Promise<Triage | null> {
  try {
    const response = await sessionRequest(`review/${reference}/triage`);
    return response.ok ? await response.json() : null;
  } catch {
    return null;
  }
}

export async function TriagePanel({ reference, version }: { reference: string; version: number }) {
  const triage = await loadTriage(reference);
  const path = `/api/review/${reference}/triage`;
  return (
    <section className="review-section">
      <h2>Triage suggestions</h2>
      <p>Suggestions are for internal observation review. ElectraGuard AI supports incident documentation alongside Nigeria’s official electoral processes.</p>
      {triage?.status === "pending" && <p>Triage is pending. You can continue reviewing this case.</p>}
      {(!triage || triage.status === "failed") && <p>Triage is unavailable. You can continue reviewing this case.</p>}
      {triage && <p><small>Method {triage.method_version}{triage.attempted_at && ` · ${formatReportTime(triage.attempted_at)}`}</small></p>}
      {triage?.status === "ready" && (
        <>
          <p>Suggested category: <strong>{triage.categories[triage.category]}</strong></p>
          {triage.corrected_category && <p>Reviewer category: <strong>{triage.categories[triage.corrected_category]}</strong></p>}
          <WorkflowForm key={version} path={`${path}/category`} version={version} label="Save category correction">
            <label htmlFor="triage-category">Correct category</label>
            <select id="triage-category" name="category" defaultValue={triage.corrected_category || triage.category} required>
              {Object.entries(triage.categories).map(([value, label]) => (
                <option key={value} value={value}>{label}</option>
              ))}
            </select>
          </WorkflowForm>
          {triage.matches && <>
          <h3>Possible duplicate reports</h3>
          {triage.matches.length === 0 ? <p>No possible matches among cases assigned to you.</p> : (
            <ul className="report-list">
              {triage.matches.map((match) => (
                <li key={match.reference}>
                  <Link href={`/workspace/reviewer/cases/${match.reference}`} prefetch={false}>{match.location}</Link>
                  <p>{formatReportTime(match.occurred_at)} · {matchDecisions[match.decision]}</p>
                  {match.decision === "pending" && (
                    <WorkflowForm key={version} path={`${path}/matches/${match.reference}`}
                      version={version} label="Save match decision">
                      <label htmlFor={`match-${match.reference}`}>Possible match decision</label>
                      <select id={`match-${match.reference}`} name="decision" defaultValue="" required>
                        <option value="">Choose a decision</option>
                        <option value="confirmed">Confirm match</option>
                        <option value="dismissed">Dismiss match</option>
                      </select>
                    </WorkflowForm>
                  )}
                </li>
              ))}
            </ul>
          )}
          </>}
        </>
      )}
    </section>
  );
}
