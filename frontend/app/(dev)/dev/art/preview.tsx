"use client";

/*
 * Development-only preview of the background art. Sample text is neutral filler for
 * judging contrast and placement; it never ships to a production route.
 *
 *   /dev/art                       light, with a pinned action
 *   /dev/art?theme=dark            dark
 *   /dev/art?clear=none            no action area (receipt-style screens)
 *   /dev/art?frames=1              360 px and 1280 px, light and dark, side by side
 */
import { useSearchParams } from "next/navigation";
import { AppShell, BackgroundArt, Button } from "../../../../ui";

const FRAMES = [
  { w: 360, h: 760, theme: "light" },
  { w: 360, h: 760, theme: "dark" },
  { w: 1280, h: 800, theme: "light" },
  { w: 1280, h: 800, theme: "dark" },
] as const;

export function ArtPreview() {
  const params = useSearchParams();
  const theme = params.get("theme") === "dark" ? "dark" : "light";
  const noActions = params.get("clear") === "none";

  if (params.get("frames")) {
    return (
      <div style={{ display: "flex", flexWrap: "wrap", gap: 24, padding: 24, background: "#e9e9e6", alignItems: "flex-start" }}>
        {FRAMES.map((f) => {
          const scale = f.w > 400 ? 0.5 : 1;
          return (
            <figure key={`${f.w}-${f.theme}`} style={{ margin: 0 }}>
              <div style={{ width: f.w * scale, height: f.h * scale, overflow: "hidden", border: "1px solid #b9b9b4" }}>
                <iframe
                  title={`${f.w} px ${f.theme}`}
                  src={`/dev/art?theme=${f.theme}`}
                  width={f.w}
                  height={f.h}
                  style={{ border: 0, transform: `scale(${scale})`, transformOrigin: "0 0" }}
                />
              </div>
              <figcaption style={{ font: "600 13px/1.4 system-ui", marginTop: 6 }}>
                {f.w} px, {f.theme}
              </figcaption>
            </figure>
          );
        })}
      </div>
    );
  }

  return (
    <AppShell
      title="Observer"
      hideBack
      theme={theme}
      actions={noActions ? undefined : <Button>Continue</Button>}
    >
      <BackgroundArt clear={noActions ? "none" : "actions"} />
      <h1 style={{ font: "var(--t-title)", margin: "0 0 var(--s-4)" }}>What this app keeps</h1>
      <p style={{ margin: "0 0 var(--s-4)", color: "var(--ink)" }}>
        Your reports, the photos and recordings you add, and the polling unit you choose. Nothing is shared with a
        party or a candidate.
      </p>
      <p style={{ margin: "0 0 var(--s-4)", color: "var(--ink-2)" }}>
        Reports stay on this phone until the network returns, then they are sent in the order you made them. You can
        clear this phone at any time from Settings.
      </p>
      <p style={{ margin: 0, font: "var(--t-small)", color: "var(--ink-3)" }}>Sample text for the art preview.</p>
    </AppShell>
  );
}
