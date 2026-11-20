import { readFile } from "node:fs/promises";
import { runInNewContext } from "node:vm";
import assert from "node:assert/strict";

const source = (await readFile(new URL("../reports/templates/reports/sw.js", import.meta.url), "utf8"))
  .replace("{% load static %}", "").replace(/\{% static '([^']+)' %\}/g, "/static/$1");
const listeners = new Map();
const origin = "http://localhost:8765";
let stored;
const removed = [];
const stale = "track5-shell-retired";
let current;
const cache = { addAll(requests) { stored = requests; }, match(path) { return "cached:" + path; } };
runInNewContext(source, {
  URL, Request: class extends Request { constructor(path, options) { super(new URL(path, origin), options); } },
  self: { location: { origin }, addEventListener: (type, listener) => listeners.set(type, listener),
    clients: { claim() {} } },
  caches: { open: async key => { current = key; return cache; }, keys: async () => [stale, current, "unrelated"],
    delete: async key => removed.push(key) },
  fetch() { throw new Error("Cached shell unexpectedly used network"); }
});
async function finish(type) {
  let awaiting;
  listeners.get(type)({ waitUntil: work => awaiting = work });
  await awaiting;
}
await finish("install");
assert.equal(stored.length, 4);
assert.equal(stored.every(request => request.credentials === "omit" && request.redirect === "error" && request.cache === "no-store"), true);
await finish("activate");
assert.deepEqual(removed, [stale]);
async function handle(method, url) {
  let result;
  listeners.get("fetch")({request: {method, url}, respondWith: response => result = response});
  return await result;
}
for (const [method, url] of [
  ["POST", origin + "/"],
  ["GET", origin + "/?private=1"],
  ["GET", origin + "/api/csrf/"],
  ["GET", origin + "/review/"],
  ["GET", "https://example.invalid/"],
]) {
  assert.equal(await handle(method, url), undefined);
}
assert.equal(await handle("GET", origin + "/"), "cached:/");
assert.equal(await handle("GET", origin + "/static/reports/client.js"), "cached:/static/reports/client.js");
console.log("Verified offline allowlist, credential-free cache installation and selective version cleanup.");
