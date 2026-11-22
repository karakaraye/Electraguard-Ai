# ElectraGuard AI: product mark

**Status:** three directions for decision · 22 Nov 2026 · Cairn Assure
Comparison board: [board.html](board.html) (rendered: [board.png](board.png)).

The mark follows the design contract ([../design-contract.md](../design-contract.md)): black and white only, no colour, and it has to read on a cheap Android phone in sunlight. Every direction is drawn as plain geometry (no traced artwork) and ships in pure black `#000` and pure white `#fff`.

## What was ruled out, and why

No ballot boxes, ticks in rounded squares, shields, flags or flag colours, party-like symbols (brooms, umbrellas, rising suns), eyes, sparkles, brains or circuits, and nothing that looks like the INEC seal or a coat of arms. ElectraGuard is nonpartisan, so the mark must not resemble any party or government emblem. A seal built around a stylised "E" in a disc was also dropped: the "Electr-" name is too close to a well-known appliance brand that uses an abstract E.

## The three directions

### A. Cairn (recommended)
Three resting stones, flat underneath and domed on top, each slightly off-centre, with the top stone tilted a few degrees. A cairn is the marker walkers build so the next person can trust the path. That is what a checked report does for the public, and the mark also carries the parent name, Cairn Assure.
- Survives 16 px: three solid bars with 1 px gaps, and the favicon is drawn separately on whole pixels.
- Nothing like it in the civic or election field, and no political reading.
- Watch-out: if the stones were drawn as even pills they would read as a burger or a "layers" icon. The uneven radii, the offsets and the tilt prevent that. Keep the drawing exactly as supplied.

### B. Stub
A paper slip with two written lines. The bottom part is a solid stub, cut off by notches like a ticket. Every report gives back a receipt code the observer keeps, so the mark says "what you sent was received."
- The strongest link to a real product moment (the receipt screen).
- Weakness: at 16 to 24 px the outlined slip on a solid base can read as a phone, a kiosk or a document holder. The meaning needs explaining more than A does.

### C. Trail
A hollow circle, a half-filled circle and a filled circle rising on a diagonal. These are the product's own status shapes for waiting, in review and decided, so the mark is literally "see what happened next."
- The neatest fit with the interface: the brand shapes and the status shapes are the same.
- Weakness: the half-filled circle closes up at 16 px, and loose dots can read as a loading indicator or bubbles. Using status shapes as the logo also risks confusion in the UI, where those same shapes mean real case states.

## Recommendation: A, Cairn

1. **Small sizes.** It is the only direction that stays a clear, solid shape at 16 px and on the 24 px app bar without fine strokes, because it is all filled forms.
2. **Meaning without a lecture.** "A marker people can trust" is a calm, official idea that sides with no one. It suits observers, citizens and staff alike.
3. **One family.** It ties the product to Cairn Assure without putting the company name in the product.
4. **Room to grow.** Single stones can serve as a quiet section or loading motif later (static, no looping animation). B and C have no comparable visual vocabulary.

## Wordmark

"ElectraGuard" is set in Noto Sans SemiBold (600), shaped with the font's kerning and tracking of -1.2 %. "AI" is set in Noto Sans Regular (400) at the same size, with a gap of 0.30 em. The weight change alone makes it quieter, so it still works in one colour. Noto Sans is licensed under the SIL Open Font License and is already the product's UI face. The letters in the SVG lockups are converted to outlines, so the files do not need the font installed.

## Files (each direction folder: `cairn/`, `stub/`, `trail/`)

| File | Use |
|---|---|
| `mark.svg` / `mark-white.svg` | Symbol alone, 48-unit grid. Black, or white for dark surfaces (transparent background). |
| `favicon.svg` / `favicon-white.svg` | Separate 16-unit drawing aligned to whole pixels. Use it at 16 to 20 px **only**. |
| `lockup-horizontal.svg` / `-white` | Symbol plus wordmark. App bars, site header, documents. |
| `lockup-stacked.svg` / `-white` | Symbol above wordmark, symbol at 1.5×. Splash, posters, square spaces. |
| `app-icon-maskable.svg` | 512 × 512 Android icon: black full bleed, white symbol at 50 % of the canvas, well inside the 80 % safe circle. Export to 192 and 512 PNG for the web app manifest (`"purpose": "maskable"`). |

`generate.py` rebuilds every SVG from the geometry. It needs `fonttools` and `uharfbuzz`, plus the Noto Sans `.woff` files: set `NOTO_SANS_DIR` to the folder that holds them, then run `python generate.py docs/design/brand`.

## Clear space

- **Symbol alone:** keep a clear margin of at least **25 % of the symbol's height** on every side. For Cairn, that is about the height of the bottom stone.
- **Lockups:** keep a clear margin of at least the **wordmark's cap height** ("E") on every side. Never put other text, icons or edges inside it.
- On the 56 px app bar, the 16 px side padding of the bar counts as the clear space.

## Minimum sizes

| Asset | Smallest size | Below that |
|---|---|---|
| Symbol (`mark.svg`) | 24 px tall (screen) · 6 mm (print) | Use `favicon.svg` |
| Favicon drawing | 16 px | Not used smaller |
| Horizontal lockup | 20 px tall (screen) · 5 mm (print) | Use the symbol alone |
| Stacked lockup | 64 px tall (screen) · 16 mm (print) | Use the horizontal lockup |
| Android icon | 48 dp launcher size from the 192/512 exports | n/a |

## Rules

- Pure black on white or pure white on black only. Do not tint the mark, and never use the status colours on it.
- Do not redraw, stretch, outline, add shadows or rotate the mark (Cairn's top-stone tilt is part of the drawing).
- Do not put the mark on photographs or busy backgrounds. Place it on a plain panel.
- Do not set "ElectraGuard AI" in another typeface next to the mark. The supplied lockups are the only arrangements.
- Do not combine the mark with flags, party colours, the INEC logo or any government emblem in one lockup.

## Before this mark is used publicly

Run a trademark search (Nigerian Trademarks Registry, classes 9, 42 and 45, plus WIPO Global Brand Database) on the name "ElectraGuard" and on the chosen symbol. Keep the dated board and these source files as proof of when it was created.
