export async function post(path, body, headers = {}, signal) {
  const csrf = await fetch("/api/csrf/", { cache: "no-store", signal });
  if (!csrf.ok) throw new Error("Could not establish a connection.");
  const { token } = await csrf.json();
  const response = await fetch(path, {
    method: "POST",
    cache: "no-store",
    signal,
    headers: { "Content-Type": "application/json", "X-CSRFToken": token, ...headers },
    body: JSON.stringify(body),
  });
  const data = await response.json().catch(() => ({}));
  return { status: response.status, ok: response.ok, data };
}

export function wat(iso) {
  return new Intl.DateTimeFormat("en-NG", {
    dateStyle: "medium", timeStyle: "short", timeZone: "Africa/Lagos",
  }).format(new Date(iso)) + " WAT";
}

export function node(tag, value, className) {
  const element = document.createElement(tag);
  element.textContent = value;
  if (className) element.className = className;
  return element;
}
