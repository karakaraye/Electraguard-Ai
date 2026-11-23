# Agent updates

The one place where everyone working on ElectraGuard (people and agents) records what changed, what is being worked on, and what the others must know. **Read the latest entries before you start work. Add an entry when you finish a slice, change a plan, or need something from someone.** Newest entries go at the top.

The full plan is in [hackathon-plan.md](hackathon-plan.md).

## Current state (keep this box up to date)

| Item | State |
|---|---|
| Company | **Cairn**, co-owned by the owner and Kara. Registration on hold. |
| Product branding | Own mark: **E+G monogram**. Credit line "ElectraGuard AI, by Cairn". Never the Cairn logo. |
| Plan | `docs/hackathon-plan.md` version 2, approved direction: full working system, nothing skipped |
| Phase | **Design phase: front end first.** Claude is designing every screen with its API contract on branch `design/frontend`, in a separate worktree, so it does not touch files Codex is editing. |
| Observer sign-in | Observer code + PIN (decided). No email for observers. |
| Hosting | Azure, **waiting** for the hackathon Slack and the login details. Build and test on Docker until then. |
| Fork of the official repo | **Waiting** for Kara (section 1.2 of the plan) |
| Languages | English, Naijá, Hausa, Yorùbá, Igbo. Claude drafts, the owner approves. |

## Who supervises

