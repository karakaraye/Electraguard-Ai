# ElectraGuard AI: product mark

**Status:** decided by the owner, 22 Nov 2026 · the mark is the **E+G monogram** · Cairn Assure
Board: [board.html](board.html) (rendered: [board.png](board.png)).

The mark follows the design contract ([../design-contract.md](../design-contract.md)): black and white only, and it must read on a cheap Android phone in sunlight. It is plain geometry (nothing traced) in pure black `#000` and pure white `#fff`.

## Decision

- **Chosen mark: the monogram.** Three arms of an E on a curved spine. The bottom arm turns up on the right into the spur of a G. It belongs to the name, so there is no picture to misread. It is one solid outline that stays a block at 16 px, and it is distinct from the status shapes and from any party or government emblem. Like any letter mark, it needs the wordmark next to it at first so people learn it.
- **Rejected:** the Cairn stones direction and the tally direction. Their files were removed from this folder (they remain in git history).
- **Brand architecture §5.1** (`company/brand/ARCHITECTURE.md`) is kept: each product has its own drawing and does not reuse the Cairn stones. The monogram is a separate drawing.

### Credit line rule

Cairn products never use the Cairn logo. ElectraGuard AI is credited to its maker with the plain-text line **"ElectraGuard AI, by Cairn"**.

- No Cairn symbol, stones or colour, anywhere in the product.
- In the interface the line is the message key `ui.byCairn` ("by Cairn"), shown under or beside the wordmark. "Cairn" is never translated; only "by" is.
- Where a printed or exported lockup is needed, use `lockup-credit.svg`.
- Where the credit is not shown, the mark and plain lockups stand alone.

Not applied here: §5.1 also asks every product mark to carry one silver element. The ElectraGuard design contract is strictly black and white, so the mark has none. If the owner wants the shared silver finish, it would go on one part of the mark (the G's spur) in marketing use only, never inside the product.

## What was ruled out, and why

The following were all excluded:

- ballot boxes, ticks in rounded squares and shields
- flags, flag colours and party-like symbols (brooms, umbrellas, rising suns)
- eyes, sparkles, brains and circuits
- anything that looks like the INEC seal or a coat of arms
- an "E" in a disc (too close to a well-known appliance brand whose name also starts with "Electr-")
- a receipt slip, and hollow, half-filled and filled circles (read as a phone or kiosk, and clashed with the status shapes in contract 4.2)
- the Cairn stones and tally directions, rejected by the owner

## Wordmark

"ElectraGuard" is set in Noto Sans SemiBold (600), shaped with the font's own kerning and tracked at -1.2 %. "AI" is set in Noto Sans Regular (400) at the same size, after a 0.30 em gap. The weight change makes it quieter and still works in one colour. Noto Sans is licensed under the SIL Open Font License and is the product's UI face. The lockups contain the letters as outlines, so they need no installed font.

## Files (folder `monogram/`)

| File | Use |
|---|---|
| `mark.svg` / `mark-white.svg` | Symbol alone, drawn on a 48-unit grid. Black, or white for dark surfaces (transparent background). |
| `favicon.svg` / `favicon-white.svg` | A separate drawing on a true 16 px grid: every vertex is a whole pixel, with square corners or 45° chamfers. The favicons have whole-pixel vertices. Use it at 16 px. |
| `lockup-horizontal.svg` / `-white` | Symbol plus wordmark. App bar, site header, documents. |
| `lockup-credit.svg` / `-white` | Horizontal lockup with "by Cairn" under the wordmark (Noto Sans Regular, 0.62 times the wordmark size, outlined). Use where the credit line is shown. |
| `lockup-stacked.svg` / `-white` | Symbol (1.1×) above the wordmark (0.8× the horizontal size). Splash screens, posters, square spaces. |
| `app-icon-maskable.svg` | 512 × 512 Android icon: black full bleed, white symbol. Export 192 and 512 PNGs for the web app manifest (`"purpose": "maskable"`). |

**Art size in the maskable icon.** The artwork's longer side is 50 % of the canvas, limited by the safe circle: every point of the outline, curves included, sits inside a centred circle 66 % of the canvas wide.

**Colour.** The logo is deliberately pure `#000` / `#fff`. UI ink in the product is `#0B0B0C` (contract §4.2). Do not "correct" either one to match the other.

**ViewBoxes are tight.** Lockup and mark files have no padding baked in, so apply the clear-space rule below wherever they are placed.

**Rebuilding.** `generate.py` rebuilds every SVG from the geometry, with all transforms baked into the path data (no `transform` attributes, no zero-length segments). The mark has no holes, so no fill-rule is needed for it. The letters in the lockups do have holes (for example the "a" and "d"), and their outlines carry their own winding. Setup:

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
| Credit lockup | 32 px tall (screen) · 9 mm (print). The credit type is 36.6 % of lockup height, about 11.7 px at 32 px. | Use the horizontal lockup without the credit |
| Stacked lockup | 56 px tall (screen) · 15 mm (print). Wordmark cap height is 19.3 % of lockup height, about 15.1 px type at 56 px. | Use the horizontal lockup |
| Android icon | 48 dp launcher size, from the 192/512 exports | n/a |

## Rules

- Pure black on white or pure white on black only. Never tint the mark or use the status colours on it.
- Do not redraw, stretch, outline, add shadows or rotate the mark.
- Do not put the mark on photographs or busy backgrounds. Use a plain panel.
- Never show the Cairn logo or stones with the mark, and never add the Cairn symbol to the credit line.
- Use only the supplied lockups, and no other typeface beside the mark.
- Never combine the mark with flags, party colours, the INEC logo or any government emblem.

## Before public use

Run a trademark search on the name "ElectraGuard" and on the chosen symbol: the Nigerian Trademarks Registry (classes 9, 42 and 45) and the WIPO Global Brand Database. Keep this dated board and the source files as a record of when the mark was created.
