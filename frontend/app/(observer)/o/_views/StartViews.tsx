"use client";
import { BackgroundArt } from "../../../../ui/BackgroundArt/BackgroundArt";

/* O-01 Language · O-02 What this app keeps · O-03 Who are you / Sign in / Choose your PIN / Code revoked */

import { useRef, useState, type ReactNode } from "react";
import { localeNames, locales, localeTags, type Locale } from "../../../../lib/i18n/config";
import { useLocale, useT } from "../../../../lib/i18n/client";
import { AppShell, Banner, Button, Field, Sheet } from "../../../../ui";
import { haptic, prefersReducedMotion } from "../../../../ui/motion";
import { BrandMark } from "../../../../ui/BrandMark/BrandMark";
import { formatWatTime } from "../../../../ui/format";
import {
  AlertIcon,
  ArrowLeftIcon,
  CheckIcon,
  ChevronRightIcon,
  EyeIcon,
  LockIcon,
  MicIcon,
  PhoneIcon,
  PlaceIcon,
  ShieldCheckIcon,
} from "../../../../ui/icons";
import { pinTooSimple } from "../_lib/codes";
import { AppBarTitle } from "../_components/AppBarTitle";
import { BadgePictogram, PersonPictogram } from "../_components/pictograms";
import styles from "../_components/observer.module.css";

type Shell = { offline?: boolean; banner?: ReactNode };

/* ---------- O-01 ---------- */

export type LanguageViewProps = Shell & {
  /** The stored language, or null on first open (no tile selected). */
  selected: Locale | null;
  onChoose: (locale: Locale) => void;
};

export function LanguageView({ selected, onChoose, offline, banner }: LanguageViewProps) {
  const t = useT();
  // The row just tapped: its sunlight sweep and check play before the flow moves on (spec I-3).
  const [pending, setPending] = useState<Locale | null>(null);
  const current = pending ?? selected;

  function choose(code: Locale) {
    if (pending) return;
    setPending(code);
    haptic(8);
    window.setTimeout(() => onChoose(code), prefersReducedMotion() ? 0 : 280);
  }

  return (
    <AppShell title={<AppBarTitle />} hideBack offline={offline} banner={banner} data-testid="o01">
      <BackgroundArt variant="hero" />
      <div className={styles.screen}>
        <h1 className={styles.title} id="o01-title" lang="en">
          {t("o01.title")}
        </h1>
        <p className={styles.lead}>{t("o01.hint")}</p>
        <div className={styles.languages} role="radiogroup" aria-labelledby="o01-title">
          {locales.map((code) => {
            const on = current === code;
            return (
              <button
                key={code}
                type="button"
                role="radio"
                aria-checked={on}
                lang={localeTags[code]}
                className={styles.language}
                data-swept={pending === code || undefined}
                onClick={() => choose(code)}
                data-testid={`o01-${code}`}
              >
                {on ? <span className={styles.languageSweep} aria-hidden="true" /> : null}
                <span className={styles.languageDisc} aria-hidden="true">
                  {LANGUAGE_SHORT[code]}
                </span>
                <span className={styles.languageName}>{localeNames[code]}</span>
                {on ? (
                  <span className={styles.languageTick} aria-hidden="true">
                    <CheckIcon size={16} strokeWidth={2.5} />
                  </span>
                ) : (
                  <ChevronRightIcon className={styles.languageChevron} aria-hidden="true" />
                )}
              </button>
            );
          })}
        </div>
        <p className={styles.credit}>
          <BrandMark variant="lockup" size="md" credit />
        </p>
      </div>
    </AppShell>
  );
}

/** Short codes for the language discs, written as speakers abbreviate them. */
const LANGUAGE_SHORT: Record<Locale, string> = { en: "EN", pcm: "NJ", ha: "HA", yo: "YO", ig: "IG" };

/* ---------- Welcome (spec screens 3 to 5) ---------- */

