# Review: C16, C17 and C18 backend (PRs #27, #28, #29)

Date: 24 Nov 2026 · Reviewer: Claude (supervisor) · Verdict: **changes required on all three. Do not merge yet.**

Method:
- I read the diffs of 2bfa154 (C16), 66ccf38 (C17) and 9145f94 (C18) against `production-readiness`.
- I ran the redactor directly on sample election text.
- I checked the CI logs.
- I spot-checked the key findings in the code myself.

Commits are clean: owner identity, plain messages, no trailers.

## Applies to all three

- **B0. The new tests never ran in CI.**
  - `.github/workflows/verify.yml` runs `manage.py test` with an explicit list of apps that leaves out `privacy` and `clocks`.
  - CI reported 268 tests for both C17 and C18, so the 8 clock tests and the 14 privacy tests were never run.
  - Add both apps to the list (or run `manage.py test` with no app list).
  - Run the **full** suite on PostgreSQL 17 and report the exact pass, fail and skip counts.
  - The slice reports show partial runs on PostgreSQL 18 only.
- **Fix order.** Fix C16 first, then rebase C17 on it, then rebase C18 on C17. Keep one branch and one PR per slice. Push fixes as new commits on the same branches; do not open new PRs.

## C16 · redaction (PR #27)

### Blocking

1. **CASE-01 still returns the raw text.**
   - `reports/reviewer_views.py:324` puts `"original": {"description": report.description, ...}` in the response.
   - Any staff member who can open a case gets the original without a reason or an audit event, which defeats CASE-06.
   - Remove the raw text from CASE-01 entirely. The only way to get it is CASE-06.
2. **Manual redaction wipes out the automatic one.**
   - `apply_redaction` (`reviewer_views.py` ~497–525) builds `redacted_description` from the original `report.description`.
   - Example: the reviewer redacts a name, and the phone number that was hidden automatically comes back.
   - Build manual redaction on top of `auto_redacted_description`, and keep both span lists.
3. **Message, reply, post and transcript text still reaches staff unredacted.**
   - `reviewer_views.py:266`: the observer reply `event.change["note"]` is shown raw in the case conversation.
   - `reports/serializers.py:89`: `ReviewEventSerializer` returns the raw note and `reply.body`.
   - `reports/serializers.py:20`: `ReportSerializer` (the legacy `/api/review` queue) falls back to the raw `description`.
   - `discussions/views.py:84,87`: `post_display` returns the raw `post.body`. `auto_redacted_body` is written but never read.
   - Transcripts (`media_lifecycle.py:56`, served by `reviewer_views.py:244`) are raw.
4. **There is no single safe path, and no guard test.**
   - Make `safe_text()` handle reports, messages, replies, posts and transcripts explicitly. Today anything without `description` falls through to `str(obj)`.
   - Route every staff read through it.
   - Add a test that creates each object type with a phone number and a name, calls every staff endpoint (Q-01, CASE-01, case conversation, `/api/review`, DIS lists, transcripts, OPS, public snapshot, audit export), and fails if the raw value appears in any response.
5. **CASE-06 is incomplete.**
   - Add `Cache-Control: no-store`.
   - The audit row stores only a digest; store the reason, readable by auditors. Never store the text.
   - Set `original_available` from whether the text actually changed. It is hard-coded `True` at `reviewer_views.py:313`.
   - Add tests for the rate limit (31st call returns 429) and for a reviewer from another organisation (403).
   - Return exactly `{ "description": "<original>" }`; drop the duplicate `original_description`.
6. **False positives on ordinary election text.**
   - `privacy/redactor.py:302` uses `prefix.lower().endswith(title)`, so any word ending in "ms", "sen", "col" or "imam" counts as a title.
     - Examples: "forms delivered" → `[NAME]`; "chosen by"; "Chief Imam prayed".
     - Fix: a title must be a whole word, and the following word must be capitalised.
   - Names-list matches must also be capitalised. Today "items musa" is matched.
   - Address: "way" and "drive" catch "on the way" and "expressway". Require a capitalised street name between the number and the street word.
   - Account: "serial 0012345678 account of votes" becomes `[ACCOUNT]`. The keyword must come **before** the digits.
7. **Recall gaps against the spec.**
   - NIN or BVN anywhere within 30 characters (today only punctuation may sit between): "NIN of the voter is 12345678901".
   - `a/c 0123456789`.
   - Any VIN of 19 letters and digits near VIN or PVC (today only the `90F5…` prefix is caught).
   - Phones written `(0803) 123 4567` or with double spaces.
8. **The evaluation measures nothing.**
   - `privacy/generate_and_eval.py` builds the set from 6 templates per language with fixed values: 184 of 310 items are unique, and every VIN starts `90F5`. The same code then scores it.
   - Matching credits any substring overlap.
   - Replace it with a set written independently of the regexes:
     - varied phrasing in all five languages;
     - the edge cases in point 7;
     - negative sentences of normal election text (point 6) to measure precision honestly;
     - exact span matching.
   - Report real recall and precision, list every miss, and keep the result even if it is below target.
