"use client";

import { useRouter } from "next/navigation";
import { useTransition } from "react";
import { LanguageSwitcher } from "../../../ui/LanguageSwitcher/LanguageSwitcher";

/**
 * The compact language choice. The public pages are rendered on the server, so after
 * the choice is stored (localStorage and cookie) the page is fetched again in the new
 * language.
 */
export function LanguageMenu() {
  const router = useRouter();
  const [pending, start] = useTransition();
  return (
    <div aria-busy={pending || undefined}>
      <LanguageSwitcher variant="compact" onChanged={() => start(() => router.refresh())} data-testid="public-language" />
    </div>
  );
}
