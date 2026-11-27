"use client";

/**
 * The one shell for every observer screen: the app bar (Back, centred title, Menu / Close / Done),
 * the menu sheet and, on the places an observer goes all day, the bottom bar.
 *
 * - Menu: signed-in screens outside the report flow. Opens the menu sheet.
 * - Close: inside the 7-step report flow (pass `onClose`). Replaces Menu.
 * - Done: on receipts (pass `done`). Replaces Menu and Back.
 * - Bottom bar: pass `tab` ("home" | "reports" | "messages" | "other"). Left out in the flow, on
 *   receipts, before sign-in and on screens that pin an action.
 */

import { useState, type ReactNode } from "react";
import { useT } from "../../../../lib/i18n/client";
import { AppShell, BottomNav, type AppShellProps } from "../../../../ui";
import { FileIcon, HomeIcon, MessageIcon, PlusIcon } from "../../../../ui/icons";
import { Sheet } from "../../../../ui/Sheet/Sheet";
import { useNavCounts, type NavCounts } from "../_lib/navCounts";
import { useObserverSession } from "../_lib/session";
import { ObserverMenu } from "./ObserverMenu";

export type ObserverTab = "home" | "reports" | "messages" | "other";

export type ObserverShellProps = Omit<AppShellProps, "onMenu" | "menu" | "bottomNav"> & {
  /** Show the bottom bar, with this place marked current ("other": none is current). */
  tab?: ObserverTab;
  /** Hide the Menu button on a signed-in screen. */
  noMenu?: boolean;
  /** For previews and Home: the signed-in code and unit, instead of reading the session. */
  menuCode?: string;
  menuUnit?: string | null;
  /** For previews and Home: Messages counts, instead of the shared ones. */
  counts?: NavCounts;
  children?: ReactNode;
};

export function ObserverShell({ tab, noMenu, menuCode, menuUnit, counts, onClose, done, actions, children, ...rest }: ObserverShellProps) {
  const t = useT();
  const { session } = useObserverSession();
  const [menu, setMenu] = useState(false);
  const code = menuCode ?? session?.code;
  const showMenu = !noMenu && !onClose && !done && Boolean(code);
  const showBar = tab !== undefined && Boolean(code) && !actions && !onClose && !done;
  const shared = useNavCounts(showBar && !counts);
  const messages = counts ? counts.questions + counts.unread : shared.questions + shared.unread;

  const bar = showBar ? (
    <BottomNav
      label={t("ui.nav.main")}
      items={[
        { href: "/o", label: t("common.home"), icon: <HomeIcon />, current: tab === "home" },
        { href: "/o/new/what", label: t("ui.nav.report"), icon: <PlusIcon />, primary: true },
        { href: "/o/reports", label: t("o04.myReports"), icon: <FileIcon />, current: tab === "reports" },
        {
          href: "/o/messages",
          label: t("o04.messages"),
          icon: <MessageIcon />,
          current: tab === "messages",
          badge: messages,
          badgeLabel: t("ui.nav.needYou", { count: messages }),
        },
      ]}
    />
  ) : undefined;

  return (
    <AppShell {...rest} onClose={onClose} done={done} actions={actions} onMenu={showMenu ? () => setMenu(true) : undefined} bottomNav={bar}>
      {children}
      {showMenu ? (
        <Sheet open={menu} onClose={() => setMenu(false)} title={t("ui.menu")} data-testid="o04-menu">
          <ObserverMenu code={code} unitLabel={menuUnit} onNavigate={() => setMenu(false)} />
        </Sheet>
      ) : null}
    </AppShell>
  );
}
