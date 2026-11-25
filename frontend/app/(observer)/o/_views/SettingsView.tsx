"use client";

/* O-20 Settings: language, change PIN, privacy notice, what waits on this phone, sign out, clear this phone. */

import Link from "next/link";
import { useEffect } from "react";
import { useLocale, useT } from "../../../../lib/i18n/client";
import { localeNames } from "../../../../lib/i18n/config";
import { AppShell, Banner, Button, Field, LanguageSwitcher, SegmentedControl, Sheet, setTextSize, setThemePreference, useTextSize, useThemePreference, type TextSize, type ThemePreference } from "../../../../ui";
import { setVibrationPreference, useVibration } from "../../../../ui/vibration";
import { ChevronDownIcon, ChevronRightIcon, ChevronUpIcon } from "../../../../ui/icons";
import styles from "../_components/observer.module.css";
import s from "../_components/screens.module.css";

export type PinField = "current" | "next" | "confirm" | "form";

export type SettingsViewProps = {
  offline: boolean;
  code: string;
  version: string;
  unsentCount: number;
  mediaLabel: string;
  signedOutNotice: boolean;
  languageOpen: boolean;
  onLanguage: (open: boolean) => void;
  pinOpen: boolean;
  onPinOpen: (open: boolean) => void;
  pin: { current: string; next: string; confirm: string };
  onPin: (field: "current" | "next" | "confirm", value: string) => void;
  pinError: { field: PinField; message: string } | null;
  pinState: null | "saving" | "saved";
  onSavePin: () => void;
  onSendNow: () => void;
  /** Sheet for plain sign-out when items are waiting, and for clear. */
  sheet: null | "signOut" | "clear";
  busy: null | "signOut" | "everywhere" | "clear";
  onSignOut: (everywhere: boolean) => void;
  onConfirmSignOut: () => void;
  onClear: () => void;
  onConfirmClear: () => void;
  onCloseSheet: () => void;
  onBack: () => void;
};

