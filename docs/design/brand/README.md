# ElectraGuard AI: product mark

**Status:** three directions for decision · 22 Nov 2026 · Cairn Assure
Comparison board: [board.html](board.html) (rendered: [board.png](board.png)).

The mark follows the design contract ([../design-contract.md](../design-contract.md)): black and white only, and it must read on a cheap Android phone in sunlight. Every direction is plain geometry (nothing traced) in pure black `#000` and pure white `#fff`.

## Decision for the owner: brand architecture §5.1

`company/brand/ARCHITECTURE.md` §5.1 says every product has its own drawing and must not reuse or rearrange the Cairn stones. The company symbol is already three stacked stones.

- **Direction A (Cairn)** breaks that rule on purpose. It is a deliberate sibling of the Cairn Assure company mark and can only be used if the owner waives §5.1 for ElectraGuard.
- **Directions B (Monogram) and C (Tally)** are separate drawings that respect §5.1.

**Recommendation:** keep §5.1 and choose **B, Monogram**. Choose A only if the owner deliberately wants ElectraGuard to look like part of the Cairn family, and records the waiver in ARCHITECTURE.md.

Not applied here: §5.1 also asks every product mark to carry one silver element. The ElectraGuard design contract is strictly black and white, so these marks have none. If the owner wants the shared silver finish, it would go on one part of the chosen mark (for B, the G's spur) in marketing use only, never inside the product.

## What was ruled out, and why

The following were all excluded:

- ballot boxes, ticks in rounded squares and shields
- flags, flag colours and party-like symbols (brooms, umbrellas, rising suns)
- eyes, sparkles, brains and circuits
- anything that looks like the INEC seal or a coat of arms

Earlier drafts were dropped for these reasons:

- **An "E" in a disc:** too close to a well-known appliance brand whose name also starts with "Electr-".
- **A receipt slip ("Stub"):** read as a phone or kiosk at small sizes.
- **Hollow, half-filled and filled circles ("Trail"):** clashed with the product's status shapes (contract §4.2) and read as a loading indicator.

## The three directions

### A. Cairn: a sibling of the company mark (needs a §5.1 waiver)
Three resting stones, flat underneath and domed on top, each slightly off-centre, with the top stone tilted 6°. A cairn is the marker walkers build so the next person can trust the path.
- Strengths: calm, sides with no one, and solid at every size.
- Cost: it reuses the company's stone idea. That is exactly what §5.1 forbids, and it makes ElectraGuard look like a variant of the Cairn logo. That is not a benefit unless the owner wants it.

### B. Monogram: E and G as one letterform (recommended if §5.1 stands)
Three arms of an E on a curved spine. The bottom arm turns up on the right into the spur of a G.
- Strengths: it belongs to the name, so there is no picture to misread. It is one solid outline that stays a block at 16 px, and it is distinct from the stones, the status shapes and any party or government emblem.
- Watch-out: like any letter mark, it needs the wordmark next to it at first so people learn it.

### C. Tally: four strokes and one across
The gate tally people use to count by hand. It says "observed and counted" without needing any reading.
- Strengths: instantly understood, and neutral.
- Weaknesses: at 16 px the cross stroke and its gaps leave a busy cluster of short bars, so it is the weakest of the three as a favicon. Counting marks also sit close to "results", which a reporting tool should not overclaim.

## Wordmark

"ElectraGuard" is set in Noto Sans SemiBold (600), shaped with the font's own kerning and tracked at -1.2 %. "AI" is set in Noto Sans Regular (400) at the same size, after a 0.30 em gap. The weight change makes it quieter and still works in one colour. Noto Sans is licensed under the SIL Open Font License and is the product's UI face. The lockups contain the letters as outlines, so they need no installed font.

## Files (each direction folder: `cairn/`, `monogram/`, `tally/`)

| File | Use |
|---|---|
| `mark.svg` / `mark-white.svg` | Symbol alone, drawn on a 48-unit grid. Black, or white for dark surfaces (transparent background). |
| `favicon.svg` / `favicon-white.svg` | A separate drawing on a true 16 px grid: every vertex is a whole pixel, with square corners or 45° chamfers. Use it at 16 px. |
| `lockup-horizontal.svg` / `-white` | Symbol plus wordmark. App bar, site header, documents. |
| `lockup-stacked.svg` / `-white` | Symbol (1.1×) above the wordmark (0.8× the horizontal size). Splash screens, posters, square spaces. |
| `app-icon-maskable.svg` | 512 × 512 Android icon: black full bleed, white symbol. Export 192 and 512 PNGs for the web app manifest (`"purpose": "maskable"`). |

**Art sizes in the maskable icon.** The artwork's longer side is 52 % of the canvas for Cairn, 50 % for Monogram and 52 % for Tally. Monogram is limited by the safe circle. Every point of every outline, curves included, sits inside a centred circle 66 % of the canvas wide. Cairn is bottom-heavy, so it is raised 2 % of the canvas for optical centring.

**Colour.** The logo is deliberately pure `#000` / `#fff`. UI ink in the product is `#0B0B0C` (contract §4.2). Do not "correct" either one to match the other.

**ViewBoxes are tight.** Lockup and mark files have no padding baked in, so apply the clear-space rule below wherever they are placed.

**Rebuilding.** `generate.py` rebuilds every SVG from the geometry, with all transforms baked into the path data (no `transform` attributes, no zero-length segments). None of the shapes has a hole, so no fill-rule is needed. Setup:

- Python packages: `fonttools` and `uharfbuzz`.
- Font files: `noto-sans-latin-{400,600}-normal.woff` from the npm package `@fontsource/noto-sans`.
- Run: `NOTO_SANS_DIR=<folder with the .woff files> python generate.py docs/design/brand`.

## Clear space

- **Symbol alone:** keep at least **25 % of the symbol's height** clear on every side.
- **Lockups:** keep at least the **wordmark's cap height** (the height of the "E") clear on every side.
- On the 56 px app bar, the bar's 16 px side padding counts as the clear space.

## Minimum sizes

Each minimum keeps the wordmark at 14 px type or larger.

| Asset | Smallest size | Below that |
|---|---|---|
| Symbol (`mark.svg`) | 24 px tall (screen) · 6 mm (print) | Use `favicon.svg` |
| Favicon drawing | 16 px | Not used smaller |
| Horizontal lockup | 22 px tall (screen) · 6 mm (print). Wordmark cap height is 46 % of lockup height, about 14.2 px type at 22 px. | Use the symbol alone |
| Stacked lockup | 56 px tall (screen) · 15 mm (print). Wordmark cap height is 19.3 % of lockup height, about 15.1 px type at 56 px. | Use the horizontal lockup |
| Android icon | 48 dp launcher size, from the 192/512 exports | n/a |

## Rules

- Pure black on white or pure white on black only. Never tint the mark or use the status colours on it.
- Do not redraw, stretch, outline, add shadows or rotate the mark. Cairn's tilted top stone is part of the drawing.
- Do not put the mark on photographs or busy backgrounds. Use a plain panel.
- Use only the supplied lockups, and no other typeface beside the mark.
- Never combine the mark with flags, party colours, the INEC logo or any government emblem.

## Before public use

Run a trademark search on the name "ElectraGuard" and on the chosen symbol: the Nigerian Trademarks Registry (classes 9, 42 and 45) and the WIPO Global Brand Database. Keep this dated board and the source files as a record of when the mark was created.
