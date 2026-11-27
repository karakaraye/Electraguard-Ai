/*
 * ElectraGuard AI service worker (hand-written, no framework).
 *
 * - App shell: the observer pages are fetched at install, and every script,
 *   style and font they reference is cached, so the app opens without network.
 * - Message files: Next.js ships them as script chunks; every /_next/static
 *   file is cached on first use (cache first, names are content hashed).
 * - Polling-unit lists (REF-01): stale-while-revalidate, ETag aware.
 * - Report data and every other API response are never cached (contract 1.8).
 * - Offline fallback: a small page in the five languages.
 */

const VERSION = "v6";
const SHELL = `eg-shell-${VERSION}`;
const STATIC = `eg-static-${VERSION}`;
const REFERENCE = `eg-reference-${VERSION}`;
const KEEP = [SHELL, STATIC, REFERENCE];

const SHELL_PAGES = [
  "/o",
  "/o/start",
  "/o/new/what",
  "/o/new/danger",
  "/o/new/where",
  "/o/new/when",
  "/o/new/describe",
  "/o/new/evidence",
  "/o/new/check",
  // Check-in answers work offline: keep the Messages and answer screens (any id uses the same script files).
  "/o/messages",
  "/o/checkin/offline",
];
const SHELL_FILES = [
  "/fonts/noto-sans-latin.woff2",
  "/fonts/noto-sans-latin-ext.woff2",
  "/fonts/noto-sans-display-latin.woff2",
  "/fonts/noto-sans-display-latin-ext.woff2",
  "/fonts/noto-sans-display-marks.woff2",
  "/icon.svg",
  "/manifest.webmanifest",
];

const OFFLINE_TEXT = [
  ["en", "Offline. Reports will send when you have network.", "Try again"],
  ["pcm", "Network no dey. Your reports go send when network come.", "Try again"],
  ["ha", "Babu sabis. Za a aika rahotanni idan ka samu sabis.", "Sake gwadawa"],
  ["yo", "Kò sí nẹ́tíwọ̀ọ̀kì. A ó fi àwọn ìròyìn ránṣẹ́ nígbà tí o bá ní nẹ́tíwọ̀ọ̀kì.", "Gbìyànjú lẹ́ẹ̀kan sí i"],
  ["ig", "Enweghị netwọk. Akụkọ ga-aga mgbe i nwere netwọk.", "Nwaa ọzọ"],
];

function offlinePage() {
  const items = OFFLINE_TEXT.map(([lang, text]) => `<li lang="${lang}">${text}</li>`).join("");
  const html = `<!doctype html><html lang="en"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"><title>ElectraGuard AI</title>
<style>:root{color-scheme:light dark}body{margin:0;font:400 1.125rem/1.5 system-ui,sans-serif;background:#fff;color:#0b0b0c}
main{max-width:34rem;margin:0 auto;padding:32px 16px}h1{font:700 1.625rem/1.2 system-ui,sans-serif;margin:0 0 24px}ul{padding:0;list-style:none;display:grid;gap:16px}
li{padding-bottom:16px;border-bottom:1px solid #d8d8d4}a{display:flex;align-items:center;justify-content:center;min-height:52px;border-radius:10px;background:#0b0b0c;color:#fff;font-weight:600;text-decoration:none}
@media (prefers-color-scheme:dark){body{background:#111112;color:#f4f4f2}li{border-color:#34343a}a{background:#f4f4f2;color:#111112}}</style></head>
<body><main><h1>ElectraGuard AI</h1><ul>${items}</ul><a href="/o">${OFFLINE_TEXT.map((t) => t[2]).filter((v, i, a) => a.indexOf(v) === i).join(" · ")}</a></main></body></html>`;
  return new Response(html, { status: 503, headers: { "Content-Type": "text/html; charset=utf-8", "Cache-Control": "no-store" } });
}

/** Put one /_next/static file in the cache (if missing) and return its text when it is a script. */
async function cacheStatic(statics, asset) {
  try {
    let file = await statics.match(asset);
    if (!file) {
      file = await fetch(asset);
      if (!file.ok) return "";
      await statics.put(asset, file.clone());
    }
    return asset.endsWith(".js") ? await file.text() : "";
  } catch {
    return ""; // Cached later on first use.
  }
}

/**
 * Cache a page, every /_next/static file it references, and the chunks those
 * scripts load on demand ("static/chunks/….js" in the bundle): the message
 * files of the other four languages are such chunks, and a phone that has
 * never been online in Hausa must still be able to switch to Hausa offline.
 */
