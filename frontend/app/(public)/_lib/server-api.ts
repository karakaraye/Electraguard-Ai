import { apiOrigin } from "../../../lib/api-origin";
import { API_BASE } from "../../../lib/api/contracts";

/**
 * Server-side reads for the public pages (PUB-02, REP-06, GUIDE-01). Public pages are
 * server rendered so a 2G phone gets finished HTML; the browser never waits for a
 * second round trip. Every failure resolves (never throws) to one shape, so each page
 * can show an honest state: `not_found` (404, which includes an endpoint that is not
 * deployed yet), `network_error` (no answer), or the contract error code.
 */
export type ServerResult<T> =
  | { ok: true; data: T }
  | { ok: false; status: number; code: string; retryAfter: number | null };

export async function publicGet<T>(
  path: string,
  options: { language?: string; revalidate?: number; query?: Record<string, string | undefined> } = {},
): Promise<ServerResult<T>> {
  const search = new URLSearchParams();
  for (const [key, value] of Object.entries(options.query ?? {})) if (value) search.set(key, value);
  const qs = search.toString();
  const url = `${apiOrigin}${API_BASE}${path}${qs ? `?${qs}` : ""}`;
  try {
    const response = await fetch(url, {
      headers: { Accept: "application/json", "Accept-Language": options.language ?? "en" },
      cache: "no-store",
      signal: AbortSignal.timeout(8_000),
    });
    if (response.ok) return { ok: true, data: (await response.json()) as T };
    let code = response.status === 404 ? "not_found" : response.status >= 500 ? "service_unavailable" : "bad_request";
    try {
      const body = (await response.json()) as { error?: { code?: string } };
      if (body?.error?.code) code = body.error.code;
    } catch {
      // Not JSON (for example a proxy error page): keep the status-based code.
    }
    const after = Number(response.headers.get("Retry-After"));
    return { ok: false, status: response.status, code, retryAfter: Number.isFinite(after) && after > 0 ? after : null };
  } catch {
    return { ok: false, status: 0, code: "network_error", retryAfter: null };
  }
}
