# Review: staff screens S-01 to S-12 (design/staff-screens)

**Reviewer:** product and design lead · **Date:** 23 Nov 2026 · **Verdict:** good base, changes required before merge.

Lint, typecheck and build pass, 14 clean commits, all 12 screens and the dev state viewer exist. The findings below come from the screenshots in `docs/design/staff-screens-shots/` and the code.

## Blocking

1. **Light theme does not apply.** Every `*-light.png` screenshot renders dark. Staff screens must follow the device setting by default with a manual toggle (design contract §4.2: `data-theme="system"` / `"light"` / `"dark"`), and light must be the true light palette. Fix the theme wiring in the staff layout or `StaffShell`, re-take the screenshots and check both themes.
2. **Internal IDs shown to users.** Page titles read "S-03 Case Review", "S-05 Operations Room" and so on. Use plain titles from the message files ("Case", "Operations room", ...). IDs belong only in code and the dev viewer.
3. **Redaction by character offsets is unusable.** S-03 asks for "Start offset / End offset". Replace with: the reviewer selects text in the original description and presses "Hide this name"; the selection becomes a redaction range sent to CASE-05; redacted spans show as a black bar with "Hidden" and can be undone before saving. Keyboard alternative: a "Hide text" sheet listing words to choose.
4. **Machine translation label.** Show "Machine translation. Check the original." (contract §5.2). Never show model names such as "NLLB-200".

## Non-blocking (do in the same pass)

5. Distinct icons for Codes, Staff and Settings (currently the same slider icon). Use or add line icons in `frontend/ui/icons/` in the house style.
6. Put the ElectraGuard monogram lockup (`frontend/ui/BrandMark`, `variant="lockup"`) at the top of the sidebar instead of plain text.
7. Language code "ha" should read as the language name ("Hausa").
8. S-05: empty cluster panel leaves a half-width empty box; let the empty state span the panel.
9. Check every screen at 360 px: tables must scroll inside their container or collapse to stacked rows, never overflow the page.
10. Backend note: citizen reports, the reviewer queue, case actions, assignment, the operations overview and staff sign-in with 2FA are implemented by Kara's slices C5 to C8 (`production-readiness` and `backend/v1-staff-auth`). Point S-01 to S-04 at those endpoints and confirm the field names match; report any mismatch rather than changing the backend.

Re-take all screenshots after the fixes and add a short "Fixes" section to `docs/reviews/2026-11-23-staff-screens.md`.
