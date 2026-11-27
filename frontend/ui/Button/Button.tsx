"use client";

import Link from "next/link";
import { useLayoutEffect, useRef, type ButtonHTMLAttributes, type ReactNode, type Ref } from "react";
import { useT } from "../../lib/i18n/client";
import styles from "./Button.module.css";

export type ButtonVariant = "primary" | "secondary" | "quiet" | "danger" | "onInk";

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
  /**
   * For the one send action: while loading, the bar closes into a ring that turns until the work
   * ends. The loading text stays for screen readers. Reduced motion keeps the plain loading text.
   */
  ring?: boolean;
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

function Content({ icon, children, loading, loadingLabel, ring }: Pick<CommonProps, "icon" | "children" | "loading" | "loadingLabel" | "ring">) {
  return (
    <span className={styles.stack}>
      {ring ? (
        <span className={styles.ringLayer} aria-hidden="true">
          <span className={styles.ringBg} />
          <span className={styles.ringDisc}>
            <span className={styles.ringSpin} />
          </span>
        </span>
      ) : null}
      <span className={styles.label} data-hidden={loading || undefined} aria-hidden={loading || undefined}>
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
  ring,
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
  const own = useRef<HTMLButtonElement | null>(null);
  // The bar closes to a disc as wide as it is tall: remember how much narrower that is.
  useLayoutEffect(() => {
    const el = own.current;
    if (!ring || !loading || !el) return;
    el.style.setProperty("--ring-k", String(Math.min(1, el.offsetHeight / Math.max(1, el.offsetWidth))));
  }, [ring, loading]);
  return (
    <button
      ref={(node) => {
        own.current = node;
        if (typeof ref === "function") ref(node);
        else if (ref) (ref as { current: HTMLButtonElement | null }).current = node;
      }}
      type={type}
      className={classes(variant, block, className)}
      aria-disabled={inert || undefined}
      aria-busy={loading || undefined}
      data-ring={ring || undefined}
      onClick={(event) => {
        if (inert) {
          event.preventDefault();
          return;
        }
        onClick?.(event);
      }}
      {...rest}
    >
      <Content icon={icon} loading={loading} loadingLabel={loadingLabel ?? t("ui.pleaseWait")} ring={ring}>
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
