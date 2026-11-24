"use client";

import styles from "./Illustrations.module.css";

export function PollingDayIllustration({ progress = 0.45 }: { progress?: number }) {
  // Calculate sun position along quadratic bezier curve M 50 50 Q 180 10 310 50
  // B(t) = (1-t)^2 P0 + 2(1-t)t P1 + t^2 P2
  const t = Math.max(0.05, Math.min(0.95, progress));
  const sunX = Math.round((1 - t) * (1 - t) * 50 + 2 * (1 - t) * t * 180 + t * t * 310);
  const sunY = Math.round((1 - t) * (1 - t) * 50 + 2 * (1 - t) * t * 10 + t * t * 50);

  return (
    <div className={styles.pollingDayIllustration} aria-hidden="true">
      <svg
        viewBox="0 0 360 210"
        fill="none"
        xmlns="http://www.w3.org/2000/svg"
        className={styles.svgPollingDay}
      >
        {/* Dotted arc for day progress */}
        <path
          d="M 50 50 Q 180 10 310 50"
          stroke="var(--sun, #E3B060)"
          strokeWidth="1.5"
          strokeDasharray="3 5"
          fill="none"
          opacity="0.8"
        />

        {/* Time markers */}
        <text x="46" y="54" fill="var(--ink-2, #605A52)" fontSize="11" fontWeight="600" textAnchor="end" fontFamily="var(--font-body)">
          07:30
        </text>
        <text x="314" y="54" fill="var(--ink-2, #605A52)" fontSize="11" fontWeight="600" textAnchor="start" fontFamily="var(--font-body)">
          16:00
        </text>

        {/* Traveling sun disc */}
        <circle cx={sunX} cy={sunY} r="8.5" fill="var(--sun-accent, #E3B060)" />

        {/* Scene Background Tint / Soft Horizon */}
        <path d="M 0 150 Q 180 145 360 150 L 360 210 L 0 210 Z" fill="var(--paper-2, #F3EFE6)" opacity="0.6" />

        {/* Trees on Left */}
        <g stroke="var(--ink-2, #554F47)" strokeWidth="1" fill="var(--paper-3, #EAE4D7)">
          {/* Main big tree trunk */}
          <path d="M 55 185 Q 52 140 40 105 Q 48 100 58 135 Q 65 110 68 85 Q 75 90 70 135 L 75 185 Z" fill="#6A5E50" opacity="0.4" />
          {/* Tree foliage */}
          <ellipse cx="60" cy="80" rx="42" ry="32" fill="#788065" opacity="0.3" />
          <ellipse cx="85" cy="95" rx="30" ry="24" fill="#6E785B" opacity="0.35" />
          <ellipse cx="38" cy="90" rx="26" ry="22" fill="#5C6648" opacity="0.25" />
        </g>

        {/* School Building */}
        <g stroke="var(--ink-2, #554F47)" strokeWidth="1" fill="var(--paper, #FAF7F0)">
          {/* Main hall roof */}
          <polygon points="120,105 180,82 240,105" fill="var(--paper-3, #EAE4D7)" />
          {/* Hall facade */}
          <rect x="125" y="105" width="110" height="55" fill="var(--paper, #FAF7F0)" />
          {/* Pediment / School Sign */}
          <rect x="135" y="92" width="90" height="15" fill="var(--paper, #FAF7F0)" />
          <text x="180" y="103" fill="var(--ink, #16130F)" fontSize="7" fontWeight="700" letterSpacing="0.05em" textAnchor="middle" fontFamily="var(--font-display)">
            ST. PETER&apos;S PRIMARY SCHOOL
          </text>
          {/* Main door */}
          <rect x="170" y="125" width="20" height="35" fill="var(--ink, #25201A)" opacity="0.75" />
          {/* Windows */}
          <rect x="135" y="118" width="12" height="16" fill="var(--paper-3, #EAE4D7)" />
          <rect x="152" y="118" width="12" height="16" fill="var(--paper-3, #EAE4D7)" />
          <rect x="196" y="118" width="12" height="16" fill="var(--paper-3, #EAE4D7)" />
          <rect x="213" y="118" width="12" height="16" fill="var(--paper-3, #EAE4D7)" />

          {/* Left building wing */}
          <rect x="50" y="115" width="75" height="45" fill="var(--paper, #FAF7F0)" />
          <polygon points="45,115 125,115 120,105 45,105" fill="var(--paper-3, #EAE4D7)" />
          <rect x="70" y="122" width="10" height="14" fill="var(--paper-3, #EAE4D7)" />
          <rect x="92" y="122" width="10" height="14" fill="var(--paper-3, #EAE4D7)" />
        </g>

        {/* Polling Canopy / White Tent on Right */}
        <g stroke="var(--ink-2, #554F47)" strokeWidth="1">
          {/* Tent top */}
          <polygon points="215,130 260,98 305,130" fill="var(--paper, #FFFFFF)" />
          {/* Tent poles */}
          <line x1="220" y1="130" x2="220" y2="175" strokeWidth="1.5" />
          <line x1="300" y1="130" x2="300" y2="175" strokeWidth="1.5" />
          <line x1="260" y1="130" x2="260" y2="175" strokeWidth="1.2" />
          {/* Officials seated at desk */}
          <rect x="235" y="152" width="50" height="12" fill="var(--paper-3, #EAE4D7)" />
          <circle cx="245" cy="144" r="4.5" fill="var(--ink, #16130F)" />
          <circle cx="260" cy="144" r="4.5" fill="var(--ink, #16130F)" />
          <circle cx="275" cy="144" r="4.5" fill="var(--ink, #16130F)" />
          <path d="M 238 152 Q 245 148 252 152" stroke="var(--ink, #16130F)" strokeWidth="4" />
          <path d="M 253 152 Q 260 148 267 152" stroke="var(--ink, #16130F)" strokeWidth="4" />
          <path d="M 268 152 Q 275 148 282 152" stroke="var(--ink, #16130F)" strokeWidth="4" />
        </g>

        {/* Right Wall / Signboard */}
        <g stroke="var(--ink-2, #554F47)" strokeWidth="1" fill="var(--paper, #FAF7F0)">
          <rect x="305" y="125" width="50" height="50" fill="var(--paper-2, #EAE4D7)" />
          <text x="330" y="145" fill="var(--ink-2, #554F47)" fontSize="6" fontWeight="700" letterSpacing="0.05em" textAnchor="middle" fontFamily="var(--font-display)">
            A STRONGER
          </text>
          <text x="330" y="153" fill="var(--ink-2, #554F47)" fontSize="6" fontWeight="700" letterSpacing="0.05em" textAnchor="middle" fontFamily="var(--font-display)">
            TOMORROW
          </text>
          <text x="330" y="161" fill="var(--ink-2, #554F47)" fontSize="6" fontWeight="700" letterSpacing="0.05em" textAnchor="middle" fontFamily="var(--font-display)">
            TOGETHER
          </text>
        </g>

        {/* Palm Tree behind right wall */}
        <g stroke="var(--ink-2, #554F47)" strokeWidth="1" fill="none">
          <path d="M 345 140 Q 343 100 348 70" strokeWidth="2.5" stroke="#7A6855" />
          {/* Palm fronds */}
          <path d="M 348 70 Q 320 60 310 75" stroke="#6E785B" strokeWidth="1.8" />
          <path d="M 348 70 Q 330 45 325 50" stroke="#6E785B" strokeWidth="1.8" />
          <path d="M 348 70 Q 350 40 355 45" stroke="#6E785B" strokeWidth="1.8" />
          <path d="M 348 70 Q 370 50 375 60" stroke="#6E785B" strokeWidth="1.8" />
          <path d="M 348 70 Q 375 75 365 85" stroke="#6E785B" strokeWidth="1.8" />
        </g>

        {/* Queue of voters walking to entrance */}
        <g fill="var(--ink, #16130F)">
          {/* Voter 1 */}
          <circle cx="168" cy="148" r="3" />
          <rect x="166" y="152" width="4" height="14" rx="1.5" />
          {/* Voter 2 */}
          <circle cx="173" cy="150" r="3" />
          <rect x="171" y="154" width="4.5" height="15" rx="1.5" />
          {/* Voter 3 */}
          <circle cx="179" cy="153" r="3.2" />
          <rect x="177" y="157" width="5" height="16" rx="1.5" />
          {/* Voter 4 */}
          <circle cx="185" cy="155" r="3.2" />
          <rect x="183" y="159" width="5" height="16" rx="1.5" />
          {/* Voter 5 */}
          <circle cx="192" cy="157" r="3.5" />
          <rect x="190" y="161" width="5.5" height="18" rx="1.5" />
          {/* Voter 6 */}
          <circle cx="200" cy="160" r="3.8" />
          <rect x="197" y="165" width="6" height="20" rx="1.5" />
        </g>

        {/* Ground line */}
        <line x1="0" y1="185" x2="360" y2="185" stroke="var(--ink-2, #554F47)" strokeWidth="1" opacity="0.4" />
      </svg>
    </div>
  );
}
