import { locales, localeNames, type Locale } from "../../../../lib/i18n";
import "../living-scene/scene-colours.css";
import "./landing-art.css";
import styles from "./story.module.css";

/*
 * The four drawings of "How a report travels" (landing plan §4.3). Inline SVG in the polling-scene
 * palette. Every drawing's base markup is its finished, still frame; story.module.css plays it
 * from its first frame only when the page is allowed to move. They hold no words except the
 * translated labels the plan names, and they are hidden from screen readers (the step sentence says it all).
 */

function Backdrop() {
  return (
    <>
      <ellipse cx="240" cy="282" rx="214" ry="10" className="ga-sh" opacity="0.5" />
    </>
  );
}

/* Chips: where each language sits in the two rows of the phone's language picker. */
const CHIPS: Record<Locale, { x: number; y: number; w: number }> = {
  en: { x: 172, y: 56, w: 46 },
  pcm: { x: 222, y: 56, w: 38 },
  ha: { x: 264, y: 56, w: 34 },
  yo: { x: 172, y: 78, w: 40 },
  ig: { x: 216, y: 78, w: 30 },
};

const CYCLE: Locale[] = ["ha", "yo", "pcm"];
const CYCLE_CLASS: Record<string, string> = { ha: styles.cycleA, yo: styles.cycleB, pcm: styles.cycleC };

/** Step 1: the report form in the person's language, the signal dropping, the Outbox, then sent. */
export function ArtReport({ locale, lines, outbox }: { locale: Locale; lines: Partial<Record<Locale, string>>; outbox: string }) {
  return (
    <svg className="ga living-scene" viewBox="120 8 240 276" style={{ overflow: "hidden" }} aria-hidden="true" focusable="false">
      <Backdrop />
      <rect x="160" y="14" width="160" height="264" rx="24" className="ga-c1" />
      <rect x="168" y="26" width="144" height="240" rx="16" className="ga-rd" />
      <rect x="226" y="30" width="28" height="5" rx="2.5" className="ga-c4" />

      {[0, 1, 2, 3].map((i) => (
        <rect key={i} x={272 + i * 8} y={46 - (i + 1) * 4 - 1} width="5" height={(i + 1) * 4 + 1} rx="1.5" className={`ga-ink2 ${styles.signal} ${styles[`signal${i}`]}`} />
      ))}

      {locales.map((code) => {
        const chip = CHIPS[code];
        return (
          <g key={code}>
            <rect x={chip.x} y={chip.y} width={chip.w} height="16" rx="8" fill="none" className="ga-edge" />
            {CYCLE.includes(code) ? <rect x={chip.x} y={chip.y} width={chip.w} height="16" rx="8" className={`ga-sunt ${styles.chipHi} ${CYCLE_CLASS[code]}`} /> : null}
            {code === locale ? <rect x={chip.x} y={chip.y} width={chip.w} height="16" rx="8" className={`ga-sunt ${styles.chipNow}`} /> : null}
            <text x={chip.x + chip.w / 2} y={chip.y + 11.2} textAnchor="middle" fontSize="9.5" fontWeight="600" className="ga-ink">
              {localeNames[code]}
            </text>
          </g>
        );
      })}

      <foreignObject x="172" y="100" width="136" height="44">
        <div className={styles.lines}>
          {CYCLE.map((code) => (
            <p key={code} lang={code} className={`${styles.line} ${styles.lineCycle} ${CYCLE_CLASS[code]}`}>
              {lines[code]}
            </p>
          ))}
          <p lang={locale} className={`${styles.line} ${styles.lineNow}`}>
            {lines[locale]}
          </p>
        </div>
      </foreignObject>

      <rect x="172" y="150" width="136" height="8" rx="4" className="ga-c4" />
      <rect x="172" y="164" width="136" height="8" rx="4" className="ga-c4" />
      <rect x="172" y="178" width="92" height="8" rx="4" className="ga-c4" />
      <rect x="172" y="198" width="136" height="26" rx="13" className="ga-c1" />

      <g className={styles.outbox}>
        <rect x="172" y="232" width="136" height="24" rx="12" className="ga-rd" />
        <rect x="172" y="232" width="136" height="24" rx="12" fill="none" className="ga-edge" />
        <circle cx="188" cy="244" r="6.5" fill="none" className="ga-line ga-s1" strokeWidth="1.6" />
        <line x1="188" y1="244" x2="188" y2="239.6" className={`ga-line ga-s1 ${styles.clockHand}`} strokeWidth="1.6" />
        <text x="200" y="247.6" fontSize="11" fontWeight="600" className="ga-ink">
          {outbox}
        </text>
      </g>
      <g className={styles.sent}>
        <circle cx="240" cy="244" r="12" className="ga-okbg" />
        <circle cx="240" cy="244" r="12" fill="none" className="ga-line ga-sok" strokeWidth="2" />
        <path d="M234 244.5l4.4 4.4 8-9" className="ga-line ga-sok" strokeWidth="2.4" />
      </g>
    </svg>
  );
}