async function cachePage(path, seen) {
  const response = await fetch(path, { credentials: "same-origin", cache: "no-cache" });
  if (!response.ok) return;
  const html = await response.clone().text();
  const shell = await caches.open(SHELL);
  await shell.put(path, response);
  const statics = await caches.open(STATIC);
  async function visit(asset) {
    if (seen.has(asset)) return;
    seen.add(asset);
    const source = await cacheStatic(statics, asset);
    const chunks = source.match(/static\/chunks\/[^"'\s\\,:;]+\.(?:js|css)/g) || [];
    await Promise.all(chunks.map((chunk) => visit(`/_next/${chunk}`)));
    // The webpack runtime names on-demand chunks from a table ("static/chunks/"+id+"."+{id:hash}[id]+".js"),
    // so their file names never appear whole: read the table, or the message files would not be cached.
    const named = [];
    for (const table of source.matchAll(/"static\/chunks\/"\s*\+\s*\w+\s*\+\s*"\."\s*\+\s*\(?\{([^}]*)\}\)?\[\w+\]\s*\+\s*"\.js"/g)) {
      for (const [, id, hash] of table[1].matchAll(/["']?(\d+)["']?:\s*"([0-9a-f]+)"/g)) named.push(`/_next/static/chunks/${id}.${hash}.js`);
    }
    await Promise.all(named.map(visit));
  }
  // Route groups put parentheses in chunk paths, for example
  // /_next/static/chunks/app/(observer)/o/page-….js, so ")" is allowed inside a path;
  // only an unbalanced trailing ")" (the end of a CSS url(…)) is dropped.
  const assets = (html.match(/\/_next\/static\/[^"'\s\\{};]+/g) || []).map(trimUnbalanced);
  await Promise.all(assets.map(visit));
}

/** "/a/(b)/c.js)" becomes "/a/(b)/c.js": closing parentheses with no opening one are dropped. */
function trimUnbalanced(path) {
  let out = path;
  const count = (text, char) => text.split(char).length - 1;
  while (out.endsWith(")") && count(out, ")") > count(out, "(")) out = out.slice(0, -1);
  return out;
}

self.addEventListener("install", (event) => {
  event.waitUntil(
    (async () => {
      const shell = await caches.open(SHELL);
      await Promise.all(SHELL_FILES.map((file) => shell.add(file).catch(() => undefined)));
      const seen = new Set();
      await Promise.all(SHELL_PAGES.map((page) => cachePage(page, seen).catch(() => undefined)));
      await self.skipWaiting();
    })(),
  );
});

self.addEventListener("activate", (event) => {
  event.waitUntil(
    (async () => {
      for (const name of await caches.keys()) if (!KEEP.includes(name)) await caches.delete(name);
      await self.clients.claim();
    })(),
  );
});

function withTimeout(promise, ms) {
  return Promise.race([promise, new Promise((_, reject) => setTimeout(() => reject(new Error("timeout")), ms))]);
}

/** Pages: network first (4 s on 2G before falling back), then the cached page, then the offline page. */
async function page(request) {
  const url = new URL(request.url);
  try {
    const response = await withTimeout(fetch(request), 4000);
    if (response.ok && SHELL_PAGES.includes(url.pathname)) {
      const shell = await caches.open(SHELL);
      await shell.put(url.pathname, response.clone());
    }
    return response;
  } catch {
    const shell = await caches.open(SHELL);
    return (await shell.match(url.pathname)) || offlinePage();
  }
}

async function cacheFirst(request, name) {
  const cache = await caches.open(name);
  const hit = await cache.match(request);
  if (hit) return hit;
  const response = await fetch(request);
  if (response.ok) await cache.put(request, response.clone());
  return response;
}

async function staleWhileRevalidate(request) {
  const cache = await caches.open(REFERENCE);
  const hit = await cache.match(request);
  const refresh = fetch(request)
    .then(async (response) => {
      if (response.status === 200) await cache.put(request, response.clone());
      return response;
    })
    .catch(() => undefined);
  if (hit) {
    refresh.catch(() => undefined);
    return hit;
  }
  return (await refresh) || new Response(JSON.stringify({ error: { code: "service_unavailable", message: "Offline" } }), { status: 503, headers: { "Content-Type": "application/json" } });
}

self.addEventListener("fetch", (event) => {
  const request = event.request;
  if (request.method !== "GET") return;
  const url = new URL(request.url);
  if (url.origin !== self.location.origin) return;

  if (request.mode === "navigate") {
    if (url.pathname === "/o" || url.pathname.startsWith("/o/")) event.respondWith(page(request));
    return;
  }
  if (url.pathname.startsWith("/_next/static/")) {
    event.respondWith(cacheFirst(request, STATIC));
    return;
  }
  // The app sends If-None-Match itself; let those reach the server so a 304 comes back as it should.
  if (url.pathname.startsWith("/api/v1/reference/areas") && !request.headers.get("If-None-Match")) {
    event.respondWith(staleWhileRevalidate(request));
    return;
  }
  if (SHELL_FILES.includes(url.pathname) || url.pathname.startsWith("/fonts/") || url.pathname.startsWith("/icons/") || url.pathname.startsWith("/art/observer/")) {
    event.respondWith(cacheFirst(request, SHELL));
  }
  // Everything else (report data, sessions) goes straight to the network and is never stored.
});
