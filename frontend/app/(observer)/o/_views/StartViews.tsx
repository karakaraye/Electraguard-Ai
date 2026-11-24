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
  ImageIcon,
  LockIcon,
  MicIcon,
  PhoneIcon,
  ShieldCheckIcon,
} from "../../../../ui/icons";
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

/** Page dots, Skip and Next: the welcome pages' action bar. */
export function WelcomeBar({ page, onNext, onSkip, nextLabel }: { page: 1 | 2 | 3; onNext: () => void; onSkip?: () => void; nextLabel?: string }) {
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
      <Button onClick={onNext} data-testid={`ob${page}-next`}>
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
    { key: "o02.line1", icon: <EyeIcon /> },
    { key: "o02.line2", icon: <ImageIcon /> },
    { key: "o02.line3", icon: <ArrowLeftIcon /> },
    { key: "o02.line5", icon: <MicIcon /> },
    { key: "o02.line4", icon: <PhoneIcon />, safety: true },
  ];
  return (
    <AppShell
      title={<AppBarTitle />}
      onBack={onBack}
      offline={offline}
      banner={banner}
      actions={
        readOnly ? undefined : (
          <Button block onClick={onContinue} data-testid="o02-continue">
            {t("o02.continue")}
          </Button>
        )
      }
      data-testid="o02"
    >
      <BackgroundArt variant="hero" />
      <div className={styles.screen}>
        <h1 className={styles.title}>{t("o02.title")}</h1>
        <ul className={styles.lines}>
          {lines.map((line) => (
            <li key={line.key} className={`${styles.line} ${line.safety ? styles.lineSafety : ""}`}>
              <span aria-hidden="true">{line.icon}</span>
              <span>{t(line.key)}</span>
            </li>
          ))}
        </ul>
        <p className={styles.credit}>
          <BrandMark variant="lockup" size="md" credit />
        </p>
      </div>
    </AppShell>
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
            <BadgePictogram size={40} aria-hidden="true" />
            <span className={styles.choiceText}>
              <span className={styles.choiceLabel}>{t("o03.observer")}</span>
              <span className={styles.choiceHint}>{t("o03.observerHint")}</span>
            </span>
            <ChevronRightIcon aria-hidden="true" />
          </button>
          <button type="button" className={styles.choice} onClick={onCitizen} data-testid="o03-citizen">
            <PersonPictogram size={40} aria-hidden="true" />
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
          <p className={styles.status} role="alert" aria-live="assertive" data-testid="o03-form-error">
            {formError ? <span className={styles.strong}>{formError}</span> : null}
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
        <Field
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
        <p className={styles.note}>
          <LockIcon />
          <span>{t("o03.signIn.forgot")}</span>
        </p>
      </form>
    </AppShell>
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
  return (
    <AppShell
      title={<AppBarTitle />}
      onBack={onBack}
      offline={offline}
      banner={banner}
      actions={
        <>
          <p className={styles.status} role="alert" data-testid="o03-setpin-error">
            {error?.field === "form" ? <span className={styles.strong}>{t(error.key)}</span> : null}
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