**Claude supervises all agents** (owner's decision, 22 Nov): product, design, planning, review and coordination, for this repo and every agent working in it, including Kara's agents and Codex. Disagreements or blockers come here as an entry addressed to Claude.

## Rules for every agent

0. **Commit and push everything to `github.com/karakaraye/Electraguard-Ai`.** Nothing stays only on one machine. Work on a named branch, push after every verified slice, and note the branch in the ownership table. Before starting, `git fetch` and read the latest version of this file on `origin/production-readiness` (the shared branch).
1. Read this file and the plan before starting. Do not resume from memory.
2. Claim your files in the ownership table below before editing. Never edit files someone else has claimed.
3. Each slice lands complete: screen + API + tests + all five language strings. No half-wired screens, no fake data in the app.
4. Commit only your own paths with explicit pathspecs. Never `git add -A`.
5. After each slice, add an entry below: what changed, how it was verified, what is next, and what you need.

## Ownership

| Area | Owner | Branch / location | Files |
|---|---|---|---|
| Coordination log and licence (Slice A) | Codex | `codex/coordination-and-license` | `docs/agent-updates.md`, `docs/hackathon-plan.md`, `LICENSE` |
| C1 observer code and PIN sign-in, organisation scoping | Codex | `codex/observer-sign-in` | `docs/agent-updates.md`, `backend/accounts/`, `backend/config/settings.py`, `backend/config/urls.py`, `backend/reports/` (organisation fields and scoping only) |
| C2 PIN follow-ups and place reference | Codex | `backend/v1-contracts` | `docs/agent-updates.md`, `backend/accounts/`, `backend/reference/`, `backend/config/settings.py`, `backend/config/urls.py`, `data/reference/` |
| C3 observer reports and idempotency | Codex | `backend/v1-reports` | `docs/agent-updates.md`, `backend/reports/`, `backend/reference/models.py`, `backend/accounts/observer_auth.py`, `backend/config/urls.py` |
| C4 private photo uploads and deployment | Codex | `backend/v1-media` | `docs/agent-updates.md`, `backend/reports/`, `backend/config/settings.py`, `deploy/compose.yaml`, `deploy/backend.Dockerfile`, `deploy/backup-encrypted.sh`, `docs/restore-verification.md`, `scripts/extract-recovery-bundle.py`, `scripts/verify-restored-data.py` |
| C5 citizen reports and receipts | Codex | `backend/v1-citizen-reports` | `docs/agent-updates.md`, `backend/reports/`, `backend/accounts/organisations.py`, `backend/config/settings.py`, `scripts/verify-restored-data.py` |
| C6 reviewer queue and case actions | Codex | `backend/v1-review` | `docs/agent-updates.md`, `backend/reports/`, `scripts/verify-restored-data.py` |
| Front-end design system, screens, API contracts | Claude | `design/frontend` | `frontend/app/(observer)/…`, `frontend/app/(staff)/…`, `frontend/app/(public)/…`, `frontend/ui/…`, `frontend/messages/…`, `docs/design/…` |
| Product mark and lockups | Claude (brand agent) | `design/brand` | `docs/design/brand/…` |
| Design tokens, components, icons, i18n library, dev gallery | Claude (UI agent) | `design/ui-foundation` | `frontend/ui/…`, `frontend/lib/i18n/…`, `frontend/public/fonts/…`, `frontend/app/(dev)/…` |
| API contracts and TypeScript API types | Claude (system design agent) | `design/api-contracts` | `docs/design/api-contracts.md`, `frontend/lib/api/…` |
| Observer and citizen screen specs, message files in 5 languages | Claude (UX agent) | `design/observer-screens` | `docs/design/screens/…`, `frontend/messages/…` |
| Existing observer edits in progress | Codex | `work` (this worktree, uncommitted) | `frontend/app/workspace/observer/…`, `frontend/app/styles.css`, `scripts/verify-core.cjs` |
| Backend, migrations, tests, deployment | Codex | `work` | `backend/…`, `deploy/…`, `.github/…` |

## Updates

### 23 Nov 2026 · Codex · Slice C5 citizen reports

- Implemented the backend citizen-report contracts REP-05 through REP-07 and citizen withdrawal under REP-04. Submissions use the configured public intake organisation, versioned place data and CSRF. Receipt secrets are stored as SHA-256 digests. Idempotency is scoped to the secret and organisation.
- Public status returns only the receipt, status, outcome, open-question flag and WAT dates. The receipt secret is required for conversation, replies and withdrawal. Replies reuse the report lock and audit version, store the text separately from the audit event, and appear to the assigned Reviewer as Citizen, not accredited. Withdrawal reuses the report purge and stub replay.
- Verified `manage.py migrate`, `manage.py test accounts reports config --noinput` (75 passed on PostgreSQL 17.12), clean migration and whitespace checks, and restore checker syntax. No frontend paths changed.
- Public throttling and enumeration warnings are process-local. Configure `PUBLIC_INTAKE_ORGANISATION_ID` in the Django environment if public intake should use an organisation other than the initial one. The production intake gate still governs submissions. Browser integration, citizen media and a shared rate limiter and security monitor remain follow-on work.
- Next, review this branch and wire receipt creation, status and proof handling into the citizen screens. Keep receipt secrets out of URLs and logs.

### 22 Nov 2026 · Codex · C4 deployment and recovery follow-up

- Backend and worker share the named `private-media` volume at `/var/lib/electraguard/media`. The image primes that path with UID/GID 10001 and mode 0700. Compose configuration and an isolated two-container named-volume test verified the mapping and write access.
- The operator backup command can encrypt a quiesced PostgreSQL dump and the private media tree as one bundle. The restore runbook covers a safe extractor, checks restored photo byte counts and SHA-256 against `MediaItem`, and describes mounting a separate restored volume. The legacy database-only backup invocation remains available for existing rehearsals.
- Verified a real encrypted round trip between two isolated PostgreSQL 17 databases with a generated photo. Source and restored counts matched. The checker reported a mismatch after deliberate file corruption. The legacy database-only archive still decrypted as a PostgreSQL custom dump.
- Reran `manage.py test accounts reports config --noinput` (70 passed), `makemigrations --check --dry-run`, shell and Python syntax checks, Compose configuration, and `git diff --check`. The full backend image build hit a PyPI proxy certificate error. The volume permission test used an isolated image based on PostgreSQL 17.
- PR #7 is still outside `origin/production-readiness`. Once it lands, merge the shared branch into `backend/v1-media` and verify startup with the packaged app and reference-data folders.

### 22 Nov 2026 · Codex · Slice C4 private photo uploads

- Added observer MED-01 through MED-05 for JPEG/PNG. Uploads advertise 256 KiB chunks, expose saved progress, and check offsets, optional chunk hashes, declared size and the whole-file SHA-256. Replay of an expired upload opens a new session for its original attachment identifier. Video and audio return `not_supported_yet`.
- Completion decodes and re-encodes a fresh JPEG, strips metadata including GPS, and records the original and stored SHA-256. The bounded photo transform runs inline and returns `ready`. The staged original is queued for deletion in the completion transaction, with immediate post-commit cleanup and retry through maintenance.
- Every download checks the observer owner or current Reviewer assignment. Responses are private and no-store, with optional thumbnails and single byte ranges. Staff access is logged. Removing a photo is permitted only before review and audits its hash. Case closure snapshots saved photos and pending upload metadata, and withdrawal removes the photos and staged files.
- Set `PRIVATE_MEDIA_ROOT` to a persistent, private directory outside web roots for deployment. Use `python backend/manage.py prune_private_media` at least every 15 minutes to remove expired bytes and retry queued deletions. The local backend is in place. Azure Blob, the production maintenance schedule, asynchronous processing and unusual-download alerting remain follow-on work.
- The face-blur hook reports `blurred: false` even when requested. Server-side face detection and blur must be implemented and verified before the UI promises it. Legacy evidence endpoints remain available with their existing behaviour.
- Verified `manage.py test accounts reports config --noinput` (70 passed on PostgreSQL 17.12), `makemigrations --check --dry-run`, `migrate --check`, and `git diff --check`. Coverage includes dropped chunks, replay after expiry, size/hash checks, an exact 2 MiB photo with GPS EXIF, permission changes, closure, withdrawal and removal. No frontend paths changed.
- Next, review C4 and wire the observer's photo flow. Verify the private storage mount and cleanup schedule before deployment.

### 22 Nov 2026 · Codex · Slice C3 observer reports

- Added REP-01 through REP-04 under `/api/v1/reports`. Incident submission validates language, category, timestamps, a historical REF-01 place, and optional metadata. Date-only observations use midnight WAT and carry `time_known: false`. Checklist and result-sheet creation return `not_supported_yet`.
- REP-01 and REP-04 store successful answers atomically with the report, scope replay by organisation, actor and operation, and compare canonical JSON digests. A concurrent matching write waits up to five seconds, then gets `request_in_progress` if still blocked. The operator command `prune_report_idempotency` removes records after 30 days and preserves stored withdrawal stubs. Schedule it through the deployment's maintenance mechanism.
- The signed cursor is bound to the actor and filters. Counts cover the observer's full v1 list. Open clarification questions drive `needs_attention` until message storage arrives. Unread messages are zero and `last_message_preview` is null in this slice. Detail includes `reviewer_assigned`.
- Withdrawal locks the report, clears its content and assignment, deletes evidence and triage data, and replaces the create replay with the withdrawn stub. Older legacy reports remain on the legacy API. New reports can be reviewed through the existing workflow, and withdrawn v1 reports are excluded from legacy reads and dashboard totals.
- Verified `manage.py migrate`, `manage.py test accounts reports config --noinput` (61 passed on PostgreSQL 17.12), `makemigrations --check --dry-run`, and `git diff --check`. Tests covered concurrent replay, replay while intake is paused, validation, old reference codes, paging and isolation, and withdrawal. No frontend paths changed.
- Next, review this slice and wire the v1 observer screens. Checklist, result-sheet creation and the new media API remain follow-on work. The receipt includes the contract's media limits for that later API. Legacy attachment limits still govern the existing upload endpoint.

### 22 Nov 2026 · Codex · Slice C2 PIN follow-ups and place reference

- AUTH-03 now returns `pin_same_as_setup` for the setup-PIN prefix. AUTH-08 is `POST /api/v1/auth/observer/pin/change` with `current_pin` and `new_pin`. It uses the existing lockouts and keeps current sessions active. Revocation still ends them.
- REF-01 serves the shared state index and per-state documents with ETags and public revalidation headers. `python backend/manage.py load_reference_areas` loads the two-state, 16-unit synthetic release. `--file` accepts later releases, and older unit codes remain valid.
- REF-02 is `GET /api/v1/reference/settings`. It returns the signed-in observer's `coverage_area` (`state_codes`, `lga_codes`) and `party_labels` with private cache controls. This uses the field names in ADM-04 because the design records the gap decision without a finalized REF-02 response example.
- Verified `manage.py test accounts reports config --noinput` (55 passed on PostgreSQL 17.12), `makemigrations --check --dry-run` and `git diff --check`. No frontend files changed.
- Previously activated codes have no stored setup-prefix hash to compare against. Newly activated codes retain the prefix hash for PIN changes. The full setup PIN hash is erased after activation.
- Next after review is C3, REP-01 through REP-04. C3 has not started.

### 22 Nov 2026 · Claude · design foundation merged into production-readiness

- Merged `design/frontend` into `production-readiness` on `integrate/design-foundation`: UI foundation, API contracts and types, screen specs, message files in five languages, brand mark and icons. The coordination log keeps `production-readiness` as the shared branch and keeps the Codex claims and entries from PRs #2 and #3.
- C1 (PR #3) already implements AUTH-01/02/03/06/07. Still to apply from the gap decisions: G2 (`pin_same_as_setup`; C1 currently returns `pin_reused`) and G12 (AUTH-08 change PIN).

### 22 Nov 2026 · Codex · Slice C1 observer code and PIN sign-in

- Added organisation fields and backfilled the existing application records to the initial organisation. Report, evidence, reviewer, triage and dashboard access now starts with the actor's organisation.
- Added AUTH-01/02/03/06/07 under `/api/v1/auth/`, checked Crockford observer codes, hashed setup and personal PINs, one-use ten-minute setup tokens, rolling lockouts, per-IP limits and security alert records. Observer sessions persist with a 24-hour idle limit and seven-day absolute limit. Legacy email sign-in and browser-session behaviour remain available.
- Local operator commands are `issue_observer_codes --count N --label "…"`, `revoke_observer_code OBS-XXXXXX` and `reset_observer_pin OBS-XXXXXX`. Issuing and resetting print the setup PIN once. Use an authorised shell and hand the PIN over privately. The setup PIN expires in 14 days. Revocation ends all sessions and preserves the original account and reports.
- Verified with `backend/.venv/bin/python backend/manage.py test accounts reports config --noinput` (50 passed, PostgreSQL 17.12), `makemigrations --check --dry-run` (clean), and `git diff --check` (clean). Frontend `npm run lint`, `npm run typecheck` and `npm run build` passed with no frontend diffs.
- Next, reviewer checks the backend slice and wires O-03 in the separate frontend slice. PR #2 was not on the shared branch when C1 started; its coordination log was merged into this branch and the C1 claim and entry were added to it.

#### Questions

- The contract names the cookie `eg_session`. C1 keeps the shared Django cookie name so existing staff sessions, legacy clients and ingress checks remain compatible. Confirm the cookie rename with the coordinated frontend and deployment cutover.
- AUTH-03 and O-03 differ on the setup-PIN prefix error. C1 uses O-03's specific `pin_reused` field code. The current application roles remain as issued, pending a mapping for coordinator and organisation-admin permissions.
- C1 uses the immediate peer address unless the operator explicitly sets `DJANGO_AUTH_TRUSTED_PROXY_IPS` to trusted immediate peer IPs. Confirm the production ingress overwrites `X-Forwarded-For` with a single client IP before enabling that setting. Admin HTTP issuance and organisation-wide daily limits belong to the follow-on ADM slice.
- Failed credentials take the same PBKDF2 work and share the invalid-credentials response. A deployed timing measurement and high-volume retention policy for throttle records remain open.

### 22 Nov 2026 · Codex · Slice A coordination log and licence

- Brought the coordination log and hackathon plan over from `design/frontend`, updated rule 0 to identify `production-readiness` as the shared branch, and added an MIT licence for the Cairn team (name confirmed by the owner).
- Verified that the hackathon plan matches its source, Git's whitespace checks pass, and the slice contains only the three claimed paths.
- Next, the reviewer checks the draft PR and its CI results before integrating the slice.

### 22 Nov 2026 · Claude · foundation merged; observer screens being built; backend may start

- Merged `design/ui-foundation`: tokens, 24 components, icons and pictograms, i18n library, dev gallery at `/dev/ui`. Lint, typecheck and build pass; axe clean.
- Now building: observer flow O-01 to O-12 with the offline outbox (`design/observer-flow`), and the brand integration (monogram icons, manifest, "by Cairn" credit, root layout) on `design/brand-integration`.
- **For Codex / Kara's agents: the backend can start now.** Implement `docs/design/api-contracts.md` under `/api/v1/` with the amendments listed below (G1–G15), on a branch named `backend/v1-contracts`, committing and pushing each slice with tests. Start with AUTH-01..08, REF-01..02, REP-01..05, MED-01..05 (the observer path). Do not change anything under `frontend/`.

### 22 Nov 2026 · Claude · screen specs reconciled with the contracts; gap decisions

- Merged `design/reconcile`: the screen specs now use the contract ids, paths, fields and error codes.
- **Contract amendments to apply when the backend is built (decided):**
  - G1: no "tries left" count. G2: AUTH-03 returns field error `pin_same_as_setup`.
  - G3: REP-02 returns `counts` (total, needs_attention). G14: REP-02 filter `needs_attention` = open question or unread message.
  - G4/G5: new **REF-02** organisation public settings for signed-in observers (coverage states, party labels A–E).
  - G6: result-sheet fields may be `null` with `unreadable: true`. G7: REP-01 accepts `time_known: false` for date-only.
  - G8: REP-02 carries `last_message_preview` on the observer's own reports.
  - G9: keep the minimal on-phone index (reference, code, category, ward, status, time); amend contract §1.8 to allow it.
  - G10: REP-03 adds `reviewer_assigned`; observers can message any time, delivered when a reviewer is assigned.
  - G11: follow the contract (citizen needs the secret). G12: new **AUTH-08** change PIN. G13: reading DIS-02 marks posts read.
  - G15: MED-01 replay after an expired session starts a new upload session for the same `client_attachment_id`.

### 22 Nov 2026 · Claude · ownership, branding, API contracts merged

- Kara and the owner co-own Cairn; ElectraGuard is a Cairn product. Registration is on hold.
- Mark: **E+G monogram** (direction B on `design/brand`). Cairn stones and tally are rejected. Credit line everywhere: "ElectraGuard AI, by Cairn".
- Merged `design/api-contracts`: `docs/design/api-contracts.md` (55 contracts) and `frontend/lib/api/`. It is the source of truth; `design/reconcile` is aligning the screen specs to it.
- **Decisions on the API open questions:** citizen/SMS/USSD reports go to one configured organisation (`PUBLIC_INTAKE_ORGANISATION_ID`); observer sessions 24 h idle / 7 days max; reviewers see blurred media, the original is kept and viewable only by the assigned reviewer with a recorded reason; duplicates assigned to others show metadata only; approved rumour responses appear on the public page; citizen replies are text only; staff invites are a one-time link shown to the admin; SMS keywords accepted in all five languages; existing administrator accounts become coordinators unless the admin changes them.

### 22 Nov 2026 · Claude · observer screen specs merged; decisions on open questions

- Merged `design/observer-screens` into `design/frontend`: 22 screen specs (`docs/design/screens/`), glossary, and 544 strings in each of en, pcm, ha, yo, ig (`frontend/messages/`). Non-English files are drafts for the owner's review.
- **Decisions on the specs' open questions (binding for the build):**
  - Q1 Keep a small index of received reports on the phone (reference, code, category, ward, status, time): **yes**.
  - Q2 Citizens' "keep this receipt code on this phone": **on by default**.
  - Q3 Reports queued under a revoked code: **may be sent by the next code of the same organisation on that phone**; the report keeps the original author code and records who sent it.
  - Q4 Blur faces: the phone preview blurs faces it can detect; the server always runs blur as well. The promise shown is "Faces we can detect are blurred. Check before sending."
  - Q5 Video over 60 s: recording stops at 60 s; a chosen file over 60 s is refused with "Choose a clip of 60 seconds or less" (no in-browser trimming).
  - Q6 Dictation: keep the speech button, show a one-time note that the phone's speech service may process the audio, and name keyboard voice typing as the alternative; state this in the privacy notice.
  - Q7 One open incident draft per observer code: **yes**.
  - Q8 Show the SMS sandbox number labelled "test number" until a real short code exists.
  - Q9 Changing a PIN does not end that code's other sessions; revoking a code does.
  - Q10 Citizens may answer a reviewer's question with the receipt code alone, rate limited.
  - Q11 Hausa form of address: **owner decides** while reviewing the Hausa text.
- **Note for the API agent and Codex:** the specs assume meanings for each API id (table in `docs/design/screens/README.md`). `docs/design/api-contracts.md` is the source of truth; where they differ, Claude reconciles both before any backend work starts. RS-01 must work before the report exists (reading a sheet photo during the draft).

### 22 Nov 2026 · Claude · four design workstreams running in parallel

- Started four parallel design workstreams, each on its own branch (see the ownership table): the mark, the UI foundation, the API contracts, and the observer screen specs with copy in five languages.
- Claude reviews each branch and merges it into `design/frontend`. Nobody merges their own branch.
- **For Kara's agents and Codex:** do not edit the paths in those four rows. Backend work that implements the API waits for `docs/design/api-contracts.md` on `design/frontend`.

### 22 Nov 2026 · Claude · design phase started

- **Decided by the owner:** the name is Cairn Assure; observer codes instead of email; Azure waits for the Slack; the front end is designed first and the logic follows, with front end and back end designed together.
- **For Codex: please stop work on the current observer screens** (`frontend/app/workspace/observer/…`). They are being replaced by a new design built from scratch. Keep your uncommitted edits on a side branch (for example `git switch -c park/observer-edits` and commit there) so nothing is lost. Do not merge them into `work`.
- **For Codex, meanwhile (backend only, no UI):**
  1. Freeze deployment, recovery and rollback work. It is done enough.
  2. Prepare `LICENSE` (MIT) and the official starter data in `data/` once the fork is done.
  3. Read section 10 of the plan (data model). Do not start migrations until the API contracts in `docs/design/api-contracts.md` are published. They come with the screens, so the two match.
- **Next from Claude:** the design contract (`docs/design/design-contract.md`), the mark, then the observer screens with their API contracts, then reviewer, coordinator and public screens.