export type WelcomeViewProps = Shell & {
  onBack: () => void;
  onNext: () => void;
  /** Skip goes to the privacy page, never past it (spec D1). */
  onSkip: () => void;
};

/**
 * Welcome page 1 of 3: what the app is for, in one sentence. Page 2 is "What this app
 * keeps" (O-02) and page 3 is "Works without network". Swipe left or tap Next.
 */
export function WelcomeView({ onBack, onNext, onSkip, offline, banner }: WelcomeViewProps) {
  const t = useT();
  const start = useRef<{ x: number; y: number } | null>(null);
  return (
    <AppShell
      title={<AppBarTitle />}
      onBack={onBack}
      offline={offline}
      banner={banner}
      actions={<WelcomeBar page={1} onNext={onNext} onSkip={onSkip} />}
      data-testid="ob1"
    >
      <div
        className={styles.welcome}
        onPointerDown={(event) => {
          start.current = { x: event.clientX, y: event.clientY };
        }}
        onPointerUp={(event) => {
          const from = start.current;
          start.current = null;
          if (!from) return;
          const dx = event.clientX - from.x;
          // A deliberate left swipe (and not a vertical scroll) turns the page (spec I-2).
          if (dx < -60 && Math.abs(dx) > Math.abs(event.clientY - from.y)) onNext();
        }}
      >
        <BackgroundArt variant="hero" />
        <div className={styles.screen}>
          <h1 className={styles.welcomeTitle}>{t("ob.title1")}</h1>
          <p className={styles.lead}>{t("ob.body1")}</p>
        </div>
      </div>
    </AppShell>
  );
}

/** Welcome page 3 of 3: reports wait on the phone and send themselves (spec screen 5). */
export function OfflineWelcomeView({ onBack, onContinue, offline, banner }: Shell & { onBack: () => void; onContinue: () => void }) {
  const t = useT();
  return (
    <AppShell
      title={<AppBarTitle />}
      onBack={onBack}
      offline={offline}
      banner={banner}
      actions={<WelcomeBar page={3} onNext={onContinue} nextLabel={t("common.continue")} />}
      data-testid="ob3"
    >
      <div className={`${styles.screen} ${styles.centredPage}`}>
        <OfflineArt />
        <h1 className={styles.welcomeTitle}>{t("ob.title3")}</h1>
        <p className={styles.lead}>{t("ob.body3")}</p>
      </div>
    </AppShell>
  );
}

/**
 * Stand-in for art plate E (spec B6): a phone with three paper envelopes waiting beside it
 * and the sun rising behind. Replaced by the hand-drawn plate when it arrives.
 */
function OfflineArt() {
  return (
    <svg className={styles.safeArt} viewBox="0 0 320 168" aria-hidden="true" focusable="false">
      <circle cx="160" cy="96" r="72" fill="var(--sun-wash)" />
      <circle cx="160" cy="96" r="44" fill="var(--sun)" />
      <path d="M0 150 Q100 138 170 144 T320 140 V168 H0Z" fill="var(--art-ground)" />
      <g transform="translate(100 52)">
        <rect width="62" height="102" rx="10" fill="var(--fixed-ink)" />
        <rect x="6" y="9" width="50" height="78" rx="4" fill="var(--paper-raised)" />
        <path d="M14 30 H48 M14 40 H42 M14 50 H46" stroke="var(--art-line)" strokeWidth="3" strokeLinecap="round" />
        <circle cx="31" cy="94" r="3" fill="var(--paper-raised)" />
      </g>
      <g fill="var(--paper-raised)" stroke="var(--art-line)" strokeWidth="1.4" strokeLinejoin="round">
        <rect x="178" y="124" width="52" height="32" rx="3" />
        <rect x="186" y="110" width="52" height="32" rx="3" />
        <rect x="194" y="96" width="52" height="32" rx="3" />
      </g>
      <path d="M194 98 L220 116 L246 98" fill="none" stroke="var(--art-line)" strokeWidth="1.4" strokeLinejoin="round" />
    </svg>
  );
}

