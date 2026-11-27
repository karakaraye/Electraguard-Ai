"use client";

import { useEffect, useId, useRef, useState, type FormEvent } from "react";
import { useT } from "../../../../lib/i18n/client";
import { Banner, BrandMark, Button, Field } from "../../../../ui";
import { CheckIcon, CopyIcon } from "../../../../ui/icons";
import styles from "./SignInView.module.css";

export type SignInStep = "credentials" | "totp" | "enrol" | "invite";

export interface SignInViewProps {
  step: SignInStep;
  email: string;
  error: string | null;
  loading: boolean;
  enrolData?: {
    secret: string;
    otpauth_uri: string;
  } | null;
  inviteToken?: string | null;
  /** Preview only: start with these values filled in. */
  initialValues?: { totp?: string; invitePassword?: string };
  onEmailChange?: (email: string) => void;
  onSubmitCredentials?: (email: string, password: string) => void;
  onSubmitTotp?: (code: string) => void;
  onSubmitEnrol?: (code: string) => void;
  onSubmitInvitePassword?: (password: string) => void;
  onBackToCredentials?: () => void;
  "data-testid"?: string;
}

const CODE_LENGTH = 6;
const PASSWORD_MIN = 12;
const PASSWORD_MAX = 128;

/** S-01 staff sign-in: email and password, the two-step code, enrolment, and invitations. */
export function SignInView({
  step,
  email,
  error,
  loading,
  enrolData,
  initialValues,
  onEmailChange,
  onSubmitCredentials,
  onSubmitTotp,
  onSubmitEnrol,
  onSubmitInvitePassword,
  onBackToCredentials,
  "data-testid": testId = "staff-sign-in-view",
}: SignInViewProps) {
  const t = useT();
  const [password, setPassword] = useState("");
  const [totpCode, setTotpCode] = useState(initialValues?.totp ?? "");
  const [enrolCode, setEnrolCode] = useState("");
  const [invitePassword, setInvitePassword] = useState(initialValues?.invitePassword ?? "");
  const [copied, setCopied] = useState(false);

  const handleCredentialsSubmit = (e: FormEvent) => {
    e.preventDefault();
    onSubmitCredentials?.(email, password);
  };

  const handleTotpSubmit = (e?: FormEvent) => {
    e?.preventDefault();
    if (totpCode.length === CODE_LENGTH) onSubmitTotp?.(totpCode);
  };

  const handleEnrolSubmit = (e?: FormEvent) => {
    e?.preventDefault();
    if (enrolCode.length === CODE_LENGTH) onSubmitEnrol?.(enrolCode);
  };

  const handleInviteSubmit = (e: FormEvent) => {
    e.preventDefault();
    onSubmitInvitePassword?.(invitePassword);
  };

  const handleCopySecret = async () => {
    if (!enrolData?.secret) return;
    try {
      await navigator.clipboard.writeText(enrolData.secret);
      setCopied(true);
      window.setTimeout(() => setCopied(false), 2000);
    } catch {
      // The key stays selectable, so it can still be copied by hand.
    }
  };

  const titles: Record<SignInStep, string> = {
    credentials: t("s01.title"),
    totp: t("s01.totpTitle"),
    enrol: t("s01.enrolTitle"),
    invite: t("s01.inviteTitle"),
  };
  const leads: Record<SignInStep, string> = {
    credentials: t("s01.subtitle"),
    totp: t("s01.totpHint"),
    enrol: t("s01.enrolSubtitle"),
    invite: t("s01.inviteSubtitle"),
  };

  return (
    <div className={styles.container} data-testid={testId}>
      <div className={styles.card} data-step={step}>
        <div className={styles.inner}>
          <div className={styles.brand}>
            <BrandMark variant="lockup" size="md" />
          </div>

          <div className={styles.head}>
            <div>
              <h1 className={styles.title}>{titles[step]}</h1>
              <p className={styles.lead}>{leads[step]}</p>
            </div>
          </div>

          {error ? (
            <div className={styles.errorBanner}>
              <Banner tone="danger" title={error} critical data-testid="s01-error" />
            </div>
          ) : null}

          {step === "credentials" && (
            <form className={styles.form} onSubmit={handleCredentialsSubmit}>
              <Field
                id="staff-email"
                label={t("s01.emailLabel")}
                hint={t("s01.emailHint")}
                type="email"
                required
                autoComplete="username"
                value={email}
                onChange={(e) => onEmailChange?.(e.target.value)}
              />
              <Field
                id="staff-password"
                label={t("s01.passwordLabel")}
                type="password"
                required
                autoComplete="current-password"
                value={password}
                onChange={(e) => setPassword(e.target.value)}
              />
              <div className={styles.actions}>
                <Button type="submit" variant="primary" loading={loading} disabled={!email || !password}>
                  {loading ? t("s01.signingIn") : t("s01.signInButton")}
                </Button>
              </div>
            </form>
          )}

          {step === "totp" && (
            <form className={styles.form} onSubmit={handleTotpSubmit}>
              <CodeBoxes
                id="staff-totp"
                label={t("s01.totpLabel")}
                value={totpCode}
                onChange={setTotpCode}
                onComplete={(code) => onSubmitTotp?.(code)}
                disabled={loading}
                invalid={Boolean(error)}
              />
              <div className={styles.actions}>
                <Button type="submit" variant="primary" loading={loading} disabled={totpCode.length < CODE_LENGTH}>
                  {loading ? t("s01.totpVerifying") : t("s01.totpVerify")}
                </Button>
                {onBackToCredentials && (
                  <Button type="button" variant="quiet" onClick={onBackToCredentials}>
                    {t("ui.back")}
                  </Button>
                )}
              </div>
            </form>
          )}

          {step === "enrol" && (
            <form className={styles.form} onSubmit={handleEnrolSubmit}>
              <ol className={styles.enrolSteps}>
                <li>
                  <p className={styles.enrolStepTitle}>{t("s01.enrolScan")}</p>
                  {enrolData?.otpauth_uri ? <QrCode value={enrolData.otpauth_uri} label={t("s01.qrLabel")} fallback={t("s01.qrUnavailable")} /> : null}
                </li>
                {enrolData?.secret ? (
                  <li>
                    <p className={styles.enrolStepTitle} id="totp-secret-label">{t("s01.enrolTypeKey")}</p>
                    <div className={styles.secretBox}>
                      <code className={styles.secretValue} aria-labelledby="totp-secret-label" data-testid="s01-secret">
                        {groupSecret(enrolData.secret)}
                      </code>
                      <Button
                        type="button"
                        variant="secondary"
                        icon={copied ? <CheckIcon /> : <CopyIcon />}
                        onClick={handleCopySecret}
                        data-testid="s01-copy-key"
                      >
                        {copied ? t("s01.enrolSecretCopied") : t("s01.enrolSecretCopy")}
                      </Button>
                    </div>
                    <p className={styles.srStatus} role="status">{copied ? t("s01.enrolSecretCopied") : ""}</p>
                  </li>
                ) : null}
                <li>
                  <CodeBoxes
                    id="enrol-totp"
                    label={t("s01.enrolCodeLabel")}
                    value={enrolCode}
                    onChange={setEnrolCode}
                    onComplete={(code) => onSubmitEnrol?.(code)}
                    disabled={loading}
                    invalid={Boolean(error)}
                  />
                </li>
              </ol>
              <div className={styles.actions}>
                <Button type="submit" variant="primary" loading={loading} disabled={enrolCode.length < CODE_LENGTH}>
                  {t("s01.enrolConfirm")}
                </Button>
                {onBackToCredentials && (
                  <Button type="button" variant="quiet" onClick={onBackToCredentials}>
                    {t("ui.back")}
                  </Button>
                )}
              </div>
            </form>
          )}

          {step === "invite" && (
            <form className={styles.form} onSubmit={handleInviteSubmit}>
              <div className={styles.passwordBlock}>
                <Field
                  id="invite-password"
                  label={t("s01.newPasswordLabel")}
                  hint={t("s01.newPasswordHint")}
                  type="password"
                  minLength={PASSWORD_MIN}
                  maxLength={PASSWORD_MAX}
                  required
                  autoComplete="new-password"
                  value={invitePassword}
                  onChange={(e) => setInvitePassword(e.target.value.slice(0, PASSWORD_MAX))}
                />
                <StrengthLine password={invitePassword} />
              </div>
              <div className={styles.actions}>
                <Button type="submit" variant="primary" loading={loading} disabled={invitePassword.length < PASSWORD_MIN}>
                  {t("s01.acceptInviteButton")}
                </Button>
              </div>
            </form>
          )}
        </div>
      </div>
      <p className={styles.foot}>{t("s01.footer")}</p>
    </div>
  );
}

