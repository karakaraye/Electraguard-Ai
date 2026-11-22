# Agent updates

The one place where everyone working on ElectraGuard (people and agents) records what changed, what is being worked on, and what the others must know. **Read the latest entries before you start work. Add an entry when you finish a slice, change a plan, or need something from someone.** Newest entries go at the top.

The full plan is in [hackathon-plan.md](hackathon-plan.md).

## Current state (keep this box up to date)

| Item | State |
|---|---|
| Company / team name | **Cairn Assure** |
| Plan | `docs/hackathon-plan.md` version 2, approved direction: full working system, nothing skipped |
| Phase | **Design phase: front end first.** Claude is designing every screen with its API contract on branch `design/frontend`, in a separate worktree, so it does not touch files Codex is editing. |
| Observer sign-in | Observer code + PIN (decided). No email for observers. |
| Hosting | Azure, **waiting** for the hackathon Slack and the login details. Build and test on Docker until then. |
| Fork of the official repo | **Waiting** for Kara (section 1.2 of the plan) |
| Languages | English, Naijá, Hausa, Yorùbá, Igbo. Claude drafts, the owner approves. |

## Who supervises

**Claude supervises all agents** (owner's decision, 22 Nov): product, design, planning, review and coordination, for this repo and every agent working in it, including Kara's agents and Codex. Disagreements or blockers come here as an entry addressed to Claude.

## Rules for every agent

0. **Commit and push everything to `github.com/karakaraye/Electraguard-Ai`.** Nothing stays only on one machine. Work on a named branch, push after every verified slice, and note the branch in the ownership table. Before starting, `git fetch` and read the latest version of this file on `origin/design/frontend` (the coordination branch until it is merged).
1. Read this file and the plan before starting. Do not resume from memory.
2. Claim your files in the ownership table below before editing. Never edit files someone else has claimed.
3. Each slice lands complete: screen + API + tests + all five language strings. No half-wired screens, no fake data in the app.
4. Commit only your own paths with explicit pathspecs. Never `git add -A`.
5. After each slice, add an entry below: what changed, how it was verified, what is next, and what you need.

## Ownership

| Area | Owner | Branch / location | Files |
|---|---|---|---|
| Front-end design system, screens, API contracts | Claude | `design/frontend` | `frontend/app/(observer)/…`, `frontend/app/(staff)/…`, `frontend/app/(public)/…`, `frontend/ui/…`, `frontend/messages/…`, `docs/design/…` |
| Existing observer edits in progress | Codex | `work` (this worktree, uncommitted) | `frontend/app/workspace/observer/…`, `frontend/app/styles.css`, `scripts/verify-core.cjs` |
| Backend, migrations, tests, deployment | Codex | `work` | `backend/…`, `deploy/…`, `.github/…` |

## Updates

### 22 Nov 2026 · Claude · design phase started

- **Decided by the owner:** the name is Cairn Assure; observer codes instead of email; Azure waits for the Slack; the front end is designed first and the logic follows, with front end and back end designed together.
- **For Codex: please stop work on the current observer screens** (`frontend/app/workspace/observer/…`). They are being replaced by a new design built from scratch. Keep your uncommitted edits on a side branch (for example `git switch -c park/observer-edits` and commit there) so nothing is lost. Do not merge them into `work`.
- **For Codex, meanwhile (backend only, no UI):**
  1. Freeze deployment, recovery and rollback work. It is done enough.
  2. Prepare `LICENSE` (MIT) and the official starter data in `data/` once the fork is done.
  3. Read section 10 of the plan (data model). Do not start migrations until the API contracts in `docs/design/api-contracts.md` are published. They come with the screens, so the two match.
- **Next from Claude:** the design contract (`docs/design/design-contract.md`), the mark, then the observer screens with their API contracts, then reviewer, coordinator and public screens.