/** Step 2: a paper receipt prints out of the phone. The code appears as a shape, never a real code. */
export function ArtReceipt() {
  return (
    <svg className="ga living-scene" viewBox="0 0 480 300" aria-hidden="true" focusable="false">
      <Backdrop />
      <g clipPath="url(#ga-clip-2b)">
        <g className={styles.paper}>
          <path d="M216 74 H388 V244 l-10.75 9 -10.75 -9 -10.75 9 -10.75 -9 -10.75 9 -10.75 -9 -10.75 9 -10.75 -9 -10.75 9 -10.75 -9 -10.75 9 -10.75 -9 -10.75 9 -10.75 -9 -10.75 9 -10.75 -9 -10.75 9 -10.75 -9 Z" className="ga-rd" />
          <path d="M216 74 H388 V244 l-10.75 9 -10.75 -9 -10.75 9 -10.75 -9 -10.75 9 -10.75 -9 -10.75 9 -10.75 -9 -10.75 9 -10.75 -9 -10.75 9 -10.75 -9 -10.75 9 -10.75 -9 -10.75 9 -10.75 -9 -10.75 9 -10.75 -9" fill="none" className="ga-edge" />
          <rect x="236" y="92" width="132" height="1.5" className="ga-c4" />
          <text x="302" y="122" textAnchor="middle" fontSize="19" fontWeight="800" letterSpacing="1.4" className="ga-ink">
            EG-····-····
          </text>
          <rect x="236" y="136" width="132" height="1.5" className="ga-c4" />
          <circle cx="302" cy="180" r="21" className="ga-sunt" />
          <circle cx="302" cy="180" r="21" fill="none" className="ga-line ga-sstrong" strokeWidth="2" />
          <path d="M292 180.5l7 7 12-14" className="ga-line ga-sink" strokeWidth="3" />
          <rect x="250" y="216" width="104" height="6" rx="3" className="ga-c4" />
          <rect x="266" y="228" width="72" height="6" rx="3" className="ga-c4" />
        </g>
      </g>
      <defs>
        <clipPath id="ga-clip-2b">
          <rect x="214" y="0" width="266" height="300" />
        </clipPath>
      </defs>
      <rect x="104" y="44" width="112" height="236" rx="22" className="ga-c1" />
      <rect x="111" y="56" width="98" height="212" rx="15" className="ga-rd" />
      <rect x="146" y="60" width="28" height="5" rx="2.5" className="ga-c4" />
      <circle cx="160" cy="130" r="24" className="ga-okbg" />
      <circle cx="160" cy="130" r="24" fill="none" className="ga-line ga-sok" strokeWidth="2.4" />
      <path d="M149 131l8 8 14-16" className="ga-line ga-sok" strokeWidth="3" />
      <rect x="124" y="176" width="72" height="8" rx="4" className="ga-c4" />
      <rect x="132" y="192" width="56" height="8" rx="4" className="ga-c4" />
      <rect x="213" y="104" width="6" height="28" rx="3" className="ga-c2" />
    </svg>
  );
}

function Sheet({ x, y }: { x: number; y: number }) {
  return (
    <>
      <rect x={x} y={y} width="72" height="48" rx="4" className="ga-rd" />
      <rect x={x} y={y} width="72" height="48" rx="4" fill="none" className="ga-edge" />
      <rect x={x + 8} y={y + 9} width="40" height="4" rx="2" className="ga-c3" />
      <rect x={x + 8} y={y + 19} width="54" height="4" rx="2" className="ga-c4" />
      <rect x={x + 8} y={y + 29} width="48" height="4" rx="2" className="ga-c4" />
    </>
  );
}

