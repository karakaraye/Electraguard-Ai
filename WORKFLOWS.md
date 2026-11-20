# Track 5 page and action plan

The approved interface uses white surfaces, charcoal text, and green for primary actions. Desktop review keeps the queue next to the selected case. Mobile reporting and status use one column. Installation starts with an empty database.

| Page or state | Actions and response |
| --- | --- |
| **File a report** | Enter an approximate area and WAT incident time, select a category and firsthand status, and describe the observation. Validate required fields. Offer optional private-device storage. Submit creates an immutable attempt and opens its delivery state. |
| **Report queued or pending** | Enter the organisation access code and send or retry. A lost acknowledgement leaves the attempt available with the same key. Invalid access preserves the report and clears the code. Removing pending text asks for confirmation and only affects the device. An opted-in attempt can be restored after reload and expires after 24 hours. |
| **Report received** | Display the server reference and offer show, hide, or copy for the private receipt. Check status opens the lookup using the current receipt. File another clears the current receipt from the page and opens an empty form. |
| **Check report status** | Submit the private receipt over the same origin. Display only reference, receipt time, and status. Missing, invalid, and temporarily unreachable responses have distinct feedback. Back to reporting returns to the report state. |
| **Reviewer sign in** | Authenticate with a Django session. An invalid credential leaves the sign-in form available. Sign-out clears the session and returns to sign-in. |
| **Review queue** | Filter by status and search by area or reference. Results are permission-scoped before limiting. Select a row to open its details. Start review for a received report, record an outcome for an in-review report, or open history on any visible report. A stale decision refreshes the queue. |
| **Compare reports** | Expand a related report to compare area, incident time, category, firsthand status, and observation. Record a reason to link or keep separate. Reverse a link with a reason. Updates preserve both reports and are checked against both versions. |
| **Assignments** | An authorised coordinator can filter unassigned reports, open a report, select an active reviewer and save. Reassignment removes the previous reviewer's access. Closed cases cannot be reassigned. |
| **Overview** | A coordinator selects a 7- or 30-day receipt window and applies it. Show report totals, linked incident groups, unassigned work, and review progress within the chosen window. |
| **Retention operation** | An operator previews eligible rows using the approved day count. Explicit apply purges those reports and invalidates their receipt codes. |

## Further release work

- Add reviewer and observer usability evidence, assistive-technology checks, and a test of actual low-end devices.
- Validate production intake rate limiting, receipt lifetime, backup expiry, and restoration procedures before field use.
- Evaluate stronger candidate ranking against the existing area and time heuristic using held-out cases. Include same-area false matches and differently worded observations. Preserve human control.

## Verification gates

- Reopen the cached reporting form without server access and restore an opted-in queued report. Reconnect with the original submission key and verify one acknowledgement.
- Confirm an observer receipt returns only status metadata. Confirm unassigned reviewers cannot read or change a report or its related observations.
- Exercise assignment, late reassignment, case closure, both link decisions and stale versions. Verify audit events for accepted writes.
- Inspect the desktop split view and mobile controls with live state, then test keyboard focus, narrow layout and recovery copy.
