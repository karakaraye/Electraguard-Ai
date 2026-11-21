# ElectraGuard field operations

Use this runbook for a restricted Track 5 deployment. Start with an isolated environment and fictional records. Admit real observers and evidence only after the observation organisation approves the policies below and the release lead records the acceptance results.

## Sign-off before field intake

Record the named person, decision date, evidence links and a deputy for each checkpoint. The titles below identify the required responsibility. The observation organisation assigns people to those responsibilities.

| Sign-off owner | Approval required |
| --- | --- |
| Observation lead | Approved reporting scope and audience, approved observation language, geographic and attendance expectations, out-of-band escalation channel, and named duty coordinator. ElectraGuard assessments describe observations within the workspace. Official electoral decisions remain with the responsible authorities. |
| Data protection lead | Approved notice and lawful basis for processing, consent procedures where applicable, allowed and excluded evidence, observer-visible outcome fields, withdrawal and access-request handling, and retention periods for reports, media, audits and backup copies. |
| Access owner | Named user roster, role approval, credential handoff, revocation response time and support identity-verification procedure. |
| Deployment owner | Verified restricted HTTPS target, secure baseline, isolated backup/restore rehearsal, monitoring and intake pause/resume procedure that preserves the availability of established case work. |
| Field-test lead | Completed phone and accessibility acceptance on the intended devices and network, including the support handoff and a shared-device check. |
| Release lead | All required approvals and proof of the end-to-end workflow, with grouping disabled. Names the person authorized to suspend or reopen intake. |

Store the approved policy and contact route where the field team can find them outside the app. Keep approval records and incident notes in an access-controlled system. Use aliases in test notes.

## Named accounts and devices

1. The access owner records each participant's verified identity, work period, needed role and approver. Use one named account per person and assign the least privileged role needed. Use the application Administrator role only for staff who route cases or reconcile reports.
2. An authorised operator runs the interactive account provisioning command from the correct environment. Example from the repository root on Windows, using a development virtual environment:

   ```powershell
   .\backend\.venv\Scripts\python.exe backend/manage.py provision_account --email observer@your-organisation.example --role observer
   ```

   Supported roles are `observer`, `reviewer` and `administrator`. Verify the configured service and roster before provisioning. Hand off the credential through the approved protected channel. Teach users how to reach support without sending a password or report narrative.
3. Have each person use the approved hostname and verify their expected landing page. Walk observers through a fictional receipt and photo failure. Walk reviewers through clarification and reasoned closure. Have administrators practise assignment and WAT filtering without evidence access.
4. Prefer a controlled private device. For a shared device, close any open evidence downloads, sign out, close the session and verify Back cannot reopen the case. Follow the organisation's approved device procedure for downloads and browser data. A file already downloaded requires device-level handling. Leave personal accounts and device data outside the test scope.
5. For a lost device, suspected credential disclosure or departure, notify the access owner immediately. With approval, run the offboarding command from the verified service environment. Use `credential_risk`, `access_ended` or `role_changed` as appropriate.

   ```powershell
   .\backend\.venv\Scripts\python.exe backend/manage.py offboard_account --email observer@your-organisation.example --authorized-by coordinator@your-organisation.example --reason credential_risk
   ```

   The authorizer must be an active application administrator. Check that sign-in and protected report and attachment URLs fail from the disabled account and its old session. Reroute any open assignments with an active administrator. The command preserves historical case records and records the role, approval and reason. Verify the controls in staging before approving field intake.

## Intake and support

Give observers the approved reporting notice before their first submission. Explain who can see the report and evidence, what the observation team can use them for, how to reach support or exercise a data-rights request, and what happens when a case closes. Use the approved wording for any consent or reporting basis. Record consent only if required by the approved procedure and in the approved system. Use a separate consent process for participant research.

On a weak connection, stay on the current form and use the same report attempt until the receipt arrives. If the page was closed or sign-in expired, check **My Reports** for the reference or matching incident first. For a saved report with a failed photo, retry the attachment or replace it with a supported JPEG or PNG. A still image can be up to 2 MiB and 16 megapixels. When a camera file is unsupported, use the approved device procedure to prepare a compatible copy or proceed with the report text. Do not use an unapproved converter or messaging app for private evidence.

