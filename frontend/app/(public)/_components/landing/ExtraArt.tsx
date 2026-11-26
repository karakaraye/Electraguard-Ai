import "../living-scene/scene-colours.css";
import "./landing-art.css";
import { InView } from "./InView";
import styles from "./extra.module.css";

/** Results with nothing published yet: the ballot box on its table, closed with a padlock, and a clock. No words. */
export function ArtEmptyResults() {
  return (
    <InView className={styles.wrap} once={false}>
    <svg className="ga living-scene" viewBox="0 0 300 180" aria-hidden="true" focusable="false">
      <ellipse cx="150" cy="166" rx="128" ry="8" className="ga-sh" opacity="0.5" />
      {/* the table */}
      <rect x="40" y="136" width="220" height="10" rx="3" className="ga-cv" />
      <rect x="62" y="146" width="10" height="22" className="ga-cs" />
      <rect x="228" y="146" width="10" height="22" className="ga-cs" />
      {/* the ballot box */}
      <rect x="98" y="62" width="104" height="74" rx="6" className="ga-cn" />
      <rect x="98" y="62" width="104" height="74" rx="6" fill="none" className="ga-edge" />
      <rect x="98" y="62" width="104" height="12" rx="4" className="ga-cv" />
      <rect x="126" y="65" width="48" height="5" rx="2.5" className="ga-ink" />
      {/* the padlock */}
      <path d="M142.5 96 v-8 a7.5 7.5 0 0 1 15 0 v8" fill="none" strokeWidth="4" className="ga-line ga-sink" />
      <rect x="136" y="95" width="28" height="24" rx="5" className="ga-ink" />
      <circle cx="150" cy="104.5" r="3.4" className="ga-rd" />
      <rect x="148.6" y="106" width="2.8" height="7" rx="1.4" className="ga-rd" />
      {/* the clock */}
      <circle cx="238" cy="60" r="27" className="ga-rd" />
      <circle cx="238" cy="60" r="27" fill="none" strokeWidth="2.2" className="ga-line ga-s2" />
      <line x1="238" y1="60" x2="238" y2="44" strokeWidth="2.6" className="ga-line ga-sink" />
      <line x1="238" y1="60" x2="250" y2="60" strokeWidth="3" className="ga-line ga-sink" />
      <line x1="238" y1="60" x2="238" y2="40" strokeWidth="1.8" className={`ga-line ga-sstrong ${styles.hand}`} />
      <circle cx="238" cy="60" r="2.6" className="ga-ink" />
    </svg>
    </InView>
  );
}

/** The rumour card: a forwarded message. The stamp over it is real text, set in the page. */
export function ArtRumour() {
  return (
    <svg className="ga living-scene" viewBox="0 0 260 150" aria-hidden="true" focusable="false">
      <path d="M34 12 h192 a18 18 0 0 1 18 18 v68 a18 18 0 0 1 -18 18 h-130 l-34 22 8 -22 h-34 a18 18 0 0 1 -18 -18 v-68 a18 18 0 0 1 18 -18 z" className="ga-re" />
      <path d="M34 12 h192 a18 18 0 0 1 18 18 v68 a18 18 0 0 1 -18 18 h-130 l-34 22 8 -22 h-34 a18 18 0 0 1 -18 -18 v-68 a18 18 0 0 1 18 -18 z" fill="none" className="ga-edge" />
      <path d="M34 40 q0 -11 12 -11 h12 m-5 -6 l5 6 -5 6" fill="none" strokeWidth="2.2" className="ga-line ga-s2" />
      <rect x="72" y="26" width="58" height="6" rx="3" className="ga-c4" />
      <rect x="30" y="52" width="192" height="7" rx="3.5" className="ga-c3" />
      <rect x="30" y="66" width="170" height="7" rx="3.5" className="ga-c3" />
      <rect x="30" y="80" width="198" height="7" rx="3.5" className="ga-c3" />
      <rect x="30" y="94" width="112" height="7" rx="3.5" className="ga-c4" />
    </svg>
  );
}