export function SettingsView(props: SettingsViewProps) {
  const t = useT();
  const { locale } = useLocale();
  const { offline, pin, pinError } = props;
  const errorFor = (field: PinField) => (pinError?.field === field ? pinError.message : undefined);
  const theme = useThemePreference("light");
  const textSize = useTextSize();
  const vibration = useVibration();
  // From the menu's Sign out (#sign-out): bring the sign-out choices into view.
  useEffect(() => {
    if (window.location.hash === "#sign-out") document.getElementById("sign-out")?.scrollIntoView({ block: "start" });
  }, []);
  return (
    <AppShell onBack={props.onBack} offline={offline} banner={props.signedOutNotice ? <Banner tone="ok" title={t("o20.signOut.signedOut")} /> : undefined} data-testid="o20">
      <div className={styles.screen}>
        <h1 className={styles.title}>{t("o20.title")}</h1>
        <p className={styles.meta}>{t("o04.signedInAs", { code: props.code })}</p>
        <h2 className={s.settingsGroup}>{t("o20.groupDisplay")}</h2>
        <ul className={s.settings}>
          <li className={s.setting}>
            <button type="button" className={s.settingRow} onClick={() => props.onLanguage(true)} data-testid="o20-language">
              <span>{t("o20.language")}</span>
              <span className={s.settingValue} lang={locale}>
                {localeNames[locale]}
                <ChevronRightIcon aria-hidden="true" />
              </span>
            </button>
          </li>
          <li className={s.setting}>
            <span className={s.settingLabel}>
              {t("ui.theme.label")}
            </span>
            <SegmentedControl
              label={t("ui.theme.label")}
              options={(["system", "light", "dark"] as const).map((value) => ({ value, label: t(value === "system" ? "o20.themeSystem" : `ui.theme.${value}`) }))}
              value={theme}
              onChange={(value) => setThemePreference(value as ThemePreference)}
              data-testid="o20-theme"
            />
          </li>
          <li className={s.setting}>
            <span className={s.settingLabel}>{t("o20.textSize")}</span>
            <SegmentedControl
              label={t("o20.textSize")}
              options={(["normal", "large"] as const).map((value) => ({ value, label: t(`o20.text.${value}`) }))}
              value={textSize}
              onChange={(value) => setTextSize(value as TextSize)}
              data-testid="o20-text-size"
            />
          </li>
          <li className={s.setting}>
            <label className={styles.switch}>
              <span className={s.switchText}>
                <span>{t("o20.vibration")}</span>
                <span className={styles.meta}>{t("o20.vibrationHint")}</span>
              </span>
              <input
                type="checkbox"
                role="switch"
                checked={vibration}
                onChange={(event) => setVibrationPreference(event.target.checked)}
                data-testid="o20-vibration"
              />
            </label>
          </li>
        </ul>
        <h2 className={s.settingsGroup}>{t("o20.groupAccount")}</h2>
        <ul className={s.settings}>
          <li className={s.setting}>
            <button type="button" className={s.settingRow} aria-expanded={props.pinOpen} aria-controls="o20-pin" onClick={() => props.onPinOpen(!props.pinOpen)} data-testid="o20-pin">
              <span>{t("o20.pin.change")}</span>
              <span className={s.settingValue}>{props.pinOpen ? <ChevronUpIcon aria-hidden="true" /> : <ChevronDownIcon aria-hidden="true" />}</span>
            </button>
            {props.pinState === "saved" && !props.pinOpen ? (
              <p className={styles.tag} role="status" data-testid="o20-pin-saved">
                {t("o20.pin.saved")}
              </p>
            ) : null}
            {props.pinOpen ? (
              <form
                id="o20-pin"
                className={`${s.pinForm} ${styles.pin}`}
                noValidate
                onSubmit={(event) => {
                  event.preventDefault();
                  props.onSavePin();
                }}
              >
                {(["current", "next", "confirm"] as const).map((field) => (
                  <Field
                    key={field}
                    label={t(field === "current" ? "o20.pin.currentLabel" : field === "next" ? "o20.pin.newLabel" : "o20.pin.confirmLabel")}
                    value={pin[field]}
                    onChange={(event) => props.onPin(field, event.target.value.replace(/\D/g, "").slice(0, 6))}
                    type="password"
                    inputMode="numeric"
                    pattern="[0-9]*"
                    maxLength={6}
                    autoComplete={field === "current" ? "current-password" : "new-password"}
                    numeric
                    autoFocus={field === "current"}
                    error={errorFor(field)}
                    data-testid={`o20-pin-${field}`}
                  />
                ))}
                {errorFor("form") ? <Banner tone="attn" title={errorFor("form")!} /> : null}
                {offline ? <p className={styles.note}>{t("o03.signIn.offline")}</p> : null}
                <div>
                  <Button type="submit" disabled={offline} loading={props.pinState === "saving"} loadingLabel={t("o03.setPin.submitting")} data-testid="o20-pin-save">
                    {t("o20.pin.save")}
                  </Button>
                </div>
              </form>
            ) : null}
          </li>
          <li className={s.setting}>
            <Link href="/o/start?view=notice&from=settings" className={s.settingRow} data-testid="o20-privacy">
              <span>{t("o20.privacy")}</span>
              <span className={s.settingValue}>
                <ChevronRightIcon aria-hidden="true" />
              </span>
            </Link>
          </li>
          <li className={s.setting}>
            <p className={styles.lead} style={{ margin: 0 }} data-testid="o20-storage">
              {t("o20.storage", { reports: props.unsentCount, size: props.mediaLabel })}
            </p>
            {props.unsentCount > 0 && !offline ? (
              <div>
                <Button variant="secondary" onClick={props.onSendNow} data-testid="o20-send-now">
                  {t("o04.sendNow")}
                </Button>
              </div>
            ) : null}
          </li>
        </ul>

        <div className={s.signOut} id="sign-out">
          <Button variant="secondary" block loading={props.busy === "signOut"} onClick={() => props.onSignOut(false)} data-testid="o20-sign-out">
            {t("o20.signOut.button")}
          </Button>
          <Button variant="quiet" block disabled={offline} loading={props.busy === "everywhere"} onClick={() => props.onSignOut(true)} data-testid="o20-sign-out-everywhere">
            {t("o20.signOut.everywhere")}
          </Button>
          <div className={s.dangerZone}>
            <Button variant="secondary" block className={s.dangerOutline} onClick={props.onClear} data-testid="o20-clear">
              {t("o20.signOut.clearButton")}
            </Button>
            <p className={styles.note}>{t("o20.signOut.clearHint")}</p>
          </div>
        </div>

        <p className={`${styles.meta} eg-tnum`}>{t("o20.version", { version: props.version })}</p>
      </div>

      <Sheet open={props.languageOpen} onClose={() => props.onLanguage(false)} title={t("o01.title")} data-testid="o20-language-sheet">
        <LanguageSwitcher onChanged={() => props.onLanguage(false)} />
      </Sheet>

      <Sheet
        open={props.sheet === "signOut"}
        onClose={props.onCloseSheet}
        title={t("o20.signOut.button")}
        description={t("o20.signOut.unsentKept", { count: props.unsentCount })}
        footer={
          <>
            {!offline ? (
              <Button block onClick={props.onSendNow} data-testid="o20-send-first">
                {t("o20.signOut.sendFirst", { count: props.unsentCount })}
              </Button>
            ) : null}
            <Button variant="secondary" block loading={props.busy === "signOut"} onClick={props.onConfirmSignOut} data-testid="o20-sign-out-confirm">
              {t("o20.signOut.button")}
            </Button>
          </>
        }
      />

      <Sheet
        open={props.sheet === "clear"}
        onClose={props.onCloseSheet}
        title={t("o20.signOut.title")}
        description={
          <>
            <p style={{ margin: 0 }}>{t("o20.signOut.body")}</p>
            {props.unsentCount > 0 ? (
              <p className={styles.strong} style={{ marginBottom: 0 }}>
                {t("o20.signOut.unsentWarning", { count: props.unsentCount })}
              </p>
            ) : null}
          </>
        }
        footer={
          <>
            <Button variant="secondary" block autoFocus onClick={props.onCloseSheet} data-testid="o20-clear-cancel">
              {t("ui.cancel")}
            </Button>
            {props.unsentCount > 0 && !offline ? (
              <Button variant="secondary" block onClick={props.onSendNow}>
                {t("o20.signOut.sendFirst", { count: props.unsentCount })}
              </Button>
            ) : null}
            <Button variant="danger" block loading={props.busy === "clear"} onClick={props.onConfirmClear} data-testid="o20-clear-confirm">
              {t("o20.signOut.confirm")}
            </Button>
          </>
        }
        data-testid="o20-clear-sheet"
      />
    </AppShell>
  );
}