9. **The backfill skips records.**
   - `redact_existing.py:33–61` (also :66 and :100) uses offset paging over a queryset filtered on the field it fills, so every second batch is skipped while the command still prints "Completed".
   - Page by primary key (`pk__gt=last_pk`) instead.
   - Test it with 1,200 rows.
10. **Withdrawal leaves the redacted copy behind.**
    - `v1_views.py:416–425` must also clear `auto_redacted_description` and `auto_redactions`.
11. **The log test is too narrow.**
    - `test_zero_leaks_in_logs` only watches the "privacy" logger around `redact()`.
    - Capture **all** loggers during a full REP-01 create and an MSG-02 send, and assert that the phone number never appears.

### Non-blocking

- **Organisation secret.** It is HMAC(`SECRET_KEY`, org id) with a hard-coded fallback. Rotating `SECRET_KEY` silently changes every token, and `None` organisations share "default". Prefer a stored random secret per organisation, and remove the hard-coded fallback.
- **Checklist notes and reviewer messages are not redacted.** Redact checklist and result-sheet free text too.
- **Slice report is wrong.** It describes CASE-06 as returning `{ref, original_description}`. Correct it.

## C17 · volume alerts (PR #28)

### Blocking

1. **The false-alarm control is bypassed.**
   - `ops/emerging.py:320` keeps only series with `observed ≥ 2 × expected` **before** the Poisson test, and Benjamini–Hochberg runs only over those survivors. In practice 3 reports against the 0.5 floor pass with m = 1.
   - Run the Poisson test on **every** series × window with at least one report.
   - Apply Benjamini–Hochberg across all of them in the run, so that m is the full family.
   - Then require observed ≥ 3 and a q-value of 0.05 or less.
   - Remove the 2× pre-filter.
2. **Drift opens warnings on its own** (`:335`, `:413–433`). The spec says drift only adds evidence to an open, unreviewed warning in the same series. It never opens one.
3. **Simulator reports are not excluded.**
   - `is_simulator_report` (`:98–107`) checks `is_simulator`, `reporter_type` and `observer.role`, none of which exist.
   - The real flag is `incident_details["simulated"]`, as in `phone_channels/intake.py:22` and `intelligence/triage.py:84`.
   - The test passes only because it sets its own fake flag. Use the real flag in both the code and the test.
4. **Joining warnings is wrong.**
   - `:380–385` and the fallback at `:177–179` match on window overlap only.
   - A spike right after a coordinator reviews a warning gets merged into the reviewed one and disappears from the open list.
   - An open warning older than 60 minutes gets a duplicate instead.
   - Join only an **open, unreviewed** warning for the same organisation, category and LGA, regardless of window age, ordered by most recent.
   - Make it race-safe: lock the organisation as today, or add a partial unique constraint.
5. **`explanation_key` and `explanation_params` are missing** from `ops/clusters.py` `warning_json`. Both are part of G17.
   - Key, for example: `ops.alert.spike`.
   - Params: `{count, category, lga_name, window_minutes, expected}`.
6. **No coordinator notification.**
   - The only signal is the audit row that already existed.
   - Notify once per warning through the existing staff alert path (`StaffSecurityAlert` or the OPS notification mechanism), and record it.
   - Test that it fires exactly once across repeated runs.
7. **CUSUM does not match the spec.**
   - The hourly buckets start at 06:00, not 07:00 WAT.
   - The partial current hour counts as a full hour; exclude it, or scale it.
   - The reference mean must be baseline (a), not the series' own history plus a variance term.
8. **The evaluation is not honest.**
   - `generate_and_eval.py` re-implements the detector instead of calling `detect_emerging`, and its copy already differs from the shipped code.
   - The 10 quiet days are not replayed.
   - False alarms are counted per 5-minute tick, not per warning.
   - It reports the mean time to detect, not the median.
   - The drift surges are outside the specified 4–15 reports over 15–60 minutes.
   - The background is too sparse, so `expected` sits at the 0.5 floor.
   - Key Finding 2 says false alarms "dropped significantly", while the table shows them rising from 2.33 to 3.25 per hour.
   - What to do:
     - Replay through the real `detect_emerging` with a realistic background (the 900-unit day).
     - Use 20 surges inside the specified sizes, plus 10 quiet days.
     - Count false alarms per distinct warning.
     - Report the median.
     - Write the findings from the actual numbers.

### Non-blocking

