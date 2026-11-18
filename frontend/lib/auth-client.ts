export async function csrfPost(path: string, body?: BodyInit, headers?: HeadersInit) {
  const csrf = await fetch("/api/auth/csrf", { cache: "no-store" });
  if (!csrf.ok) throw new Error("Could not initialize the session.");
  const { csrfToken } = await csrf.json();
  const requestHeaders = new Headers(headers);
  requestHeaders.set("X-CSRFToken", csrfToken);
  return fetch(path, {
    method: "POST",
    headers: requestHeaders,
    body,
  });
}

export function authPost(action: "sign-in" | "sign-out", body?: URLSearchParams) {
  return csrfPost(`/api/auth/${action}`, body);
}
