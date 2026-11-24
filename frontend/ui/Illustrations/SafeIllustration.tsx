"use client";

import styles from "./Illustrations.module.css";

export function SafeIllustration() {
  return (
    <div className={styles.illustrationWrapper} aria-hidden="true">
      <svg
        viewBox="0 0 340 280"
        fill="none"
        xmlns="http://www.w3.org/2000/svg"
        className={styles.svgSafe}
      >
        <defs>
          <filter id="badgeShadow" x="-20%" y="-20%" width="140%" height="140%">
            <feDropShadow dx="0" dy="3" stdDeviation="3" floodColor="#000000" floodOpacity="0.15" />
          </filter>
          <filter id="phoneShadow" x="-20%" y="-10%" width="140%" height="130%">
            <feDropShadow dx="0" dy="8" stdDeviation="10" floodColor="#000000" floodOpacity="0.18" />
          </filter>
        </defs>

        {/* --- Warm concentric sun discs in background --- */}
        <circle cx="170" cy="115" r="95" fill="var(--sun-ring-4, rgba(246, 227, 184, 0.45))" />
        <circle cx="170" cy="115" r="76" fill="var(--sun-ring-3, #F6E3B8)" opacity="0.65" />
        <circle cx="170" cy="115" r="54" fill="var(--sun, #E3B060)" opacity="0.85" />

        {/* --- Natural arm and wrist coming from bottom-center/right --- */}
        {/* Forearm & wrist */}
        <path
          d="M135 280 C138 250 142 225 152 205 C158 193 166 186 178 184 L204 186 C214 192 218 206 220 225 C222 250 225 280 225 280 Z"
          fill="var(--paper-3, #EAE4D7)"
        />
        {/* Palm base supporting phone */}
        <path
          d="M148 206 C144 196 142 182 145 168 C147 158 152 152 158 150 L202 150 C210 152 216 160 216 172 C216 186 212 198 206 208 Z"
          fill="var(--paper-2, #F3EFE6)"
        />

        {/* --- Phone with subtle drop shadow --- */}
        <g filter="url(#phoneShadow)">
          {/* Phone chassis */}
          <rect
            x="116"
            y="36"
            width="108"
            height="182"
            rx="18"
            fill="var(--ink, #16130F)"
            stroke="var(--rule-control, #4A453E)"
            strokeWidth="1.5"
          />
          {/* Screen inner bezel */}
          <rect
            x="121"
            y="41"
            width="98"
            height="172"
            rx="14"
            fill="var(--paper, #FAF7F0)"
          />
          {/* Phone speaker ear-slit */}
          <rect x="156" y="47" width="28" height="3" rx="1.5" fill="var(--ink-3, #756F66)" />
        </g>

        {/* --- On-screen Polling Scene --- */}
        {/* Sky / ground horizon inside screen */}
        <path
          d="M121 146 Q170 142 219 146 L219 213 C219 213 216 213 205 213 L135 213 C124 213 121 213 121 213 Z"
          fill="var(--paper-2, #F3EFE6)"
        />

        {/* Polling tent / canopy canopy roof */}
        <path
          d="M130 92 L146 76 L194 76 L210 92 Z"
          fill="var(--paper-3, #EAE4D7)"
          stroke="var(--ink-2, #4A453E)"
          strokeWidth="1"
        />
        {/* Scalloped canopy edge */}
        <path
          d="M130 92 Q135 96 140 92 Q145 96 150 92 Q155 96 160 92 Q165 96 170 92 Q175 96 180 92 Q185 96 190 92 Q195 96 200 92 Q205 96 210 92 L210 90 L130 90 Z"
          fill="var(--sun-light, #F6E3B8)"
        />
        {/* Canopy poles */}
        <line x1="133" y1="92" x2="133" y2="152" stroke="var(--ink-2, #4A453E)" strokeWidth="1.5" />
        <line x1="207" y1="92" x2="207" y2="152" stroke="var(--ink-2, #4A453E)" strokeWidth="1.5" />

        {/* Polling official desk & ballot box */}
        <rect x="155" y="128" width="42" height="24" rx="2" fill="var(--paper-3, #EAE4D7)" stroke="var(--ink-2, #4A453E)" strokeWidth="1" />
        {/* Ballot box on table */}
        <rect x="168" y="116" width="16" height="13" rx="1.5" fill="var(--paper-card, #FFFFFF)" stroke="var(--ink-2, #4A453E)" strokeWidth="1" />
        <rect x="172" y="113" width="8" height="3" rx="0.5" fill="var(--ink-2, #4A453E)" />
        <line x1="176" y1="117" x2="176" y2="120" stroke="var(--ink, #16130F)" strokeWidth="1" />

        {/* Figure 1: Voter in queue */}
        {/* Body silhouette */}
        <path
          d="M138 122 C138 114 144 110 150 110 C156 110 162 114 162 122 L162 152 L138 152 Z"
          fill="var(--ink-2, #4A453E)"
        />
        {/* Neck */}
        <rect x="148" y="105" width="4" height="6" fill="var(--ink-3, #756F66)" />
        {/* Head with softly pixelated / blurred face */}
        <circle cx="150" cy="99" r="8" fill="var(--paper-3, #EAE4D7)" />
        <g transform="translate(144, 93)">
          <rect x="0" y="0" width="4" height="4" fill="var(--sun, #E3B060)" opacity="0.9" />
          <rect x="4" y="0" width="4" height="4" fill="var(--sun-ring-2, #B58943)" opacity="0.8" />
          <rect x="8" y="0" width="4" height="4" fill="var(--sun-light, #F6E3B8)" opacity="0.9" />
          <rect x="0" y="4" width="4" height="4" fill="var(--sun-ring-3, #6B5329)" opacity="0.75" />
          <rect x="4" y="4" width="4" height="4" fill="var(--sun, #E3B060)" opacity="0.95" />
          <rect x="8" y="4" width="4" height="4" fill="var(--sun-ring-2, #B58943)" opacity="0.8" />
          <rect x="0" y="8" width="4" height="4" fill="var(--sun-light, #F6E3B8)" opacity="0.8" />
          <rect x="4" y="8" width="4" height="4" fill="var(--sun-ring-2, #B58943)" opacity="0.85" />
          <rect x="8" y="8" width="4" height="4" fill="var(--sun, #E3B060)" opacity="0.9" />
        </g>

        {/* Figure 2: Polling official seated behind desk */}
        <path
          d="M180 120 C180 114 185 110 191 110 C197 110 202 114 202 120 L202 140 L180 140 Z"
          fill="var(--ink-3, #756F66)"
        />
        {/* Head with pixelated face */}
        <circle cx="191" cy="101" r="7.5" fill="var(--paper-3, #EAE4D7)" />
        <g transform="translate(186, 96)">
          <rect x="0" y="0" width="3.5" height="3.5" fill="var(--sun-ring-2, #B58943)" opacity="0.8" />
          <rect x="3.5" y="0" width="3.5" height="3.5" fill="var(--sun, #E3B060)" opacity="0.9" />
          <rect x="7" y="0" width="3.5" height="3.5" fill="var(--sun-light, #F6E3B8)" opacity="0.8" />
          <rect x="0" y="3.5" width="3.5" height="3.5" fill="var(--sun, #E3B060)" opacity="0.95" />
          <rect x="3.5" y="3.5" width="3.5" height="3.5" fill="var(--sun-ring-3, #6B5329)" opacity="0.7" />
          <rect x="7" y="3.5" width="3.5" height="3.5" fill="var(--sun, #E3B060)" opacity="0.9" />
          <rect x="0" y="7" width="3.5" height="3.5" fill="var(--sun-light, #F6E3B8)" opacity="0.85" />
          <rect x="3.5" y="7" width="3.5" height="3.5" fill="var(--sun-ring-2, #B58943)" opacity="0.85" />
          <rect x="7" y="7" width="3.5" height="3.5" fill="var(--sun, #E3B060)" opacity="0.9" />
        </g>

        {/* --- Fingers holding the sides of the phone --- */}
        {/* Left hand fingers wrapping around phone left edge */}
        <g fill="var(--paper-2, #F3EFE6)" stroke="var(--ink-2, #4A453E)" strokeWidth="1.2">
          {/* Index finger */}
          <rect x="108" y="92" width="14" height="12" rx="6" />
          {/* Middle finger */}
          <rect x="106" y="108" width="16" height="13" rx="6.5" />
          {/* Ring finger */}
          <rect x="107" y="125" width="15" height="12" rx="6" />
          {/* Little finger */}
          <rect x="110" y="141" width="12" height="11" rx="5.5" />
        </g>
        {/* Right thumb wrapping gently over lower right bezel */}
        <path
          d="M220 152 C226 156 228 166 224 174 C220 182 210 184 200 180 C194 177 194 170 198 166 C204 160 214 150 220 152 Z"
          fill="var(--paper-2, #F3EFE6)"
          stroke="var(--ink-2, #4A453E)"
          strokeWidth="1.2"
        />

        {/* --- Floating Badges with Drop Shadows --- */}
        {/* Badge 1: Crossed-out Location Pin */}
        <g transform="translate(104, 166)" filter="url(#badgeShadow)">
          <circle cx="20" cy="20" r="20" fill="var(--paper-card, #FFFFFF)" stroke="var(--rule, #E8E3D8)" strokeWidth="1.5" />
          {/* Location Pin Shape */}
          <path
            d="M20 10 C15.5 10 12 13.5 12 18 C12 23.5 20 29.5 20 29.5 C20 29.5 28 23.5 28 18 C28 13.5 24.5 10 20 10 Z"
            fill="var(--paper-2, #F3EFE6)"
            stroke="var(--ink, #16130F)"
            strokeWidth="1.75"
          />
          <circle cx="20" cy="17.5" r="3" fill="var(--ink, #16130F)" />
          {/* Red diagonal strike-through */}
          <line x1="10" y1="30" x2="30" y2="10" stroke="var(--danger, #EF5350)" strokeWidth="3" strokeLinecap="round" />
        </g>

        {/* Badge 2: Closed Eye (Privacy Protection) */}
        <g transform="translate(196, 166)" filter="url(#badgeShadow)">
          <circle cx="20" cy="20" r="20" fill="var(--paper-card, #FFFFFF)" stroke="var(--rule, #E8E3D8)" strokeWidth="1.5" />
          {/* Closed eye curve */}
          <path
            d="M11 18 C15 23 25 23 29 18"
            stroke="var(--ink, #16130F)"
            strokeWidth="2.25"
            strokeLinecap="round"
            fill="none"
          />
          {/* Eyelashes */}
          <line x1="13" y1="21" x2="11" y2="24.5" stroke="var(--ink, #16130F)" strokeWidth="2" strokeLinecap="round" />
          <line x1="17.5" y1="22.5" x2="16.5" y2="26.5" stroke="var(--ink, #16130F)" strokeWidth="2" strokeLinecap="round" />
          <line x1="22.5" y1="22.5" x2="23.5" y2="26.5" stroke="var(--ink, #16130F)" strokeWidth="2" strokeLinecap="round" />
          <line x1="27" y1="21" x2="29" y2="24.5" stroke="var(--ink, #16130F)" strokeWidth="2" strokeLinecap="round" />
        </g>
      </svg>
    </div>
  );
}