| Situation | First response and escalation |
| --- | --- |
| Unconfirmed report save | Keep the browser open, restore connectivity and retry on the same form. If it was left, sign in and check My Reports before writing again. Escalate a persistent mismatch to the duty coordinator with the reference if shown, the approximate time and the operation that failed. |
| Photo failed after receipt | Confirm the reference, then retry or replace the photo. If the field team proceeds without it, the reviewer assesses the material that is actually available. |
| Clarification pending | Observer opens their own case and answers the specific question. The coordinator handles prolonged inactivity according to the observation team's procedure. |
| Reviewer loses access | Stop opening the case and ask the coordinator to confirm the assignment. An authorised coordinator routes the case without requesting a copy of its evidence. |
| Threat to personal safety or urgent field concern | Use the observation organisation's approved urgent route. An application receipt only acknowledges delivery into the workspace. |
| Suspected disclosure, stolen device or incorrect recipient | Notify the access owner, duty coordinator and data protection lead through the approved incident channel. Restrict affected access and preserve the minimum authorised incident record. |

In support tickets, include environment, role, approximate time, failed action and error class. Add a case reference only when needed in the approved private channel. Exclude passwords, session cookies, intake narratives, screenshots with private details, photos and observer contact information. Record who investigates and when the field team should expect an update.

## Evidence, retention and safe stops

- Capture only what the observation lead and data protection lead have approved. The policy must address faces and identifying documents, precise location, image metadata, consent, device copies, redaction and approved transfer methods. If photography is unsafe or unauthorised, record the observation without a photo.
- Keep uploads within the case. Use its current access controls and the approved workflow for any necessary disclosure. Reviewers close based on the evidence and clarification available at closure. Corrections to closed assessments, external publication and data sharing require separately approved procedures.
- Define retention by record type and the event that starts each period. Assign who authorises deletion or holds and who verifies it. Specify what happens to audit entries, backups and copies already downloaded. Route individual requests to the named data protection lead. Never use a demo reset as a live retention procedure.
- Rehearse the approved restore process in isolation with fictional accounts, audit and files. Reapply the current retention schedule and approved individual deletion decisions to restored data before restoring access. Record proof without copying private data into the runbook.
- Suspend admission or expansion if TLS trust fails, private evidence becomes accessible beyond its assigned scope, a shared-device session exposes a previous case, confirmation or retry creates duplicates, reconciliation drifts, or a required accessibility path fails. For an active exposure or integrity incident, the authorised deployment owner uses the verified intake pause or isolation procedure and notifies the duty coordinator and data protection lead. Keep access to already received cases only where the incident lead confirms it is safe. Verify the affected condition and recovery before reopening, then document the approval and field communication.
- To pause new reports, set `OBSERVATION_INTAKE_ENABLED=false` in the approved deployment configuration and roll all API instances to the new setting. Verify that a new submission shows the pause, a confirmed report is still visible and a same-key retry can recover its receipt. This switch controls new reports. If an incident requires restricting reads or stopping access to already received cases, use the approved isolation procedure. Reopen intake by setting the flag to `true` and rolling the API after the release lead records approval.

## Physical field acceptance

Use a separate fictional fixture for each rehearsal. Record the candidate revision, hostname, Android model and OS, browser and TalkBack versions, network, viewport, text setting and anonymised participant code. Use at least one budget Android device on the intended or representative weak network. Use a second phone on the shared network to detect problems specific to shared connectivity. Ask five consented participants across the three roles to complete the tasks. Include an assistive-technology session.

| Scenario | Required evidence |
| --- | --- |
| Observer submission and clarification | Complete at 320 and 360 CSS pixels and 200% text. Verify labels, timezone, inline errors, focus recovery, report receipt, independent upload status and clarification while operating the phone. |
| Field interruption | Interrupt before commit, then simulate a separate lost acknowledgement after commit and retry in the same form. Confirm one report and the same reference. Fail an oversized or unsupported photo independently and retry valid bytes with one attachment. |
| Administrator routing and counts | Assign and reassign on the phone, check evidence denial, and apply WAT filters. Reconcile report and closed outcome counts independently on the same range. |
| Reviewer case and closure | Find assigned cases, inspect evidence, request clarification and close with a rationale and the frozen snapshot. Test the former reviewer with an already open case and direct file URL. Complete the journey with triage stopped. |
| Keyboard and TalkBack | Complete all three journeys by keyboard in a supported environment and use TalkBack on the physical Android device. Record focus order, announcements of errors and save/attachment status, control labels, zoom/reflow and any obscured actions. |
| Shared device and escalation | Sign out, use Back and try a protected direct URL. Verify access after a controlled expiry test. Rehearse support handoff and operator pause on the isolated environment. |

Record completion, help requested, mistaken submission or decision, and elapsed recovery time. Fix and repeat any blocked critical action, mistaken case decision, privacy failure or unrecoverable interruption before admitting field users. A desktop emulator run is evidence for its tested viewport and inputs. Physical network recovery, assistive technology and observed participant completion need their own results.

See [release acceptance](../RELEASE.md) for repository checks and fictional fixture instructions.