/** Page dots, Skip and Next: the welcome pages' action bar. */
export function WelcomeBar({ page, onNext, onSkip, nextLabel, nextTestId }: { page: 1 | 2 | 3; onNext: () => void; onSkip?: () => void; nextLabel?: string; nextTestId?: string }) {
  const t = useT();
  return (
    <div className={styles.welcomeBar}>
      <span className={styles.welcomeDots} role="img" aria-label={t("ob.progress", { current: page, total: 3 })}>
        {[1, 2, 3].map((n) => (
          <i key={n} data-on={n === page || undefined} />
        ))}
      </span>
      {onSkip ? (
        <Button variant="quiet" onClick={onSkip} data-testid={`ob${page}-skip`}>
          {t("ob.skip")}
        </Button>
      ) : null}
      <Button onClick={onNext} data-testid={nextTestId ?? `ob${page}-next`}>
        {nextLabel ?? t("ob.next")}
      </Button>
    </div>
  );
}

/* ---------- O-02 ---------- */

export type NoticeViewProps = Shell & {
  onBack: () => void;
  onContinue: () => void;
  /** From Settings: read only, no Continue. */
  readOnly?: boolean;
};

export function NoticeView({ onBack, onContinue, readOnly, offline, banner }: NoticeViewProps) {
  const t = useT();
  const lines: Array<{ key: string; icon: ReactNode; safety?: boolean }> = [
    { key: "o02.line1", icon: <ShieldCheckIcon size={20} /> },
    { key: "o02.line2", icon: <PlaceIcon size={20} /> },
    { key: "o02.line3", icon: <ArrowLeftIcon size={20} /> },
    { key: "o02.line5", icon: <MicIcon size={20} /> },
    { key: "o02.line4", icon: <PhoneIcon size={20} />, safety: true },
  ];
  return (
    <AppShell
      title={<AppBarTitle />}
      onBack={onBack}
      offline={offline}
      banner={banner}
      actions={
        readOnly ? undefined : (
          // Welcome page 2 of 3 (spec screen 4). Everyone sees it once: there is no Skip here.
          <WelcomeBar page={2} onNext={onContinue} nextLabel={t("o02.continue")} nextTestId="o02-continue" />
        )
      }
      data-testid="o02"
    >
      <div className={styles.screen}>
        <SafeArt />
        <h1 className={styles.welcomeTitle}>{t("o02.title")}</h1>
        <ul className={styles.keeps}>
          {lines.map((line) => (
            <li key={line.key} className={styles.keep} data-safety={line.safety || undefined}>
              <span className={styles.keepDisc} aria-hidden="true">
                {line.icon}
              </span>
              <span>{t(line.key)}</span>
            </li>
          ))}
        </ul>
        <a className={styles.quietLink} href="/privacy">
          {t("o02.privacyLink")}
        </a>
      </div>
    </AppShell>
  );
}

/**
 * Stand-in for art plate D (spec B6): a phone showing a photo whose faces are blurred,
 * a soft shield behind it, and the sun. Replaced by the hand-drawn plate when it arrives.
 */