- **Peer median.** Count peer LGAs with zero reports as 0 instead of dropping them. Skip baseline (b) when `state_code` is blank.
- **Queries.** Add `select_related` and avoid loading the observer per report (thousands of queries per run).
- **Threshold baseline.** Threshold warnings serialise `baseline` as `"same_area_earlier"`. Return `null` for `detector="threshold"`.
- **Old test changed silently.** `test_observations.py:41–48` was weakened and now depends on the time of day. Freeze the time, restore the exact assertion, and disclose the behaviour change in the slice report.
- **Worker command.** `--once` is `store_true` with `default=True`, so loop mode is unreachable. Catch and log errors per organisation in the loop.
- **Eval module.** Move `generate_and_eval.py` out of the app package: no `django.setup()` at import. `scripts/eval/` is the place.
- **Wards.** Ward-level series are not implemented, although the slice report says they are. Either implement them internally or correct the report.

## C18 · review clocks (PR #29)

### Blocking

1. **CASE-01 has no `clock` field.** `case()` in `reviewer_views.py:316–360` never adds it, although the slice report says it does.
2. **The clock starts at the wrong time.**
   - `clocks/calculator.py:61` uses `report.occurred_at`, the time the observer says the incident happened.
   - Start at the server received time (`created_at`).
3. **Clocks are created only when someone reads a list.**
   - `get_or_create_clock` runs only inside `queue_item`, so an unassigned urgent report that nobody opens never gets a clock and never alerts.
   - Create the clock in the same transaction as the report, on every intake path: REP-01, SMS/USSD, the citizen form and REP-05 if it applies.
   - Add a backfill command for open cases.
4. **`minutes_left` never goes negative.** It is clamped with `max(0, …)` at `calculator.py:97`, and `tests.py:105` asserts 0. The contract says it is negative when overdue.
5. **The question-reply clock does not exist.**
   - REQUEST_CLARIFICATION pauses and then stops the clock (`workflow.py:60–73`), and `resume_clock` does nothing on a stopped clock.
   - The intended behaviour:
     - The review clock stops at the first reviewer action, a formal question included.
     - When the observer replies (`conversation.py:184`, `citizen_views.py:232`), start a separate `question_reply` clock (kind field, target from settings).
     - That clock stops when staff respond.
   - The pause and resume path is dead code today; remove it or make it real.
6. **Changing urgency does nothing.**
   - Hook the CASE-03 urgency correction (`decide_suggestion`, `reviewer_views.py:486–491`) to recompute `due_at` from the original start.
   - `resolve_urgency` reads `triage.suggested_urgency`, which does not exist. Use the same urgency the Q-01 row shows (`urgency.level`), so the clock and OPS-01 agree.
7. **Deploying will flood coordinators.**
   - Cases already in review get running clocks and an overdue alert each on the first sweep.
   - Cases with a reviewer action already recorded must be created stopped.
8. **Stopped clocks keep their state.**
   - A case started late stays `overdue` forever, is counted in OPS-01 and is listed by `clock_state=overdue`.
   - A stopped clock is not overdue. Return `state: "stopped"` or `null`, and exclude stopped clocks from the filter and from OPS-01.
   - `clock_state` itself stays `on_time|due_soon|overdue`, for running clocks only.
9. **The sweep can alert twice.**
   - `clocks/sweep.py` reads and writes without a lock.
   - Use `select_for_update(skip_locked=True)` or a conditional `UPDATE … WHERE notified_at IS NULL`, and send the alert only if a row was updated.
   - Notify through the same coordinator path as C17, not only an audit row.
   - Test two sweeps running at once.
10. **Tests.**
    - They call the calculator directly and never go through the workflow.
    - Add, through the API:
      - the urgency change;
      - the question-reply clock;
      - withdrawal;
      - organisation isolation;
      - WAT output;
      - concurrent sweeps;
      - CASE-01 `clock`;
      - the `due_at` sort;
      - negative `minutes_left`;
      - cases created before deploy;
      - an ADM-04 partial update.

### Non-blocking

- **Q-01 sort.** Filtering by `clock_state` must sort by `due_at`; today the sort is unchanged.
- **Writes on read.** GET requests write clock rows and states. Once point 3 is fixed, make reads read-only and add `select_related("clock")`.
- **Withdraw.** Stop the clock in the WITHDRAW path itself, not on the next sweep.
- **Swallowed errors.** Remove `except Exception: pass` at `workflow.py:66,72` and `reviewer_views.py:124`. It hides bugs, and in PostgreSQL it leaves the transaction aborted anyway.
- **ADM-04.**
  - Allow a partial `review_targets` update.
  - Use the field error code `field_invalid`.
  - Recompute `due_at` on open clocks when targets change.
- **Worker command.** Same `--once` and error-handling fix as C17.
- **Extra routes.** `cases` and `cases/<uuid>` were added outside the contract. Remove them, or explain them in the slice report.

## What happens next

- Antigravity fixes the blocking items in order: C16, then C17, then C18.
- I re-review each one as it lands.
- I start the front end on `design/c16-c18-ui` against the corrected shapes once each PR passes:
  - CASE-01 `redaction`, `original_available` and `clock`;
  - CASE-06;
  - OPS-02 detector fields with `explanation_key`;
  - OPS-01 `overdue`;
  - ADM-04 `review_targets`.
