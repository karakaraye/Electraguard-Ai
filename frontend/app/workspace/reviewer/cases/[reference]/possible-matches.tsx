"use client";

import Link from "next/link";
import { useRouter } from "next/navigation";
import { useRef, useState, useTransition, type FormEvent } from "react";
import { csrfPost } from "../../../../../lib/auth-client";
import { formatReportTime } from "../../../report-details";
import { WorkflowForm } from "../../../workflow-form";
import { matchDecisions, type PossibleMatch } from "./match-decisions";

const reasonLimit = 2000;

export function PossibleMatches({ reference, version, matches }: {
  reference: string;
  version: number;
  matches: PossibleMatch[];
}) {
  const router = useRouter();
  // Blocks a second request before React re-renders the disabled controls.
  const inFlight = useRef(false);
  const [candidate, setCandidate] = useState<string | null>(null);
  const [confirming, setConfirming] = useState(false);
  const [reason, setReason] = useState("");
  const [pending, setPending] = useState(false);
  const [error, setError] = useState("");
  const [notice, setNotice] = useState("");
  const [refreshing, startRefresh] = useTransition();
  const busy = pending || refreshing;

  // Candidate details come only from the latest server data. After a refresh,
  // a match the Reviewer can no longer see or that is no longer confirmed closes the form.
  const target = matches.find((match) => match.reference === candidate && match.decision === "confirmed");

  function reset() {
    setCandidate(null);
    setConfirming(false);
    setReason("");
    setError("");
  }

  function refresh() {
    startRefresh(() => router.refresh());
  }

  function begin(match: PossibleMatch) {
    if (inFlight.current || busy) return;
    reset();
    setNotice("");
    setCandidate(match.reference);
  }

  function review(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    const trimmed = reason.trim();
    if (!trimmed) {
      setError("Enter a reason for reversing this match.");
      return;
    }
    if (trimmed.length > reasonLimit) {
      setError(`Keep the reason to ${reasonLimit.toLocaleString("en")} characters or fewer.`);
      return;
    }
    setError("");
    setConfirming(true);
  }

  async function submit() {
    if (!target || inFlight.current || refreshing) return;
    inFlight.current = true;
    setPending(true);
    setError("");
    try {
      const response = await csrfPost(
        `/api/review/${reference}/triage/matches/${target.reference}/reverse`,
        JSON.stringify({ version, reason: reason.trim() }),
        { "Content-Type": "application/json" },
      );
      if (response.ok) {
        reset();
        setNotice("Reversed. Both reports and the original confirmation remain in the audit history.");
        refresh();
      } else if (response.status === 409) {
        reset();
        setNotice("This case or match changed before the reversal was saved. The case has been refreshed. Check the current match status before trying again.");
        refresh();
      } else if (response.status === 403 || response.status === 404) {
        reset();
        setNotice("Your access to one of these reports has changed. The case has been refreshed.");
        refresh();
      } else if (response.status === 400) {
        const details = Object.values(await response.json()).flat();
        setConfirming(false);
        setError(details.find((detail): detail is string => typeof detail === "string")
          ?? "Check the reason and try again.");
      } else {
        setError("The reversal could not be confirmed. Refresh the case before trying again.");
      }
    } catch {
      setError("The reversal could not be confirmed. Refresh the case before trying again.");
    } finally {
      inFlight.current = false;
      setPending(false);
    }
  }

  return (
    <>
      {notice && <p role="status" className="match-notice">{notice}</p>}
      {matches.length === 0 ? <p>No possible matches among cases assigned to you.</p> : (
        <ul className="report-list">
          {matches.map((match) => (
            <li key={match.reference}>
              <Link href={`/workspace/reviewer/cases/${match.reference}`} prefetch={false}>{match.location}</Link>
              <p>{formatReportTime(match.occurred_at)} · {matchDecisions[match.decision]}</p>
              {match.decision === "pending" && (
                <WorkflowForm key={version} path={`/api/review/${reference}/triage/matches/${match.reference}`}
                  version={version} label="Save match decision">
                  <label htmlFor={`match-${match.reference}`}>Possible match decision</label>
                  <select id={`match-${match.reference}`} name="decision" defaultValue="" required>
                    <option value="">Choose a decision</option>
                    <option value="confirmed">Confirm match</option>
                    <option value="dismissed">Dismiss match</option>
                  </select>
                </WorkflowForm>
              )}
              {match.decision === "confirmed" && target?.reference !== match.reference && (
                <button type="button" className="secondary-button" disabled={busy}
                  onClick={() => begin(match)}>Reverse match</button>
              )}
              {target?.reference === match.reference && (
                <section className="match-reversal" aria-labelledby={`reverse-${match.reference}`}>
                  <h4 id={`reverse-${match.reference}`}>Reverse confirmed match</h4>
                  <dl className="report-details">
                    <dt>Matched report</dt><dd>{target.reference}</dd>
                    <dt>Approximate location</dt><dd>{target.location}</dd>
                    <dt>Incident date and time</dt><dd>{formatReportTime(target.occurred_at)}</dd>
                  </dl>
                  {!confirming ? (
                    <form onSubmit={review} noValidate>
                      <fieldset disabled={busy}>
                        <label htmlFor={`reverse-reason-${match.reference}`}>Reason for reversal</label>
                        <textarea id={`reverse-reason-${match.reference}`} value={reason} rows={3}
                          maxLength={reasonLimit} required aria-describedby={`reverse-hint-${match.reference}`}
                          onChange={(event) => setReason(event.target.value)} />
                        <small id={`reverse-hint-${match.reference}`}>
                          Required. Up to {reasonLimit.toLocaleString("en")} characters.
                        </small>
                        <button>Continue</button>
                        <button type="button" className="secondary-button" onClick={reset}>Cancel</button>
                      </fieldset>
                    </form>
                  ) : (
                    <div className="match-confirm">
                      <p>
                        Reverse the confirmed match between this case and report {target.reference}?
                        The link will no longer count toward a shared incident. Both reports and the
                        original confirmation remain in the audit history.
                      </p>
                      <p className="review-note">Reason: {reason.trim()}</p>
                      <fieldset disabled={busy}>
                        <button type="button" onClick={submit}>{pending ? "Reversing…" : "Confirm reversal"}</button>
                        <button type="button" className="secondary-button"
                          onClick={() => setConfirming(false)}>Back</button>
                      </fieldset>
                    </div>
                  )}
                  {error && <p role="alert">{error}</p>}
                </section>
              )}
            </li>
          ))}
        </ul>
      )}
    </>
  );
}