function SafeArt() {
  return (
    <svg className={styles.safeArt} viewBox="0 0 320 168" aria-hidden="true" focusable="false">
      <defs>
        <filter id="safe-blur" x="-50%" y="-50%" width="200%" height="200%">
          <feGaussianBlur stdDeviation="3.2" />
        </filter>
      </defs>
      <circle cx="232" cy="52" r="34" fill="var(--sun-wash)" />
      <circle cx="232" cy="52" r="20" fill="var(--sun)" />
      <path d="M0 150 Q100 138 170 144 T320 140 V168 H0Z" fill="var(--art-ground)" />
      <path
        d="M160 18 L214 36 V84 C214 116 192 136 160 148 C128 136 106 116 106 84 V36 Z"
        fill="var(--sun-tint)"
        stroke="var(--art-line)"
        strokeWidth="1.4"
        strokeLinejoin="round"
      />
      <g transform="translate(126 40)">
        <rect width="68" height="112" rx="11" fill="var(--fixed-ink)" />
        <rect x="6" y="10" width="56" height="86" rx="4" fill="var(--paper-raised)" />
        <rect x="6" y="64" width="56" height="32" fill="var(--art-ground)" />
        <g filter="url(#safe-blur)">
          <circle cx="20" cy="50" r="7" fill="var(--art-line)" />
          <circle cx="40" cy="46" r="7" fill="var(--art-line)" />
        </g>
        <path d="M12 96 V68 Q20 60 28 68 V96Z M32 96 V64 Q40 56 48 64 V96Z" fill="var(--art-line)" opacity="0.75" />
        <circle cx="34" cy="104" r="3" fill="var(--paper-raised)" />
      </g>
    </svg>
  );
}


/* ---------- O-03 choose ---------- */

export type ChooseViewProps = Shell & {
  onBack: () => void;
  onObserver: () => void;
  onCitizen: () => void;
  onCheckStatus: () => void;
};

export function ChooseView({ onBack, onObserver, onCitizen, onCheckStatus, offline, banner }: ChooseViewProps) {
  const t = useT();
  return (
    <AppShell title={<AppBarTitle />} onBack={onBack} offline={offline} banner={banner} data-testid="o03-choose">
      <BackgroundArt variant="hero" />
      <div className={`${styles.screen} ${styles.wide}`}>
        <h1 className={styles.title}>{t("o03.title")}</h1>
        <div className={styles.choices}>
          <button type="button" className={styles.choice} onClick={onObserver} data-testid="o03-observer">
            <span className={styles.choiceDisc} aria-hidden="true">
              <BadgePictogram size={32} />
            </span>
            <span className={styles.choiceText}>
              <span className={styles.choiceLabel}>{t("o03.observer")}</span>
              <span className={styles.choiceHint}>{t("o03.observerHint")}</span>
            </span>
            <ChevronRightIcon aria-hidden="true" />
          </button>
          <button type="button" className={styles.choice} onClick={onCitizen} data-testid="o03-citizen">
            <span className={styles.choiceDisc} aria-hidden="true">
              <PersonPictogram size={32} />
            </span>
            <span className={styles.choiceText}>
              <span className={styles.choiceLabel}>{t("o03.citizen")}</span>
              <span className={styles.choiceHint}>{t("o03.citizenHint")}</span>
            </span>
            <ChevronRightIcon aria-hidden="true" />
          </button>
        </div>
        <Button variant="quiet" className={styles.link} onClick={onCheckStatus} data-testid="o03-check-status">
          {t("o03.checkStatus")}
        </Button>
        <footer className={styles.chooseFooter}>
          <BrandMark variant="lockup" size="md" credit />
          <p>{t("pub.footer.nonpartisan")}</p>
        </footer>
      </div>
    </AppShell>
  );
}

/* ---------- O-03 sign in ---------- */

export type SignInError =
  | { field: "code"; key: "o03.signIn.codeEmpty" | "o03.signIn.codeFormat" | "o03.signIn.revoked" }
  | { field: "pin"; key: "o03.signIn.pinFormat" | "o03.signIn.wrong" }
  | { field: "form"; key: "o03.signIn.offline" | "common.error.server" | "common.error.sessionExpired" | "o03.signIn.lockedAdmin" }
  | { field: "form"; key: "common.error.tooManyTries"; minutes: number; /** When the lock ends (epoch ms, from Retry-After). */ until?: number };

export type SignInViewProps = Shell & {
  code: string;
  pin: string;
  onCode: (value: string) => void;
  onCodeBlur: () => void;
  onPin: (value: string) => void;
  onSubmit: () => void;
  onBack: () => void;
  sending: boolean;
  error: SignInError | null;
  /** Locked (too many tries): the button stays disabled. */
  locked?: boolean;
};

