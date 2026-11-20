{% load static %}
const prefix = "track5-shell-";
const name = prefix + "v2";
const shell = ["/", "{% static 'reports/style.css' %}", "{% static 'reports/observer.js' %}", "{% static 'reports/client.js' %}"];
self.addEventListener("install", event => {
  event.waitUntil(caches.open(name).then(cache => cache.addAll(shell)));
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
  event.respondWith(fetch(event.request).catch(async () => {
    const cache = await caches.open(name);
    return await cache.match(url.pathname) || Response.error();
  }));
});
