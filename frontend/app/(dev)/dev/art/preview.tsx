"use client";

/*
 * Development-only preview of the polling-day art. Sample text is neutral filler for judging
 * contrast and placement; it never ships to a production route.
 *
 *   /dev/art                       hero band (welcome screens), light
 *   /dev/art?variant=soft          soft background with a pinned action
 *   /dev/art?variant=soft&clear=none   soft, no action area
 *   /dev/art?theme=dark            dark (works with either variant)
 *   /dev/art?scene=1               the whole scene, light above dark, uncropped
 *   /dev/art?frames=1              360 px and 1280 px, hero and soft, light and dark
 */
import { useSearchParams } from "next/navigation";
import { AppShell, BackgroundArt, Button } from "../../../../ui";

const FRAMES = [
  { w: 360, h: 760, theme: "light", variant: "hero" },
  { w: 360, h: 760, theme: "dark", variant: "hero" },
  { w: 360, h: 760, theme: "light", variant: "soft" },
  { w: 360, h: 760, theme: "dark", variant: "soft" },
  { w: 1280, h: 800, theme: "light", variant: "hero" },
  { w: 1280, h: 800, theme: "dark", variant: "hero" },
] as const;

export function ArtPreview() {
  const params = useSearchParams();
  const theme = params.get("theme") === "dark" ? "dark" : "light";
  const variant = params.get("variant") === "soft" ? "soft" : "hero";
  const noActions = params.get("clear") === "none";

  if (params.get("scene")) {
    return (
      <div style={{ background: "#e9e9e6", padding: 24, display: "grid", gap: 24 }}>
        {(["light", "dark"] as const).map((t) => (
          // eslint-disable-next-line @next/next/no-img-element
          <img
            key={t}
            src={`/art/polling-day-${t}.svg`}
            alt=""
            style={{ display: "block", width: "100%", aspectRatio: "1600 / 560", background: t === "dark" ? "#111112" : "#fff" }}
          />
        ))}
      </div>
    );
  }

  if (params.get("frames")) {
    return (
      <div style={{ display: "flex", flexWrap: "wrap", gap: 24, padding: 24, background: "#e9e9e6", alignItems: "flex-start" }}>
        {FRAMES.map((f) => {
          const scale = f.w > 400 ? 0.5 : 1;
          return (
            <figure key={`${f.w}-${f.theme}-${f.variant}`} style={{ margin: 0 }}>
              <div style={{ width: f.w * scale, height: f.h * scale, overflow: "hidden", border: "1px solid #b9b9b4" }}>
                <iframe
                  title={`${f.w} px ${f.theme} ${f.variant}`}
                  src={`/dev/art?theme=${f.theme}&variant=${f.variant}`}
                  width={f.w}
                  height={f.h}
                  style={{ border: 0, transform: `scale(${scale})`, transformOrigin: "0 0" }}
                />
              </div>
              <figcaption style={{ font: "600 13px/1.4 system-ui", marginTop: 6 }}>
                {f.w} px, {f.variant}, {f.theme}
              </figcaption>
            </figure>
          );
        })}
      </div>
    );
  }

  const hero = variant === "hero";
  return (
    <AppShell
      title="Observer"
      hideBack
      theme={theme}
      actions={noActions ? undefined : <Button block>Continue</Button>}
    >
      {hero ? <BackgroundArt variant="hero" /> : <BackgroundArt variant="soft" clear={noActions ? "none" : "actions"} />}
      <div style={{ display: "grid", gap: "var(--s-4)", maxWidth: "var(--measure)" }}>
        <h1 style={{ font: "var(--t-title)", margin: 0 }}>What this app keeps</h1>
        <p style={{ margin: 0, color: "var(--ink)" }}>
          Your reports, the photos and recordings you add, and the polling unit you choose. Nothing is shared with a
          party or a candidate.
        </p>
        <p style={{ margin: 0, color: "var(--ink-2)" }}>
          Reports stay on this phone until the network returns, then they are sent in the order you made them. You
          can clear this phone at any time from Settings.
        </p>
        <p style={{ margin: 0, font: "var(--t-small)", color: "var(--ink-3)" }}>Sample text for the art preview.</p>
      </div>
    </AppShell>
  );
}
