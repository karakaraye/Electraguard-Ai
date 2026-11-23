"use client";

import { useState, type FormEvent } from "react";
import { useT } from "../../../../lib/i18n/client";
import { Banner, BrandMark, Button, Field } from "../../../../ui";
import { CopyIcon } from "../../../../ui/icons";
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
  onEmailChange?: (email: string) => void;
  onSubmitCredentials?: (email: string, password: string) => void;
  onSubmitTotp?: (code: string) => void;
  onSubmitEnrol?: (code: string) => void;
  onSubmitInvitePassword?: (password: string) => void;
  onBackToCredentials?: () => void;
  "data-testid"?: string;
}

export function SignInView({
  step,
  email,
  error,
  loading,
  enrolData,
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
  const [totpCode, setTotpCode] = useState("");
  const [enrolCode, setEnrolCode] = useState("");
  const [invitePassword, setInvitePassword] = useState("");
  const [copied, setCopied] = useState(false);

  const handleCredentialsSubmit = (e: FormEvent) => {
    e.preventDefault();
    if (onSubmitCredentials) onSubmitCredentials(email, password);
  };

  const handleTotpSubmit = (e: FormEvent) => {
    e.preventDefault();
    if (onSubmitTotp) onSubmitTotp(totpCode);
  };

  const handleEnrolSubmit = (e: FormEvent) => {
    e.preventDefault();
    if (onSubmitEnrol) onSubmitEnrol(enrolCode);
  };

  const handleInviteSubmit = (e: FormEvent) => {
    e.preventDefault();
    if (onSubmitInvitePassword) onSubmitInvitePassword(invitePassword);
  };

  const handleCopySecret = async () => {
    if (!enrolData?.secret) return;
    try {
      await navigator.clipboard.writeText(enrolData.secret);
      setCopied(true);
      setTimeout(() => setCopied(false), 2000);
    } catch {
      // Ignore clipboard write failure
    }
  };

  return (
    <div className={styles.container} data-testid={testId}>
      <div className={styles.card}>
        <div className={styles.brandMonogram}>
          <BrandMark size="md" />
        </div>

        <h1 className={styles.title}>{t("s01.title")}</h1>
        <p className={styles.subtitle}>
          {step === "credentials" && t("s01.subtitle")}
          {step === "totp" && t("s01.totpTitle")}
          {step === "enrol" && t("s01.enrolTitle")}
          {step === "invite" && t("s01.inviteTitle")}
        </p>

        {error ? (
          <div className={styles.errorBanner}>
            <Banner tone="danger" title={error} critical />
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
              autoComplete="email"
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
            <Field
              id="staff-totp"
              label={t("s01.totpLabel")}
              hint={t("s01.totpHint")}
              type="text"
              inputMode="numeric"
              pattern="[0-9]*"
              maxLength={6}
              autoComplete="one-time-code"
              required
              value={totpCode}
              onChange={(e) => setTotpCode(e.target.value.replace(/\D/g, ""))}
            />
            <div className={styles.actions}>
              <Button type="submit" variant="primary" loading={loading} disabled={totpCode.length < 6}>
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
            <p className={styles.subtitle}>{t("s01.enrolSubtitle")}</p>
            {enrolData?.secret ? (
              <div>
                <label className="eg-sr-only" htmlFor="totp-secret-val">
                  {t("s01.enrolSecretLabel")}
                </label>
                <div className={styles.secretBox} id="totp-secret-val">
                  <span className={styles.secretValue}>{enrolData.secret}</span>
                  <Button
                    type="button"
                    variant="quiet"
                    onClick={handleCopySecret}
                    aria-label={t("s01.enrolSecretCopy")}
                  >
                    <CopyIcon size={16} />
                    <span>{copied ? t("s01.enrolSecretCopied") : t("s01.enrolSecretCopy")}</span>
                  </Button>
                </div>
              </div>
            ) : null}

            <Field
              id="enrol-totp"
              label={t("s01.enrolCodeLabel")}
              type="text"
              inputMode="numeric"
              pattern="[0-9]*"
              maxLength={6}
              autoComplete="one-time-code"
              required
              value={enrolCode}
              onChange={(e) => setEnrolCode(e.target.value.replace(/\D/g, ""))}
            />
            <div className={styles.actions}>
              <Button type="submit" variant="primary" loading={loading} disabled={enrolCode.length < 6}>
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
            <p className={styles.subtitle}>{t("s01.inviteSubtitle")}</p>
            <Field
              id="invite-password"
              label={t("s01.newPasswordLabel")}
              hint={t("s01.newPasswordHint")}
              type="password"
              minLength={12}
              required
              value={invitePassword}
              onChange={(e) => setInvitePassword(e.target.value)}
            />
            <div className={styles.actions}>
              <Button type="submit" variant="primary" loading={loading} disabled={invitePassword.length < 12}>
                {t("s01.acceptInviteButton")}
              </Button>
            </div>
          </form>
        )}
      </div>
    </div>
  );
}
