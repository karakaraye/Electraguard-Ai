import { sessionRequest } from "../../../../../lib/session";
import { formatReportTime } from "../../../report-details";
import { WorkflowForm } from "../../../workflow-form";
import type { PossibleMatch } from "./match-decisions";
import { PossibleMatches } from "./possible-matches";

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
  matches: PossibleMatch[];
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
          <h3>Possible duplicate reports</h3>
          <PossibleMatches reference={reference} version={version} matches={triage.matches} />
        </>
      )}
    </section>
  );
}