/** Groups a base32 key in fours so it can be read aloud and typed without losing place. */
function groupSecret(secret: string): string {
  return secret.replace(/\s+/g, "").replace(/(.{4})(?=.)/g, "$1 ");
}

/**
 * Six code boxes. One real input sits over six drawn cells, so paste, the phone's
 * one-time-code fill and screen readers all see a single field, and typing moves
 * the highlight to the next box by itself.
 */
function CodeBoxes({
  id,
  label,
  value,
  onChange,
  onComplete,
  disabled,
  invalid,
}: {
  id: string;
  label: string;
  value: string;
  onChange: (value: string) => void;
  onComplete: (value: string) => void;
  disabled?: boolean;
  invalid?: boolean;
}) {
  const t = useT();
  const hintId = useId();
  const [focused, setFocused] = useState(false);
  const submitted = useRef<string | null>(null);

  function update(raw: string) {
    const next = raw.replace(/\D/g, "").slice(0, CODE_LENGTH);
    onChange(next);
    if (next.length === CODE_LENGTH && submitted.current !== next) {
      submitted.current = next;
      onComplete(next);
    }
    if (next.length < CODE_LENGTH) submitted.current = null;
  }

  const active = Math.min(value.length, CODE_LENGTH - 1);
  return (
    <div className={styles.codeField}>
      <label className={styles.codeLabel} htmlFor={id}>{label}</label>
      <p className={styles.codeHint} id={hintId}>{t("s01.codePaste")}</p>
      <div className={styles.codeWrap} data-invalid={invalid ? "" : undefined}>
        <div className={styles.cells} aria-hidden="true">
          {Array.from({ length: CODE_LENGTH }, (_, i) => (
            <span
              key={i}
              className={styles.cell}
              data-filled={value[i] ? "" : undefined}
              data-active={focused && i === active ? "" : undefined}
            >
              {value[i] ?? ""}
            </span>
          ))}
        </div>
        <input
          id={id}
          className={styles.codeInput}
          value={value}
          onChange={(e) => update(e.target.value)}
          onFocus={() => setFocused(true)}
          onBlur={() => setFocused(false)}
          inputMode="numeric"
          pattern="[0-9]*"
          autoComplete="one-time-code"
          aria-describedby={hintId}
          aria-invalid={invalid || undefined}
          disabled={disabled}
          required
          data-testid={`${id}-input`}
        />
      </div>
    </div>
  );
}

