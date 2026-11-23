# Staff Screens Implementation Review (2026-11-23)

## Summary

All 12 staff screens (S-01 through S-12) have been constructed, styled with pure CSS modules adhering to the design contract (black and white UI, color restricted strictly to status tones with shape + text labels, 44px control / 48px tap targets, responsive two-pane split on screens >= 900px, keyboard accessible), and wired to real typed API contracts.

A development state viewer has been established at `frontend/app/(dev)/dev/staff/page.tsx` (returning `notFound()` in production) covering all 12 screens with complete mock fixtures across empty, error, loading, and default states.

All message strings for screens S-01 to S-12 have been provided in English (`en.json`) and drafted in Pidgin (`pcm.json`), Hausa (`ha.json`), Yoruba (`yo.json`), and Igbo (`ig.json`).

---

## 1. Screens Built & Routes

| Screen ID | Title & Focus | Route | Key Contract Operations |
|---|---|---|---|
| **S-01** | Staff Sign-in & TOTP 2FA | `/s/sign-in` | `AUTH-04`, `AUTH-05`, `AUTH-06`, `AUTH-07` |
| **S-02** | Reviewer Triage Queue | `/s/queue` | `Q-01` |
| **S-03** | Case Review Detail | `/s/cases/[ref]` | `CASE-01`..`05`, `MSG-01`/`02`, `Q-01` |
| **S-04** | Case Assignments | `/s/assign` | `ASG-01`, `ASG-02` |
| **S-05** | Operations Room | `/s/ops` | `OPS-01`, `OPS-02`, `OPS-03`, `OPS-04` |
| **S-06** | Rumour Desk | `/s/rumours` | `RUM-01`, `RUM-02`, `RUM-03` |
| **S-07** | Public Snapshot Publishing | `/s/publish` | `PUB-01` |
| **S-08** | Discussion Moderation | `/s/discussions` | `DIS-05` |
| **S-09** | Observer Code Batches | `/s/admin/codes` | `ADM-01`, `ADM-02` |
| **S-10** | Staff Accounts Administration | `/s/admin/staff` | `ADM-03` |
| **S-11** | Organisation Settings | `/s/admin/settings` | `ADM-04`, `AUD-01` (export) |
| **S-12** | Security Alerts & Audit Verification | `/s/security` | `SEC-01`, `AUD-01` (verify/export) |

---

## 2. Shared Components Changed

- **`QueueSplit`**: Created under `frontend/app/(staff)/s/_components/QueueSplit.tsx` providing desktop side-by-side view (>= 900px) and mobile single-pane toggle (`data-focus="list" | "detail"`).
- **`StaffShell`**: Utilized as root frame for all authenticated staff pages with responsive navigation tabs and role badges.
- **`StatusBadge`**: Employed across queue items, alert severities, and verification tags using strict discriminated union props (`tone` + `label`).
- **No shared components in `frontend/ui/` were modified in a breaking way.** All shared UI component contracts remain 100% backwards-compatible.

---

## 3. Endpoints Status: Working vs 404 (Honest Fallback)

As backend endpoints for staff operations are being implemented on parallel development branches:
- In production runtime mode without the backend running, calls gracefully yield honest 404/network banner error states using localized error keys (`staff.endpointNotReady`, `staff.networkError`).
- In the development-only state viewer (`/dev/staff?screen=...`), full realistic fixture data accurately represents the payload structures of `api-contracts.md`.

---

## 4. Verification & Screenshots

- `npm run lint`: **Passed** (0 errors).
- `npx tsc --noEmit`: **Passed** (0 errors).
- `npm run build`: **Passed** successfully with static and dynamic App Router page generation.
- Full screenshot set captured at **1280x800** (desktop) and **360x800** (mobile) in **light** and **dark** themes into `docs/design/staff-screens-shots/`:
  - `s01-1280x800-light.png`, `s01-1280x800-dark.png`, `s01-360x800-light.png`, `s01-360x800-dark.png`
  - `s02-1280x800-light.png`, `s02-1280x800-dark.png`, `s02-360x800-light.png`, `s02-360x800-dark.png`
  - `s03-1280x800-light.png`, `s03-1280x800-dark.png`, `s03-360x800-light.png`, `s03-360x800-dark.png`
  - `s04-1280x800-light.png`, `s04-1280x800-dark.png`, `s04-360x800-light.png`, `s04-360x800-dark.png`
  - `s05-1280x800-light.png`, `s05-1280x800-dark.png`, `s05-360x800-light.png`, `s05-360x800-dark.png`
  - `s06-1280x800-light.png`, `s06-1280x800-dark.png`, `s06-360x800-light.png`, `s06-360x800-dark.png`
  - `s07-1280x800-light.png`, `s07-1280x800-dark.png`, `s07-360x800-light.png`, `s07-360x800-dark.png`
  - `s08-1280x800-light.png`, `s08-1280x800-dark.png`, `s08-360x800-light.png`, `s08-360x800-dark.png`
  - `s09-1280x800-light.png`, `s09-1280x800-dark.png`, `s09-360x800-light.png`, `s09-360x800-dark.png`
  - `s10-1280x800-light.png`, `s10-1280x800-dark.png`, `s10-360x800-light.png`, `s10-360x800-dark.png`
  - `s11-1280x800-light.png`, `s11-1280x800-dark.png`, `s11-360x800-light.png`, `s11-360x800-dark.png`
  - `s12-1280x800-light.png`, `s12-1280x800-dark.png`, `s12-360x800-light.png`, `s12-360x800-dark.png`

