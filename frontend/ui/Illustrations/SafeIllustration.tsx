"use client";

import styles from "./Illustrations.module.css";

export function SafeIllustration() {
  return (
    <div className={styles.illustrationWrapper} aria-hidden="true">
      <svg
        viewBox="0 0 320 280"
        fill="none"
        xmlns="http://www.w3.org/2000/svg"
        className={styles.svgSafe}
      >
        {/* Warm sun circle in background */}
        <circle cx="160" cy="120" r="88" fill="var(--sun-light, #F6E3B8)" />
        <circle cx="160" cy="120" r="68" fill="var(--sun, #E3B060)" opacity="0.35" />

        {/* Hand sleeve / wrist */}
        <path
          d="M130 280 C130 250 140 230 150 200 L180 200 C190 230 200 250 200 280 Z"
          fill="var(--paper-3, #EAE4D7)"
        />

        {/* Hand contour holding the phone */}
        <path
          d="M110 150 C110 130 120 120 125 125 C130 130 128 145 128 165 C125 180 135 195 150 200 L175 200 C190 195 200 175 200 150 C200 130 195 110 190 115 C185 120 188 135 188 150"
          stroke="var(--ink-2, #4A453E)"
          strokeWidth="3"
          strokeLinecap="round"
          strokeLinejoin="round"
          fill="var(--paper-2, #F3EFE6)"
        />

        {/* Phone body */}
        <rect
          x="122"
          y="50"
          width="86"
          height="146"
          rx="14"
          fill="#16130F"
          stroke="#16130F"
          strokeWidth="2"
        />
        {/* Phone screen */}
        <rect x="126" y="54" width="78" height="138" rx="10" fill="#FCFAF5" />

        {/* Polling booth & ballot box inside screen */}
        <rect x="134" y="118" width="34" height="26" fill="#EAE4D7" rx="2" />
        <rect x="144" y="112" width="14" height="6" fill="#D0C9BE" rx="1" />
        <line x1="151" y1="114" x2="151" y2="117" stroke="#16130F" strokeWidth="1.5" />

        {/* People shapes with pixelated/blurred faces */}
        {/* Person 1 */}
        <path d="M132 100 C132 92 138 88 146 88 C154 88 160 92 160 100 L160 120 L132 120 Z" fill="#756F66" />
        {/* Pixel face block */}
        <rect x="140" y="74" width="12" height="13" fill="#D59F4A" rx="1" opacity="0.9" />
        <rect x="140" y="74" width="6" height="6" fill="#B58943" />
        <rect x="146" y="81" width="6" height="6" fill="#E3B060" />

        {/* Person 2 */}
        <path d="M165 98 C165 92 170 88 178 88 C186 88 190 92 190 98 L190 120 L165 120 Z" fill="#4A453E" />
        {/* Pixel face block 2 */}
        <rect x="171" y="73" width="12" height="13" fill="#D59F4A" rx="1" opacity="0.9" />
        <rect x="177" y="73" width="6" height="6" fill="#B58943" />
        <rect x="171" y="80" width="6" height="6" fill="#E3B060" />

        {/* Floating badge 1: Location removed badge */}
        <g transform="translate(132, 150)">
          <circle cx="14" cy="14" r="14" fill="#FFFFFF" filter="drop-shadow(0 2px 4px rgba(0,0,0,0.12))" />
          <path
            d="M14 8 C11 8 8.5 10.5 8.5 13.5 C8.5 17.5 14 22 14 22 C14 22 19.5 17.5 19.5 13.5 C19.5 10.5 17 8 14 8 Z"
            stroke="#16130F"
            strokeWidth="1.5"
            fill="none"
          />
          <line x1="8" y1="20" x2="20" y2="8" stroke="#D32F2F" strokeWidth="2" strokeLinecap="round" />
        </g>

        {/* Floating badge 2: Eye blur badge */}
        <g transform="translate(168, 150)">
          <circle cx="14" cy="14" r="14" fill="#FFFFFF" filter="drop-shadow(0 2px 4px rgba(0,0,0,0.12))" />
          <path
            d="M9 13 C11 16 17 16 19 13"
            stroke="#16130F"
            strokeWidth="1.75"
            strokeLinecap="round"
            fill="none"
          />
          <line x1="10" y1="16" x2="8.5" y2="18.5" stroke="#16130F" strokeWidth="1.5" strokeLinecap="round" />
          <line x1="14" y1="17" x2="14" y2="20" stroke="#16130F" strokeWidth="1.5" strokeLinecap="round" />
          <line x1="18" y1="16" x2="19.5" y2="18.5" stroke="#16130F" strokeWidth="1.5" strokeLinecap="round" />
        </g>
      </svg>
    </div>
  );
}