export function SignInView({ code, pin, onCode, onCodeBlur, onPin, onSubmit, onBack, sending, error, locked: lockedProp, offline, banner }: SignInViewProps) {
  const t = useT();
  const { locale } = useLocale();
  const [show, setShow] = useState(false);
  const locked = Boolean(lockedProp) || error?.key === "o03.signIn.lockedAdmin";
  const formError =
    error?.field === "form"
      ? error.key === "common.error.tooManyTries"
        ? error.until
          ? t("o03.signIn.lockedUntil", { time: formatWatTime(error.until, locale) })
          : t(error.key, { minutes: error.minutes })
        : t(error.key)
      : null;
  return (
    <AppShell
      title={<AppBarTitle />}
      onBack={onBack}
      offline={offline}
      banner={banner}
      actions={
        <>
          <p className={styles.formError} role="alert" aria-live="assertive" data-testid="o03-form-error">
            {formError ? (
              <>
                <AlertIcon aria-hidden="true" />
                <span>{formError}</span>
              </>
            ) : null}
          </p>
          <Button
            block
            type="submit"
            form="o03-sign-in"
            loading={sending}
            loadingLabel={t("o03.signIn.submitting")}
            disabled={locked}
            data-testid="o03-submit"
          >
            {t("o03.signIn.submit")}
          </Button>
        </>
      }
      data-testid="o03-sign-in"
    >
      <form
        id="o03-sign-in"
        className={styles.screen}
        noValidate
        onSubmit={(event) => {
          event.preventDefault();
          if (!sending && !locked) onSubmit();
        }}
      >
        <h1 className={styles.title}>{t("o03.signIn.title")}</h1>
        <ObserverCardArt />
        <Field
          className={styles.codeField}
          label={t("o03.signIn.codeLabel")}
          hint={t("o03.signIn.codeHint")}
          error={error?.field === "code" ? t(error.key) : undefined}
          value={code}
          onChange={(event) => onCode(event.target.value)}
          onBlur={onCodeBlur}
          autoCapitalize="characters"
          autoComplete="username"
          inputMode="text"
          spellCheck={false}
          readOnly={sending}
          numeric
          data-testid="o03-code"
        />
        <div className={`${styles.tight} ${styles.pin}`}>
          <Field
            label={t("o03.signIn.pinLabel")}
            hint={t("o03.signIn.pinHint")}
            error={error?.field === "pin" ? t(error.key) : undefined}
            value={pin}
            onChange={(event) => onPin(event.target.value.replace(/\D/g, "").slice(0, 8))}
            type={show ? "text" : "password"}
            inputMode="numeric"
            pattern="[0-9]*"
            maxLength={8}
            autoComplete="current-password"
            readOnly={sending}
            numeric
            data-testid="o03-pin"
          />
          <Button variant="quiet" className={styles.pinToggle} icon={<EyeIcon />} onClick={() => setShow(!show)} aria-pressed={show} data-testid="o03-show-pin">
            {show ? t("o03.signIn.hidePin") : t("o03.signIn.showPin")}
          </Button>
        </div>
        <p className={styles.noteCard}>
          <LockIcon />
          <span>{t("o03.signIn.forgot")}</span>
        </p>
      </form>
    </AppShell>
  );
}

/**
 * The observer card, drawn so people see where the code (top) and PIN (bottom) are
 * printed. Only the sample code and dots appear in it, so it needs no translation.
 */
