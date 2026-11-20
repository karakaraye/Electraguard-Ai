{% load static %}
const prefix = "track5-shell-";
const name = prefix + "v3";
const shell = ["/", "{% static 'reports/style.css' %}", "{% static 'reports/observer.js' %}", "{% static 'reports/client.js' %}"]
  .map(path => new URL(path, self.location.origin))
  .filter(url => url.origin === self.location.origin && !url.search && !url.hash)
  .map(url => url.pathname);
self.addEventListener("install", event => {
  event.waitUntil(caches.open(name).then(cache => cache.addAll(shell.map(path =>
    new Request(path, { credentials: "omit", redirect: "error", cache: "no-store" })
  ))));
});
self.addEventListener("activate", event => {
  event.waitUntil(caches.keys().then(keys => Promise.all(
    keys.filter(key => key.startsWith(prefix) && key !== name).map(key => caches.delete(key))
  )).then(() => self.clients.claim()));
});
self.addEventListener("fetch", event => {
  const url = new URL(event.request.url);
  if (event.request.method !== "GET" || url.origin !== self.location.origin ||
      url.search || !shell.includes(url.pathname)) return;
  event.respondWith((async () => {
    const cache = await caches.open(name);
    return await cache.match(url.pathname) ||
      fetch(url.pathname, { credentials: "omit", redirect: "error", cache: "no-store" });
  })());
});