type Strength = "empty" | "short" | "fair" | "strong";

function strengthOf(password: string): Strength {
  if (!password) return "empty";
  if (password.length < PASSWORD_MIN) return "short";
  const kinds = [/[a-z]/, /[A-Z]/, /\d/, /[^A-Za-z0-9]/].filter((re) => re.test(password)).length;
  return password.length >= 16 || kinds >= 3 ? "strong" : "fair";
}

/** A three-part bar and one plain line: how long the password is and whether it is strong. */
function StrengthLine({ password }: { password: string }) {
  const t = useT();
  const strength = strengthOf(password);
  const filled = { empty: 0, short: 1, fair: 2, strong: 3 }[strength];
  const text =
    strength === "empty" ? t("s01.strength.empty", { min: PASSWORD_MIN })
      : strength === "short" ? t("s01.strength.short", { count: password.length, min: PASSWORD_MIN })
        : strength === "fair" ? t("s01.strength.fair")
          : t("s01.strength.strong");
  return (
    <div className={styles.strength} data-strength={strength} data-testid="s01-strength">
      <div className={styles.bars} aria-hidden="true">
        {[0, 1, 2].map((i) => (
          <span key={i} data-on={i < filled ? "" : undefined} />
        ))}
      </div>
      <p className={`${styles.strengthText} eg-tnum`} aria-live="polite">{text}</p>
    </div>
  );
}

/** The enrolment QR (spec D6), drawn from the otpauth link with a small library loaded only here. */
function QrCode({ value, label, fallback }: { value: string; label: string; fallback: string }) {
  const [qr, setQr] = useState<{ size: number; path: string } | null>(null);
  const [failed, setFailed] = useState(false);

  useEffect(() => {
    let alive = true;
    import("qrcode-generator")
      .then((mod) => {
        const code = mod.default(0, "M");
        code.addData(value);
        code.make();
        const size = code.getModuleCount();
        let path = "";
        for (let row = 0; row < size; row += 1) {
          for (let col = 0; col < size; col += 1) {
            if (code.isDark(row, col)) path += `M${col} ${row}h1v1h-1z`;
          }
        }
        if (alive) setQr({ size, path });
      })
      .catch(() => {
        if (alive) setFailed(true);
      });
    return () => {
      alive = false;
    };
  }, [value]);

  if (failed) return <p className={styles.qrFallback}>{fallback}</p>;
  return (
    <div className={styles.qr} data-testid="s01-qr">
      {qr ? (
        <svg viewBox={`-4 -4 ${qr.size + 8} ${qr.size + 8}`} role="img" aria-label={label} shapeRendering="crispEdges">
          <rect x={-4} y={-4} width={qr.size + 8} height={qr.size + 8} fill="#ffffff" />
          <path d={qr.path} fill="#000000" />
        </svg>
      ) : (
        <span className={styles.qrWait} aria-hidden="true" />
      )}
    </div>
  );
}