function ObserverCardArt() {
  return (
    <svg className={styles.cardArt} viewBox="0 0 320 120" aria-hidden="true" focusable="false">
      <rect x="40" y="8" width="240" height="104" rx="12" fill="var(--paper-raised)" stroke="var(--rule-control)" />
      <rect x="40" y="8" width="240" height="22" rx="12" fill="var(--sun-tint)" />
      <rect x="40" y="20" width="240" height="10" fill="var(--sun-tint)" />
      <path
        fill="var(--ink)"
        transform="translate(52 12) scale(0.29)"
        d="M38 6A4 4 0 0 1 42 10V14H20A6 6 0 0 0 14 20H29V28H14A6 6 0 0 0 20 34H34V24H42V38A4 4 0 0 1 38 42H20A14 14 0 0 1 6 28V20A14 14 0 0 1 20 6Z"
      />
      <rect x="56" y="42" width="160" height="28" rx="6" fill="var(--sun-wash)" stroke="var(--sun-strong)" strokeDasharray="4 3" />
      <text x="66" y="62" fontFamily="var(--font-display)" fontWeight="800" fontSize="16" letterSpacing="1.5" fill="var(--ink)">
        OBS-7K2P9X
      </text>
      <rect x="56" y="78" width="120" height="24" rx="6" fill="var(--sun-wash)" stroke="var(--sun-strong)" strokeDasharray="4 3" />
      <text x="66" y="95" fontFamily="var(--font)" fontWeight="700" fontSize="14" letterSpacing="3" fill="var(--ink-2)">
        ••••••••
      </text>
      <circle cx="248" cy="78" r="18" fill="var(--paper-2)" stroke="var(--rule)" />
      <path d="M241 88 Q248 79 255 88 M248 76 a4 4 0 1 0 0.01 0" fill="none" stroke="var(--art-line)" strokeWidth="1.6" />
    </svg>
  );
}

/* ---------- O-03 set PIN ---------- */

export type SetPinViewProps = Shell & {
  first: string;
  second: string;
  onFirst: (value: string) => void;
  onSecond: (value: string) => void;
  onSubmit: () => void;
  onBack: () => void;
  sending: boolean;
  error: { field: "first" | "second" | "form"; key: string } | null;
};

export function SetPinView({ first, second, onFirst, onSecond, onSubmit, onBack, sending, error, offline, banner }: SetPinViewProps) {
  const t = useT();
  const [show, setShow] = useState(false);
  const digits = (value: string) => value.replace(/\D/g, "").slice(0, 6);
  // Live rules (spec screen 8): each ticks as it is met, before Save is tapped.
  const six = /^\d{6}$/.test(first);
  const rules = [
    { key: "o03.setPin.rules.six", ok: six },
    { key: "o03.setPin.rules.notSimple", ok: six && !pinTooSimple(first) },
    { key: "o03.setPin.rules.match", ok: six && second === first },
  ];
  return (
    <AppShell
      title={<AppBarTitle />}
      onBack={onBack}
      offline={offline}
      banner={banner}
      actions={
        <>
          <p className={styles.formError} role="alert" data-testid="o03-setpin-error">
            {error?.field === "form" ? (
              <>
                <AlertIcon aria-hidden="true" />
                <span>{t(error.key)}</span>
              </>
            ) : null}
          </p>
          <Button block type="submit" form="o03-set-pin" loading={sending} loadingLabel={t("o03.setPin.submitting")} data-testid="o03-setpin-submit">
            {t("o03.setPin.submit")}
          </Button>
        </>
      }
      data-testid="o03-set-pin"
    >
      <form
        id="o03-set-pin"
        className={styles.screen}
        noValidate
        onSubmit={(event) => {
          event.preventDefault();
          if (!sending) onSubmit();
        }}
      >
        <h1 className={styles.title}>{t("o03.setPin.title")}</h1>
        <p className={styles.lead}>{t("o03.setPin.body")}</p>
        <div className={styles.pin}>
          <Field
            label={t("o03.setPin.newLabel")}
            error={error?.field === "first" ? t(error.key) : undefined}
            value={first}
            onChange={(event) => onFirst(digits(event.target.value))}
            type={show ? "text" : "password"}
            inputMode="numeric"
            pattern="[0-9]*"
            maxLength={6}
            autoComplete="new-password"
            numeric
            data-testid="o03-newpin"
          />
        </div>
        <div className={`${styles.tight} ${styles.pin}`}>
          <Field
            label={t("o03.setPin.confirmLabel")}
            error={error?.field === "second" ? t(error.key) : undefined}
            value={second}
            onChange={(event) => onSecond(digits(event.target.value))}
            type={show ? "text" : "password"}
            inputMode="numeric"
            pattern="[0-9]*"
            maxLength={6}
            autoComplete="new-password"
            numeric
            data-testid="o03-confirmpin"
          />
          <Button variant="quiet" className={styles.pinToggle} icon={<EyeIcon />} onClick={() => setShow(!show)} aria-pressed={show}>
            {show ? t("o03.signIn.hidePin") : t("o03.signIn.showPin")}
          </Button>
        </div>
        <ul className={styles.pinRules} data-testid="o03-pin-rules">
          {rules.map((rule) => (
            <li key={rule.key} data-ok={rule.ok || undefined}>
              <span className={styles.pinRuleMark} aria-hidden="true">
                {rule.ok ? <CheckIcon size={14} strokeWidth={3} /> : null}
              </span>
              <span>{t(rule.key)}</span>
              <span className="eg-sr-only">{rule.ok ? t("common.done") : ""}</span>
            </li>
          ))}
        </ul>
      </form>
    </AppShell>
  );
}

