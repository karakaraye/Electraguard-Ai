"use client";

import { usePathname, useRouter } from "next/navigation";
import { useEffect, useState, type ReactNode } from "react";
import { api } from "../../../lib/api/client";
import type { MeResponse, Role } from "../../../lib/api/types";
import { useT } from "../../../lib/i18n/client";
import { Button, StaffShell, type StaffNavItem } from "../../../ui";
import {
  DiscussionIcon,
  InboxIcon,
  KeyIcon,
  SearchIcon,
  ShieldCheckIcon,
  SignalIcon,
  SignOutIcon,
  SlidersIcon,
  UploadIcon,
  UsersIcon,
} from "../../../ui/icons";

export default function StaffLayout({ children }: { children: ReactNode }) {
  const pathname = usePathname();
  const router = useRouter();
  const t = useT();

  const [me, setMe] = useState<MeResponse | null>(null);

  // If we're on the sign-in page, render without the StaffShell framing.
  const isSignIn = pathname === "/s/sign-in";

  useEffect(() => {
    let cancelled = false;
    async function loadMe() {
      try {
        const res = await api("AUTH-07", {});
        if (!cancelled && res.ok) {
          setMe(res.data);
          if (!res.data.authenticated && !isSignIn) {
            router.push("/s/sign-in");
          }
        }
      } catch {
        // Fallback gracefully
      }
    }
    loadMe();
    return () => {
      cancelled = true;
    };
  }, [pathname, isSignIn, router]);

  const handleSignOut = async () => {
    try {
      await api("AUTH-06", { body: { everywhere: false } });
    } finally {
      router.push("/s/sign-in");
    }
  };

  if (isSignIn) {
    return <>{children}</>;
  }

  // Derive roles
  const roles: Role[] = me?.authenticated && me.user ? (me.user.roles as Role[]) : ["reviewer"];
  const isReviewer = roles.includes("reviewer");
  const isCoordinator = roles.includes("coordinator");
  const isModerator = roles.includes("moderator");
  const isOrgAdmin = roles.includes("org_admin");

  const nav: StaffNavItem[] = [];

  if (isReviewer) {
    nav.push({
      href: "/s/queue",
      label: t("staff.nav.queue"),
      icon: InboxIcon,
      current: pathname === "/s/queue" || pathname.startsWith("/s/cases"),
    });
  }

  if (isCoordinator) {
    nav.push({
      href: "/s/assign",
      label: t("staff.nav.assign"),
      icon: SlidersIcon,
      current: pathname === "/s/assign",
    });
    nav.push({
      href: "/s/ops",
      label: t("staff.nav.ops"),
      icon: SignalIcon,
      current: pathname === "/s/ops",
    });
    nav.push({
      href: "/s/rumours",
      label: t("staff.nav.rumours"),
      icon: SearchIcon,
      current: pathname === "/s/rumours",
    });
    nav.push({
      href: "/s/publish",
      label: t("staff.nav.publish"),
      icon: UploadIcon,
      current: pathname === "/s/publish",
    });
  }

  if (isModerator) {
    nav.push({
      href: "/s/discussions",
      label: t("staff.nav.discussions"),
      icon: DiscussionIcon,
      current: pathname === "/s/discussions",
    });
  }

  if (isOrgAdmin) {
    nav.push({
      href: "/s/admin/codes",
      label: t("staff.nav.codes"),
      icon: KeyIcon,
      current: pathname === "/s/admin/codes",
    });
    nav.push({
      href: "/s/admin/staff",
      label: t("staff.nav.staff"),
      icon: UsersIcon,
      current: pathname === "/s/admin/staff",
    });
    nav.push({
      href: "/s/admin/settings",
      label: t("staff.nav.settings"),
      icon: SlidersIcon,
      current: pathname === "/s/admin/settings",
    });
  }

  if (isCoordinator || isOrgAdmin) {
    nav.push({
      href: "/s/security",
      label: t("staff.nav.security"),
      icon: ShieldCheckIcon,
      current: pathname === "/s/security",
    });
  }

  // Fallback nav if user has no assigned roles yet
  if (nav.length === 0) {
    nav.push({
      href: "/s/queue",
      label: t("staff.nav.queue"),
      icon: InboxIcon,
      current: true,
    });
  }

  // Determine page title based on current path
  let pageTitle = t("ui.productName");
  if (pathname === "/s/queue") pageTitle = t("s02.title");
  else if (pathname.startsWith("/s/cases")) pageTitle = t("s03.title");
  else if (pathname === "/s/assign") pageTitle = t("s04.title");
  else if (pathname === "/s/ops") pageTitle = t("s05.title");
  else if (pathname === "/s/rumours") pageTitle = t("s06.title");
  else if (pathname === "/s/publish") pageTitle = t("s07.title");
  else if (pathname === "/s/discussions") pageTitle = t("s08.title");
  else if (pathname === "/s/admin/codes") pageTitle = t("s09.title");
  else if (pathname === "/s/admin/staff") pageTitle = t("s10.title");
  else if (pathname === "/s/admin/settings") pageTitle = t("s11.title");
  else if (pathname === "/s/security") pageTitle = t("s12.title");

  const headerEnd = (
    <div style={{ display: "flex", alignItems: "center", gap: "var(--s-3)" }}>
      {me?.authenticated && me.user?.display_name ? (
        <span style={{ fontSize: "var(--t-small)", color: "var(--ink-2)" }}>
          {t("staff.signedInAs", { name: me.user.display_name })}
        </span>
      ) : null}
      <Button variant="quiet" onClick={handleSignOut} aria-label={t("staff.signOut")}>
        <SignOutIcon size={18} />
        <span>{t("staff.signOut")}</span>
      </Button>
    </div>
  );

  return (
    <StaffShell nav={nav} title={pageTitle} headerEnd={headerEnd}>
      {children}
    </StaffShell>
  );
}
