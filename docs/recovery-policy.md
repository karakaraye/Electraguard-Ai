# ElectraGuard recovery policy proposal

The deployment owner operates this policy. The data owner and the product/design supervisor review its treatment of private reports, evidence, case history, accounts and audit data. The release approver records the active recovery targets and the result of the first representative drill before enabling real intake.

| Item | Proposed starting point | Evidence needed for use |
| --- | --- | --- |
| Recovery point | At most four hours of data loss during active intake. Take an encrypted checkpoint before a production migration. | Compare backup completion timestamps against the proposed four-hour window under representative load. Escalate a missed checkpoint during active intake. |
| Recovery time | Four hours to restore and verify critical case and evidence access from the point recovery is declared. | Measure from declaration through restore, session revocation, integrity and permission checks, and operator approval. Revise the target against field needs. |
| Keys and storage | Encrypt to an approved recipient key. Give the backup job the public key and keep recovery credentials with authorised recovery operators. Store an independently recoverable copy outside the application host. | Verify the recipient fingerprint out of band, test retrieval and decryption by a recovery operator, and record responsibility for key rotation. |
| Expiry and restricted data | Apply the approved retention schedule to backup copies and recovery scratch data. Document any applicable hold and record who can authorise restoration. | The data owner approves retention, deletion handling and any necessary restore-time suppression before intake. |

## Recovery decision

The incident lead records the incident time, candidate recovery point, expected loss and approval to interrupt intake. Pause new reports and isolate the previous deployment when confidentiality or integrity is in doubt. If the database is healthy and the prior application images support its schema, rehearse an image rollback with intake paused.

For database recovery, restore into isolation and run [restore acceptance](restore-verification.md). Before routing traffic, invalidate restored sessions and verify that previous cookies fail. Check inactive accounts, former assignee access, evidence hashes, closure snapshots, report totals and fresh sign-in with authorised accounts. Review any changes between the recovery point and the incident before approving a traffic switch. Keep intake paused until the release approver accepts the evidence.

Record aggregate results and timings. Report whether the proposed recovery point and time were met, what needs correction, and when the next drill is due. Keep evidence, credentials, session cookies and observer details out of the drill notes.