/* ---------- O-03 revoked ---------- */

export type RevokedViewProps = Shell & {
  unsentCount: number;
  onSignInNew: () => void;
  onClear: () => Promise<void> | void;
};

export function RevokedView({ unsentCount, onSignInNew, onClear, offline, banner }: RevokedViewProps) {
  const t = useT();
  const [confirm, setConfirm] = useState(false);
  const [clearing, setClearing] = useState(false);
  const opener = useRef<HTMLButtonElement>(null);
  return (
    <AppShell
      title={<AppBarTitle />}
      hideBack
      offline={offline}
      banner={banner}
      actions={
        <>
          {unsentCount > 0 ? (
            <Button ref={opener} variant="secondary" block onClick={() => setConfirm(true)} data-testid="o03-revoked-clear">
              {t("o03.revoked.clear")}
            </Button>
          ) : null}
          <Button block onClick={onSignInNew} data-testid="o03-revoked-signin">
            {t("o03.revoked.signInNew")}
          </Button>
        </>
      }
      data-testid="o03-revoked"
    >
      <div className={styles.screen}>
        <div className={styles.titleRow}>
          <AlertIcon size={28} aria-hidden="true" />
          <h1 className={styles.title}>{t("o03.revoked.title")}</h1>
        </div>
        <p className={styles.lead}>{t("o03.revoked.body")}</p>
        {unsentCount > 0 ? (
          <Banner tone="attn" title={t("o03.revoked.unsent", { count: unsentCount })} data-testid="o03-revoked-unsent">
            {t("o03.revoked.unsentHint")}
          </Banner>
        ) : (
          <p className={styles.note}>
            <ShieldCheckIcon />
            <span>{t("common.error.revoked")}</span>
          </p>
        )}
      </div>
      <Sheet
        open={confirm}
        onClose={() => setConfirm(false)}
        title={t("o03.revoked.clearTitle")}
        description={t("o03.revoked.clearBody")}
        footer={
          <>
            <Button
              variant="danger"
              block
              loading={clearing}
              onClick={async () => {
                setClearing(true);
                await onClear();
                setClearing(false);
                setConfirm(false);
              }}
              data-testid="o03-revoked-confirm"
            >
              {t("o03.revoked.clearConfirm")}
            </Button>
            <Button variant="secondary" block onClick={() => setConfirm(false)}>
              {t("ui.cancel")}
            </Button>
          </>
        }
        data-testid="o03-revoked-sheet"
      />
    </AppShell>
  );
}