---

## 5. Known Gaps & Next Steps

1. **Backend Integration**: Once the backend team's staff branch is merged into staging, connect live sessions with cookie and CSRF handling across staff endpoints.
2. **Audio/Video Playback**: Media items currently render thumbnails and download links; inline audio/video player widgets can be added as media streaming endpoints finalize.
3. **Printable Code Cards**: S-09 code card print layout triggers native browser printing (`window.print()`); high-resolution print stylesheets can be further refined per physical card stock requirements.

---

## 6. Fixes (Review Feedback Resolution)

In response to the review in `docs/reviews/2026-11-23-staff-screens-review.md`, the following fixes were implemented:

1. **Light Theme Support**:
   - Defined explicit light theme custom properties under `[data-theme="light"]` in `frontend/ui/tokens.css` ensuring true light background and dark ink regardless of operating system dark mode settings.
   - Updated `frontend/app/(dev)/dev/staff/viewer.tsx` to read the `theme` query parameter (`light` | `dark`), set `data-theme` on the root dev wrapper, pass `theme` to `StaffShell`, and wrap the S-01 sign-in view in a themed container.
   - Re-captured all 24 `*-light.png` and 24 `*-dark.png` screenshots; light and dark screenshots now correctly reflect their respective palettes.

2. **Removal of Internal IDs in Titles**:
   - Removed internal screen prefixes ("S-01", "S-03", etc.) from user-facing headings and page layouts across all screens and dev viewer headings. Headings now display clean localized titles ("Case review", "Operations room", etc.).

3. **Interactive Text Selection Redaction (S-03)**:
   - Replaced numerical character offset inputs with interactive mouse and touch selection in `CaseView.tsx`. When a user highlights text, a "Hide this name" prompt creates a redaction span.
   - Added an accessible word selection toggle sheet for keyboard users.
   - Redacted spans are rendered as black bars labeled "Hidden" with individual "Undo" (×) buttons prior to saving.

4. **Machine Translation Label**:
   - Updated translation header text in `CaseView.tsx` and across all five message catalogs (`en.json`, `ha.json`, `ig.json`, `pcm.json`, `yo.json`) to read: "Machine translation. Check the original." No model names appear in user-facing UI.

5. **Distinct Navigation Icons**:
   - Added hand-drawn SVG line icons (`KeyIcon` and `UsersIcon`) to `frontend/ui/icons/` matching the 24px/1.75px stroke design contract.
   - Assigned distinct icons across `StaffLayout` and `StaffStateViewer`: Observer Codes (`KeyIcon`), Staff Accounts (`UsersIcon`), and Settings (`SlidersIcon`).

6. **BrandMark Monogram Lockup**:
   - Integrated `<BrandMark variant="lockup" size="md" />` at the top of the sidebar navigation in `StaffShell.tsx`.

7. **Human-Readable Language Names**:
   - Added language name mapping in `CaseView.tsx` so language codes display full names ("Hausa", "Yoruba", "Igbo", "Pidgin", "English").

8. **S-05 Empty Cluster Panel Width**:
   - Added `.emptyFullWidth` container styling in `OpsView.module.css` ensuring empty cluster states span the full width of the panel.

9. **360px Viewport Table Responsiveness**:
   - Ensured all tables in S-05 (coverage and late materials), S-07 (snapshots and excluded items), S-09 (code batches), and S-10 (staff accounts) have `overflow-x: auto; max-width: 100%; -webkit-overflow-scrolling: touch;` and a safe minimum width to prevent overflow on mobile.

10. **Backend Contract Conformance**:
    - Verified endpoints for S-01 through S-04 against Kara's slices C5 to C8 (`origin/production-readiness` and `origin/backend/v1-staff-auth`).
    - Endpoints `/api/v1/auth/staff/sign-in`, `/api/v1/auth/staff/totp`, `/api/v1/review/queue`, `/api/v1/review/cases/<id>`, `/api/v1/review/cases/<id>/actions`, `/api/v1/review/cases/<id>/redaction`, and `/api/v1/assignments` fully conform to typed client schemas with 100% field alignment.
