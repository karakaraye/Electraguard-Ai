"use client";

import { usePathname, useRouter } from "next/navigation";
import { useEffect, useState, type ReactNode } from "react";
import { api } from "../../../lib/api/client";
import type { MeResponse, Role } from "../../../lib/api/types";
import { useT } from "../../../lib/i18n/client";
import { StaffShell, type StaffCrumb, type StaffNavItem } from "../../../ui";
import {
  MapPulseIcon,
  DiscussionIcon,
  InboxIcon,
  KeyIcon,
  ShieldCheckIcon,
  MegaphoneIcon,
  SlidersIcon,
  UploadIcon,
  UserPlusIcon,
  UsersIcon,
} from "../../../ui/icons";
import { StaffHeaderProvider, useStaffHeaderState } from "./_lib/header";

/** Section titles by route: the heading and the group it sits in. */
function sectionOf(pathname: string): { titleKey: string; groupKey: string } | null {
  if (pathname === "/s/queue") return { titleKey: "s02.title", groupKey: "review" };
  if (pathname.startsWith("/s/cases")) return { titleKey: "s03.title", groupKey: "review" };
  if (pathname === "/s/assign") return { titleKey: "s04.title", groupKey: "review" };
  if (pathname === "/s/ops") return { titleKey: "s05.title", groupKey: "monitor" };
  if (pathname === "/s/rumours") return { titleKey: "s06.title", groupKey: "monitor" };
  if (pathname === "/s/publish") return { titleKey: "s07.title", groupKey: "monitor" };
  if (pathname === "/s/discussions") return { titleKey: "s08.title", groupKey: "moderate" };
  if (pathname === "/s/admin/codes") return { titleKey: "s09.title", groupKey: "admin" };
  if (pathname === "/s/admin/staff") return { titleKey: "s10.title", groupKey: "admin" };
  if (pathname === "/s/admin/settings") return { titleKey: "s11.title", groupKey: "admin" };
  if (pathname === "/s/security") return { titleKey: "s12.title", groupKey: "admin" };
  return null;
}

export default function StaffLayout({ children }: { children: ReactNode }) {
  return (
    <StaffHeaderProvider>
      <StaffFrame>{children}</StaffFrame>
    </StaffHeaderProvider>
  );
}

function StaffFrame({ children }: { children: ReactNode }) {
  const pathname = usePathname();
  const router = useRouter();
  const t = useT();
  const { title: pageTitle, setSearch } = useStaffHeaderState();

  const [me, setMe] = useState<MeResponse | null>(null);
  const [received, setReceived] = useState<number | null>(null);

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

  const roles: Role[] = me?.authenticated && me.user ? (me.user.roles as Role[]) : ["reviewer"];
  const isReviewer = roles.includes("reviewer");

  // The number beside Queue: cases that are received and waiting for a reviewer.
  useEffect(() => {
    if (isSignIn || !isReviewer || !me?.authenticated) return;
    let cancelled = false;
    void (async () => {
      try {
        const res = await api("Q-01", { query: { limit: 1 } });
        if (!cancelled && res.ok) setReceived(res.data.counts.received ?? 0);
      } catch {
        // The count is a convenience. Without it the item shows no number.
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [pathname, isSignIn, isReviewer, me?.authenticated]);

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

  const isCoordinator = roles.includes("coordinator");
  const isModerator = roles.includes("moderator");
  const isOrgAdmin = roles.includes("org_admin");

  const groups = {
    review: t("staff.nav.groups.review"),
    monitor: t("staff.nav.groups.monitor"),
    moderate: t("staff.nav.groups.moderate"),
    admin: t("staff.nav.groups.admin"),
  };

  const nav: StaffNavItem[] = [];
  const add = (item: Omit<StaffNavItem, "current">, current: boolean) => nav.push({ ...item, current });

  if (isReviewer) {
    add(
      {
        href: "/s/queue",
        label: t("staff.nav.queue"),
        icon: InboxIcon,
        group: groups.review,
        count: received ?? undefined,
        countTone: "needs",
      },
      pathname === "/s/queue" || pathname.startsWith("/s/cases"),
    );
  }

  if (isCoordinator) {
    add({ href: "/s/assign", label: t("staff.nav.assign"), icon: UserPlusIcon, group: groups.review }, pathname === "/s/assign");
    add({ href: "/s/ops", label: t("staff.nav.ops"), icon: MapPulseIcon, group: groups.monitor }, pathname === "/s/ops");
    add({ href: "/s/rumours", label: t("staff.nav.rumours"), icon: MegaphoneIcon, group: groups.monitor }, pathname === "/s/rumours");
    add({ href: "/s/publish", label: t("staff.nav.publish"), icon: UploadIcon, group: groups.monitor }, pathname === "/s/publish");
  }

  if (isModerator) {
    add({ href: "/s/discussions", label: t("staff.nav.discussions"), icon: DiscussionIcon, group: groups.moderate }, pathname === "/s/discussions");
  }

  if (isOrgAdmin) {
    add({ href: "/s/admin/codes", label: t("staff.nav.codes"), icon: KeyIcon, group: groups.admin }, pathname === "/s/admin/codes");
    add({ href: "/s/admin/staff", label: t("staff.nav.staff"), icon: UsersIcon, group: groups.admin }, pathname === "/s/admin/staff");
    add({ href: "/s/admin/settings", label: t("staff.nav.settings"), icon: SlidersIcon, group: groups.admin }, pathname === "/s/admin/settings");
  }

  if (isCoordinator || isOrgAdmin) {
    add({ href: "/s/security", label: t("staff.nav.security"), icon: ShieldCheckIcon, group: groups.admin }, pathname === "/s/security");
  }

  // Fallback nav if user has no assigned roles yet
  if (nav.length === 0) {
    add({ href: "/s/queue", label: t("staff.nav.queue"), icon: InboxIcon, group: groups.review }, true);
  }

  const section = sectionOf(pathname);
  const crumbs: StaffCrumb[] = [];
  let title = t("ui.productName");
  if (section) {
    title = t(section.titleKey);
    if (pathname.startsWith("/s/cases")) {
      // The case page: "Queue > EG-..." with a link back, and one title (the reference).
      crumbs.push({ label: t("staff.nav.queue"), href: "/s/queue" });
      if (pageTitle) title = pageTitle;
    } else {
      crumbs.push({ label: groups[section.groupKey as keyof typeof groups] });
    }
  } else {
    title = t("staff.notFound.title");
    crumbs.push({ label: t("staff.nav.queue"), href: "/s/queue" });
  }

  const user = me?.authenticated && me.user ? me.user : null;
  const primaryRole = user ? (["org_admin", "coordinator", "moderator", "reviewer"] as Role[]).find((role) => roles.includes(role)) : undefined;

  return (
    <StaffShell
      nav={nav}
      title={title}
      crumbs={crumbs}
      organisation={user?.organisation.name}
      intake={user ? { paused: user.organisation.intake_paused, href: "/s/admin/settings" } : undefined}
      user={user ? { name: user.display_name ?? user.email ?? t("staff.roles.reviewer"), role: primaryRole ? t(`staff.roles.${primaryRole}`) : "" } : undefined}
      onSignOut={handleSignOut}
      onSearch={(query) => {
        setSearch(query);
        // Reviewers search their own cases in the queue; coordinators search every case on Assign.
        const target = isReviewer ? "/s/queue" : isCoordinator ? "/s/assign" : null;
        if (target && pathname !== target) router.push(target);
      }}
    >
      {children}
    </StaffShell>
  );
}