/** Step 3: a person at a desk reads what the computer suggested, then stamps it Reviewed. */
export function ArtReview({ suggested, reviewed }: { suggested: string; reviewed: string }) {
  return (
    <svg className="ga living-scene" viewBox="20 70 440 212" aria-hidden="true" focusable="false">
      <Backdrop />
      {/* desk */}
      <rect x="28" y="222" width="424" height="14" rx="4" className="ga-c3" />
      <rect x="56" y="236" width="12" height="42" className="ga-c4" />
      <rect x="412" y="236" width="12" height="42" className="ga-c4" />

      {/* the person */}
      <path d="M210 222 V152 q0 -26 30 -26 q30 0 30 26 V222 Z" className="ga-c4" />
      <rect x="232" y="116" width="16" height="16" rx="5" className="ga-sk" />
      <circle cx="240" cy="102" r="20" className="ga-sk" />
      <path d="M219.5 100 a20.5 20.5 0 0 1 41 0 q-20.5 -9 -41 0 Z" className="ga-hr" />
      <path d="M216 148 L186 214" fill="none" strokeWidth="13" className="ga-line ga-s4" />
      <path d="M264 148 L350 150" fill="none" strokeWidth="13" className="ga-line ga-s4" />
      <circle cx="184" cy="216" r="7" className="ga-sk" />
      {/* laptop, seen from behind */}
      <rect x="212" y="178" width="56" height="40" rx="4" className="ga-c2" />
      <circle cx="240" cy="198" r="5" className="ga-sun" />
      <rect x="204" y="218" width="72" height="5" rx="2.5" className="ga-c1" />

      {/* left pile: suggested by the computer */}
      <foreignObject x="22" y="76" width="140" height="36">
        <div className={styles.tag}>{suggested}</div>
      </foreignObject>
      <g transform="translate(56 174)">
        <Sheet x={0} y={0} />
      </g>

      {/* right pile: reviewed */}
      <foreignObject x="306" y="76" width="140" height="36">
        <div className={styles.tag}>{reviewed}</div>
      </foreignObject>
      <g transform="translate(336 174)">
        <g className={styles.sheet1}>
          <Sheet x={0} y={0} />
        </g>
      </g>
      <g transform="translate(340 166)">
        <g className={styles.sheet2}>
          <Sheet x={0} y={0} />
        </g>
      </g>
      <g transform="translate(344 158)">
        <g className={styles.sheet3}>
          <Sheet x={0} y={0} />
          <g className={styles.mark}>
            <g transform="rotate(-7 36 24)">
              <rect x="6" y="11" width="60" height="26" rx="5" className="ga-sunw" />
              <rect x="6" y="11" width="60" height="26" rx="5" fill="none" className="ga-line ga-sstrong" strokeWidth="1.8" />
              <path d="M21 24.5l8 8 18-19" fill="none" strokeWidth="4" className="ga-line ga-sink" />
            </g>
          </g>
        </g>
      </g>
      {/* the stamp, held by the right hand */}
      <g className={styles.stamp}>
        <rect x="346" y="124" width="14" height="26" rx="5" className="ga-c1" />
        <rect x="338" y="148" width="30" height="8" rx="3" className="ga-c2" />
        <circle cx="353" cy="146" r="8" className="ga-sk" />
      </g>
    </svg>
  );
}

/** Step 4: a face and a name are wiped out by a privacy band; only reviewed totals by state remain. */
export function ArtTotals() {
  const bars = [118, 100, 84, 62, 40];
  return (
    <svg className="ga living-scene" viewBox="0 0 480 300" aria-hidden="true" focusable="false">
      <Backdrop />
      {/* the report sheet */}
      <rect x="28" y="46" width="150" height="200" rx="8" className="ga-rd" />
      <rect x="28" y="46" width="150" height="200" rx="8" fill="none" className="ga-edge" />
      <rect x="44" y="64" width="54" height="54" rx="6" className="ga-c4" />
      <circle cx="71" cy="85" r="11" className="ga-sk" />
      <path d="M52 118 q0 -20 19 -20 q19 0 19 20 Z" className="ga-c2" />
      <rect x="108" y="70" width="56" height="8" rx="4" className="ga-c2" />
      <rect x="108" y="86" width="40" height="6" rx="3" className="ga-c3" />
      <rect x="108" y="100" width="48" height="6" rx="3" className="ga-c3" />
      <rect x="44" y="140" width="120" height="6" rx="3" className="ga-c4" />
      <rect x="44" y="156" width="120" height="6" rx="3" className="ga-c4" />
      <rect x="44" y="172" width="96" height="6" rx="3" className="ga-c4" />
      <rect x="44" y="188" width="108" height="6" rx="3" className="ga-c4" />
      <rect x="44" y="204" width="70" height="6" rx="3" className="ga-c4" />
      {/* the privacy band */}
      <rect x="22" y="58" width="162" height="66" rx="5" className={`ga-c1 ${styles.band}`} />
      {/* the way to the totals */}
      <path d="M188 146 H232" fill="none" strokeDasharray="2 7" strokeWidth="2.6" className={`ga-line ga-sstrong ${styles.route}`} />
      <path d="M224 138 l10 8 -10 8" fill="none" strokeWidth="2.6" className={`ga-line ga-sstrong ${styles.route}`} />
      {/* totals by state: stubs, never names */}
      <rect x="244" y="46" width="214" height="200" rx="8" className="ga-rd" />
      <rect x="244" y="46" width="214" height="200" rx="8" fill="none" className="ga-edge" />
      {bars.map((width, i) => (
        <g key={i}>
          <rect x="260" y={70 + i * 34} width="30" height="10" rx="5" className="ga-c4" />
          <rect x="300" y={67 + i * 34} width="144" height="16" rx="8" className="ga-sunt" />
          <rect x="300" y={67 + i * 34} width={width + 20} height="16" rx="8" className={`ga-sunstrong ${styles.bar} ${styles[`bar${i}`]}`} />
        </g>
      ))}
    </svg>
  );
}
