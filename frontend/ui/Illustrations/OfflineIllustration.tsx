"use client";

import { useT } from "../../lib/i18n/client";
import styles from "./Illustrations.module.css";

export function OfflineIllustration() {
  const t = useT();
  const onPhoneLabel = t("status.onPhone");
  const receivedLabel = t("status.received");

  return (
    <div className={styles.illustrationWrapper} aria-hidden="true">
      <svg
        viewBox="0 0 340 240"
        fill="none"
        xmlns="http://www.w3.org/2000/svg"
        className={styles.svgOffline}
      >
        <defs>
          <filter id="offlineShadow" x="-20%" y="-15%" width="140%" height="135%">
            <feDropShadow dx="0" dy="4" stdDeviation="5" floodColor="#000000" floodOpacity="0.12" />
          </filter>
          <filter id="cardShadow" x="-20%" y="-20%" width="140%" height="145%">
            <feDropShadow dx="0" dy="3" stdDeviation="4" floodColor="#000000" floodOpacity="0.14" />
          </filter>
        </defs>

        {/* --- Soft rolling ground silhouettes --- */}
        <path
          d="M0 205 Q90 178 180 196 T340 185 L340 240 L0 240 Z"
          fill="var(--paper-2, #F3EFE6)"
        />
        <path
          d="M0 220 Q120 200 240 216 T340 210 L340 240 L0 240 Z"
          fill="var(--paper-3, #EAE4D7)"
        />

        {/* Grass accents */}
        <g stroke="var(--rule-control, #8C8476)" strokeWidth="1.2" strokeLinecap="round" opacity="0.6">
          <line x1="36" y1="218" x2="33" y2="210" />
          <line x1="39" y1="219" x2="43" y2="209" />
          <line x1="150" y1="226" x2="148" y2="218" />
          <line x1="153" y1="227" x2="157" y2="217" />
          <line x1="305" y1="212" x2="302" y2="204" />
          <line x1="308" y1="213" x2="313" y2="203" />
        </g>

        {/* --- Warm sun top-right with concentric circles & rays --- */}
        <g transform="translate(268, 52)">
          <circle cx="0" cy="0" r="42" fill="var(--sun-ring-4, rgba(246, 227, 184, 0.45))" />
          <circle cx="0" cy="0" r="30" fill="var(--sun-ring-3, #F6E3B8)" opacity="0.65" />
          <circle cx="0" cy="0" r="20" fill="var(--sun, #E3B060)" />
          {/* Subtle sun rays */}
          <line x1="0" y1="-26" x2="0" y2="-32" stroke="var(--sun, #E3B060)" strokeWidth="2" strokeLinecap="round" />
          <line x1="18" y1="-18" x2="23" y2="-23" stroke="var(--sun, #E3B060)" strokeWidth="2" strokeLinecap="round" />
          <line x1="26" y1="0" x2="32" y2="0" stroke="var(--sun, #E3B060)" strokeWidth="2" strokeLinecap="round" />
          <line x1="18" y1="18" x2="23" y2="23" stroke="var(--sun, #E3B060)" strokeWidth="2" strokeLinecap="round" />
          <line x1="-18" y1="-18" x2="-23" y2="-23" stroke="var(--sun, #E3B060)" strokeWidth="2" strokeLinecap="round" />
        </g>

        {/* --- Left Phone: No network (Offline) --- */}
        <g transform="translate(52, 94) rotate(-5)" filter="url(#offlineShadow)">
          {/* Phone chassis */}
          <rect x="0" y="0" width="68" height="116" rx="13" fill="var(--ink, #16130F)" stroke="var(--rule-control, #4A453E)" strokeWidth="1.2" />
          {/* Screen */}
          <rect x="4" y="4" width="60" height="108" rx="10" fill="var(--paper, #FAF7F0)" />
          <rect x="25" y="8" width="18" height="2.5" rx="1.2" fill="var(--ink-3, #756F66)" />

          {/* Signal bars with red slash (No Signal) */}
          <g transform="translate(20, 24)">
            <rect x="0" y="18" width="4.5" height="10" fill="var(--rule-control, #8C8476)" rx="1" />
            <rect x="7.5" y="13" width="4.5" height="15" fill="var(--rule-control, #8C8476)" rx="1" />
            <rect x="15" y="8" width="4.5" height="20" fill="var(--rule-control, #8C8476)" rx="1" />
            <rect x="22.5" y="3" width="4.5" height="25" fill="var(--rule-control, #8C8476)" rx="1" />
            {/* Red strike through */}
            <line x1="-3" y1="30" x2="30" y2="1" stroke="var(--danger, #EF5350)" strokeWidth="2.5" strokeLinecap="round" />
          </g>

          {/* Miniature report note on phone screen */}
          <g transform="translate(10, 68)">
            <rect x="0" y="0" width="48" height="34" rx="4" fill="var(--paper-2, #F3EFE6)" />
            <line x1="6" y1="9" x2="34" y2="9" stroke="var(--ink-3, #756F66)" strokeWidth="2" strokeLinecap="round" />
            <line x1="6" y1="16" x2="24" y2="16" stroke="var(--ink-3, #756F66)" strokeWidth="2" strokeLinecap="round" />
            <circle cx="10" cy="25" r="3" stroke="var(--wait, #756F66)" strokeWidth="1.5" fill="none" />
            <line x1="16" y1="25" x2="40" y2="25" stroke="var(--rule-control, #8C8476)" strokeWidth="1.5" strokeLinecap="round" />
          </g>
        </g>

        {/* --- Card 1 beside left phone: "On this phone" badge --- */}
        <g transform="translate(68, 154)" filter="url(#cardShadow)">
          <rect x="0" y="0" width="102" height="42" rx="8" fill="var(--paper-card, #FFFFFF)" stroke="var(--rule, #E8E3D8)" strokeWidth="1" />
          <line x1="12" y1="12" x2="72" y2="12" stroke="var(--rule, #E8E3D8)" strokeWidth="2.5" strokeLinecap="round" />
          <line x1="12" y1="18" x2="52" y2="18" stroke="var(--rule, #E8E3D8)" strokeWidth="2.5" strokeLinecap="round" />
          {/* Hollow status circle */}
          <circle cx="19" cy="29" r="5" stroke="var(--wait, #756F66)" strokeWidth="2" fill="none" />
          {/* Translated label */}
          <text
            x="30"
            y="32"
            fill="var(--ink-2, #4A453E)"
            fontFamily="var(--font-body, 'Noto Sans', sans-serif)"
            fontSize="8.5"
            fontWeight="600"
          >
            {onPhoneLabel}
          </text>
        </g>

        {/* --- Dotted arc carrying the card to the right phone --- */}
        <path
          d="M125 132 C165 72 195 72 232 108"
          stroke="var(--rule-control, #8C8476)"
          strokeWidth="2"
          strokeDasharray="4 4"
          fill="none"
          className={styles.dashedArc}
        />

        {/* --- Traveling card along the arc (flying to the right) --- */}
        <g transform="translate(162, 72) rotate(10)" className={styles.flyingTicket} filter="url(#cardShadow)">
          <rect x="0" y="0" width="84" height="42" rx="7" fill="var(--paper-card, #FFFFFF)" stroke="var(--rule, #E8E3D8)" strokeWidth="1" />
          <line x1="10" y1="11" x2="60" y2="11" stroke="var(--rule, #E8E3D8)" strokeWidth="2.5" strokeLinecap="round" />
          <line x1="10" y1="17" x2="42" y2="17" stroke="var(--rule, #E8E3D8)" strokeWidth="2.5" strokeLinecap="round" />
          {/* Green tick circle */}
          <circle cx="18" cy="29" r="6" fill="var(--ok, #2E7D32)" />
          <path d="M15 29 L17.5 31.5 L21 26.5" stroke="#FFFFFF" strokeWidth="1.6" strokeLinecap="round" strokeLinejoin="round" fill="none" />
          {/* Translated label */}
          <text
            x="29"
            y="32"
            fill="var(--ok, #2E7D32)"
            fontFamily="var(--font-body, 'Noto Sans', sans-serif)"
            fontSize="8.5"
            fontWeight="700"
          >
            {receivedLabel}
          </text>
        </g>

        {/* --- Right Phone: Online with full signal --- */}
        <g transform="translate(228, 98) rotate(3)" filter="url(#offlineShadow)">
          {/* Phone chassis */}
          <rect x="0" y="0" width="68" height="116" rx="13" fill="var(--ink, #16130F)" stroke="var(--rule-control, #4A453E)" strokeWidth="1.2" />
          {/* Screen */}
          <rect x="4" y="4" width="60" height="108" rx="10" fill="var(--paper, #FAF7F0)" />
          <rect x="25" y="8" width="18" height="2.5" rx="1.2" fill="var(--ink-3, #756F66)" />

          {/* Full signal bars (green / active) */}
          <g transform="translate(20, 24)">
            <rect x="0" y="18" width="4.5" height="10" fill="var(--ok, #2E7D32)" rx="1" />
            <rect x="7.5" y="13" width="4.5" height="15" fill="var(--ok, #2E7D32)" rx="1" />
            <rect x="15" y="8" width="4.5" height="20" fill="var(--ok, #2E7D32)" rx="1" />
            <rect x="22.5" y="3" width="4.5" height="25" fill="var(--ok, #2E7D32)" rx="1" />
          </g>

          {/* Received confirmation badge on screen */}
          <g transform="translate(10, 68)">
            <rect x="0" y="0" width="48" height="34" rx="4" fill="var(--ok-bg, #1B3320)" />
            <circle cx="24" cy="14" r="7" fill="var(--ok, #2E7D32)" />
            <path d="M21 14 L23 16 L27 12" stroke="#FFFFFF" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round" fill="none" />
            <rect x="12" y="24" width="24" height="3" rx="1.5" fill="var(--ok, #2E7D32)" />
          </g>
        </g>
      </svg>
    </div>
  );
}
