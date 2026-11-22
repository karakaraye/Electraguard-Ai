"use client";

import Link from "next/link";
import type { ButtonHTMLAttributes, ReactNode, Ref } from "react";
import { useT } from "../../lib/i18n/client";
import styles from "./Button.module.css";

export type ButtonVariant = "primary" | "secondary" | "quiet" | "danger";

type CommonProps = {
  variant?: ButtonVariant;
  /** Leading icon (decorative; the text label names the action). */
  icon?: ReactNode;
  /** Stretch to the width of the container (default for pinned actions on phones). */
  block?: boolean;
  /** Shows the loading text in place of the label without changing the width. */
  loading?: boolean;
  /** Text shown while loading. Defaults to "Please wait". */
  loadingLabel?: string;
  children: ReactNode;
  "data-testid"?: string;
};

export type ButtonProps = CommonProps &
  Omit<ButtonHTMLAttributes<HTMLButtonElement>, "children"> & { ref?: Ref<HTMLButtonElement> };

export type ButtonLinkProps = CommonProps & {
  href: string;
  className?: string;
  ref?: Ref<HTMLAnchorElement>;
  onClick?: () => void;
};

function classes(variant: ButtonVariant, block?: boolean, extra?: string) {
  return [styles.button, styles[variant], block ? styles.block : "", extra ?? ""].filter(Boolean).join(" ");
}

function Content({ icon, children, loading, loadingLabel }: Pick<CommonProps, "icon" | "children" | "loading" | "loadingLabel">) {
  return (
    <span className={styles.stack}>
      <span className={styles.label} data-hidden={loading || undefined}>
        {icon ? <span className={styles.icon}>{icon}</span> : null}
        <span>{children}</span>
      </span>
      {loading ? (
        <span className={styles.loading}>
          <span>{loadingLabel}</span>
        </span>
      ) : null}
    </span>
  );
}

/**
 * Buttons: primary (ink fill), secondary (ink outline), quiet (text) and danger.
 * Disabled and loading buttons stay focusable (aria-disabled) so screen-reader
 * users can still find them and hear why.
 */
export function Button({
  variant = "primary",
  icon,
  block,
  loading,
  loadingLabel,
  children,
  disabled,
  className,
  type = "button",
  onClick,
  ref,
  ...rest
}: ButtonProps) {
  const t = useT();
  const inert = disabled || loading;
  return (
    <button
      ref={ref}
      type={type}
      className={classes(variant, block, className)}
      aria-disabled={inert || undefined}
      aria-busy={loading || undefined}
      onClick={(event) => {
        if (inert) {
          event.preventDefault();
          return;
        }
        onClick?.(event);
      }}
      {...rest}
    >
      <Content icon={icon} loading={loading} loadingLabel={loadingLabel ?? t("ui.pleaseWait")}>
        {children}
      </Content>
    </button>
  );
}

/** A link styled as a button, for navigation actions. */
export function ButtonLink({ variant = "primary", icon, block, children, href, className, ref, ...rest }: ButtonLinkProps) {
  return (
    <Link ref={ref} href={href} className={classes(variant, block, className)} {...rest}>
      <Content icon={icon}>{children}</Content>
    </Link>
  );
}
