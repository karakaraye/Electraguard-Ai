"use client";

import styles from "./Illustrations.module.css";

export function OfflineIllustration() {
  return (
    <div className={styles.illustrationWrapper} aria-hidden="true">
      <svg
        viewBox="0 0 340 240"
        fill="none"
        xmlns="http://www.w3.org/2000/svg"
        className={styles.svgOffline}
      >
        {/* Soft landscape / hill silhouette */}
        <path
          d="M0 210 Q90 180 180 200 T340 190 L340 240 L0 240 Z"
          fill="var(--paper-2, #F3EFE6)"
        />
        <path
          d="M0 225 Q120 205 240 220 T340 215 L340 240 L0 240 Z"
          fill="var(--paper-3, #EAE4D7)"
        />

        {/* Sun on top right with soft rays */}
        <g transform="translate(250, 70)">
          <circle cx="0" cy="0" r="30" fill="var(--sun, #E3B060)" />
          <line x1="0" y1="-40" x2="0" y2="-48" stroke="var(--sun, #E3B060)" strokeWidth="2.5" strokeLinecap="round" />
          <line x1="28" y1="-28" x2="34" y2="-34" stroke="var(--sun, #E3B060)" strokeWidth="2.5" strokeLinecap="round" />
          <line x1="40" y1="0" x2="48" y2="0" stroke="var(--sun, #E3B060)" strokeWidth="2.5" strokeLinecap="round" />
          <line x1="28" y1="28" x2="34" y2="34" stroke="var(--sun, #E3B060)" strokeWidth="2.5" strokeLinecap="round" />
          <line x1="-28" y1="-28" x2="-34" y2="-34" stroke="var(--sun, #E3B060)" strokeWidth="2.5" strokeLinecap="round" />
        </g>

        {/* Left phone: Offline */}
        <g transform="translate(70, 110) rotate(-4)">
          <rect x="0" y="0" width="60" height="106" rx="10" fill="#16130F" stroke="#16130F" strokeWidth="2" />
          <rect x="3" y="3" width="54" height="100" rx="8" fill="#FAF7F0" />
          {/* Signal bars with red slash */}
          <rect x="16" y="28" width="5" height="12" fill="#D0C9BE" rx="1" />
          <rect x="24" y="22" width="5" height="18" fill="#D0C9BE" rx="1" />
          <rect x="32" y="16" width="5" height="24" fill="#D0C9BE" rx="1" />
          <rect x="40" y="10" width="5" height="30" fill="#D0C9BE" rx="1" />
          <line x1="12" y1="42" x2="48" y2="8" stroke="#D32F2F" strokeWidth="3" strokeLinecap="round" />
        </g>

        {/* Left card: "On this phone" badge */}
        <g transform="translate(85, 150)">
          <rect x="0" y="0" width="80" height="42" rx="8" fill="#FFFFFF" filter="drop-shadow(0 4px 10px rgba(0,0,0,0.08))" />
          <line x1="10" y1="12" x2="60" y2="12" stroke="#D0C9BE" strokeWidth="3" strokeLinecap="round" />
          <line x1="10" y1="18" x2="45" y2="18" stroke="#D0C9BE" strokeWidth="3" strokeLinecap="round" />
          <circle cx="16" cy="30" r="5" stroke="#757575" strokeWidth="1.5" fill="none" />
          <text x="26" y="33" fontSize="8" fontWeight="600" fill="#757575" fontFamily="sans-serif">On this phone</text>
        </g>

        {/* Curved dashed arc linking left phone to right phone */}
        <path
          d="M130 135 C170 80 200 80 235 110"
          stroke="#8C8476"
          strokeWidth="2"
          strokeDasharray="4 4"
          fill="none"
          className={styles.dashedArc}
        />

        {/* Traveling report card under the sun */}
        <g transform="translate(170, 75) rotate(10)" className={styles.flyingTicket}>
          <rect x="0" y="0" width="56" height="46" rx="6" fill="#FFFFFF" filter="drop-shadow(0 4px 12px rgba(0,0,0,0.12))" />
          <line x1="8" y1="10" x2="42" y2="10" stroke="#D0C9BE" strokeWidth="2.5" strokeLinecap="round" />
          <line x1="8" y1="16" x2="30" y2="16" stroke="#D0C9BE" strokeWidth="2.5" strokeLinecap="round" />
          <circle cx="14" cy="30" r="6" fill="#2E7D32" />
          <path d="M11.5 30 L13.5 32 L16.5 28" stroke="#FFFFFF" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round" fill="none" />
          <text x="23" y="33" fontSize="7.5" fontWeight="700" fill="#2E7D32" fontFamily="sans-serif">Received</text>
        </g>

        {/* Right phone: Online with signal */}
        <g transform="translate(215, 120) rotate(2)">
          <rect x="0" y="0" width="60" height="106" rx="10" fill="#16130F" stroke="#16130F" strokeWidth="2" />
          <rect x="3" y="3" width="54" height="100" rx="8" fill="#FAF7F0" />
          {/* Signal bars green / full */}
          <rect x="16" y="28" width="5" height="12" fill="#16130F" rx="1" />
          <rect x="24" y="22" width="5" height="18" fill="#16130F" rx="1" />
          <rect x="32" y="16" width="5" height="24" fill="#16130F" rx="1" />
          <rect x="40" y="10" width="5" height="30" fill="#16130F" rx="1" />
        </g>
      </svg>
    </div>
  );
}
