"use client";

import { api, resetCsrf } from "../../../../lib/api/client";

/** Set when "clear this phone" ran offline: the server session ends only when AUTH-06 reaches it (O-20). */
export const SIGN_OUT_PENDING = "eg.signOutPending";

/** Send a pending sign-out once the network is back (AUTH-06 is idempotent). */
export async function flushPendingSignOut() {
  try {
    if (window.localStorage.getItem(SIGN_OUT_PENDING) !== "1" || !navigator.onLine) return;
  } catch {
    return;
  }
  resetCsrf();
  const result = await api("AUTH-06", { body: { everywhere: false } });
  if (result.ok || (result.status >= 400 && result.status < 500)) {
    try {
      window.localStorage.removeItem(SIGN_OUT_PENDING);
    } catch {
      // ignore
    }
  }
}
