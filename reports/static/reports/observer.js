import { post, wat } from "./client.js";

const get = id => document.getElementById(id);
const form = get("report-form");
const retry = get("retry-form");
const code = get("intake");
const keep = get("persist");
const lifetime = 24 * 60 * 60 * 1000;
const lockName = "track5-observer-outbox";
const labels = { received: "Received", in_review: "In review", closed: "Closed" };
const changes = "BroadcastChannel" in window ? new BroadcastChannel(lockName) : null;
let item;
let busy = false;
let panel = "entry";
let expiry;

function setQueue(mode, value) {
  return new Promise((resolve, reject) => {
    const opening = indexedDB.open("track5-observer", 1);
    opening.onupgradeneeded = () => opening.result.createObjectStore("outbox");
    opening.onerror = () => reject(opening.error);
    opening.onsuccess = () => {
      const db = opening.result;
      const tx = db.transaction("outbox", mode === "get" ? "readonly" : "readwrite");
      const store = tx.objectStore("outbox");
      const request = store.get("pending");
      let result;
      request.onsuccess = () => {
        result = request.result;
        if (mode === "put" && (!result || result.expires <= Date.now())) {
          store.put(value, "pending");
          result = value;
        }
        if (mode === "delete" && result?.key === value) store.delete("pending");
      };
      tx.oncomplete = () => { db.close(); resolve(result); };
      tx.onabort = () => { db.close(); reject(tx.error || new Error("Storage interrupted")); };
      db.onversionchange = () => db.close();
    };
  });
}

function withQueueLock(action) {
  if (!navigator.locks) return Promise.reject(new Error("Queue lock unavailable"));
  return navigator.locks.request(lockName, action);
}

function clearEntry() {
  clearTimeout(expiry);
  item = undefined;
  code.value = "";
  form.reset();
}

function expireOrClear(message) {
  clearEntry();
  if (panel !== "status") show("entry");
  get("feedback").textContent = message;
}

function show(section, focus = true) {
  for (const id of ["entry", "pending", "received", "status"]) get(id).hidden = id !== section;
  panel = section;
  if (section !== "received") {
    get("private-receipt").type = "password";
    get("reveal").textContent = "Show code";
  }
  if (section !== "status") {
    get("lookup").value = "";
    get("status-result").textContent = "";
  }
  get("feedback").textContent = "";
  if (focus) get(section).querySelector("h1").focus();
}

function pending(message) {
  show("pending");
  get("pending").querySelector("h1").textContent = item.persist ? "Report queued" : "Report pending";
  const unsupported = item.persist && !navigator.locks;
  retry.querySelector("button").disabled = unsupported;
  get("pending-message").textContent = message ?? (unsupported ?
    "This browser cannot safely retry the saved report. Reopen it in a supported browser session or clear this site's data." :
    item.persist ?
    "Saved on this device. The organisation has not confirmed receipt." :
    "Held in this tab. Keep it open until the organisation confirms receipt.");
}

function watchExpiry() {
  clearTimeout(expiry);
  if (item) expiry = setTimeout(checkExpiry, Math.max(0, item.expires - Date.now()));
}

async function checkExpiry() {
  const expired = item;
  if (!expired || Date.now() < expired.expires) return;
  if (busy) {
    expiry = setTimeout(checkExpiry, 500);
    return;
  }
  const message = "The report expired on this device. A previously sent report may still exist.";
  try {
    if (expired.persist) await withQueueLock(() => setQueue("delete", expired.key));
    changes?.postMessage(expired.key);
    if (item === expired) expireOrClear(message);
  } catch {
    if (item === expired) expireOrClear(message + " Clear this site's data to remove any retained copy.");
  }
}

changes?.addEventListener("message", event => {
  if (item?.persist && item.key === event.data && !busy) {
    expireOrClear("The saved report was sent or removed in another tab.");
  }
});

document.addEventListener("visibilitychange", () => {
  if (!document.hidden) {
    checkExpiry();
    return;
  }
  get("private-receipt").type = "password";
  get("reveal").textContent = "Show code";
  code.value = "";
});

window.addEventListener("pagehide", () => {
  get("private-receipt").value = "";
  get("lookup").value = "";
  get("status-result").textContent = "";
  code.value = "";
  form.reset();
  if (!item?.persist && !busy) clearEntry();
});

window.addEventListener("pageshow", event => {
  if (event.persisted) navigate();
});

form.addEventListener("submit", async event => {
  event.preventDefault();
  if (busy || item) return;
  if (!crypto.randomUUID) {
    get("feedback").textContent = "Open this page over HTTPS to submit a report.";
    return;
  }
  const fields = new FormData(form);
  if (!fields.get("area").trim() || !fields.get("description").trim()) {
    get("feedback").textContent = "Enter an approximate area and a description.";
    return;
  }
  const secret = Array.from(crypto.getRandomValues(new Uint8Array(32)), byte =>
    byte.toString(16).padStart(2, "0")).join("");
  const occurred = fields.get("occurred");
  item = {
    key: crypto.randomUUID(),
    payload: {
      area: fields.get("area").trim(), category: fields.get("category"),
      occurred_at: occurred + "+01:00", firsthand: fields.get("firsthand") === "yes",
      description: fields.get("description").trim(), receipt_secret: secret,
    },
    persist: fields.has("persist"), expires: Date.now() + lifetime,
  };
  if (item.persist) {
    try {
      const stored = await withQueueLock(() => setQueue("put", item));
      if (stored.key !== item.key) {
        item = stored;
        pending("A report is already saved on this device. Finish or remove it before saving another.");
        watchExpiry();
        return;
      }
    }
    catch { item.persist = false; }
  }
  pending();
  watchExpiry();
});

retry.addEventListener("submit", event => {
  event.preventDefault();
  send();
});

async function send() {
  if (!item || busy || !code.value || panel !== "pending") return;
  if (Date.now() >= item.expires) {
    await checkExpiry();
    return;
  }
  const submitted = item;
  const credential = code.value;
  busy = true;
  retry.querySelector("button").disabled = true;
  get("drop").disabled = true;
  get("pending-message").textContent = "Sending report…";
  try {
    let storageError = false;
    const submit = async () => {
      if (submitted.persist) {
        const saved = await setQueue("get");
        if (saved?.key !== submitted.key || Date.now() >= saved.expires) return null;
      }
      const result = await post("/api/reports/", submitted.payload, {
        "Idempotency-Key": submitted.key, "X-Intake-Token": credential,
      }, AbortSignal.timeout?.(15000));
      if (result.ok && result.data.reference && submitted.persist) {
        try {
          await setQueue("delete", submitted.key);
          changes?.postMessage(submitted.key);
        } catch {
          storageError = true;
        }
      }
      return result;
    };
    const result = submitted.persist ? await withQueueLock(submit) : await submit();
    if (!result) {
      if (Date.now() >= submitted.expires) {
        busy = false;
        await checkExpiry();
      } else {
        expireOrClear("The saved report was sent or removed in another tab.");
      }
      return;
    }
    if (!result.ok) {
      if (result.status === 403) code.value = "";
      pending(result.data.error || (result.status === 429 ?
        "Too many attempts. Wait before retrying this report." :
        "Receipt could not be confirmed. Retry when connected."));
      return;
    }
    if (!result.data.reference) throw new Error("Missing acknowledgement");
    clearEntry();
    get("private-receipt").type = "password";
    get("reveal").textContent = "Show code";
    get("copy").textContent = "Copy code";
    get("private-receipt").value = submitted.payload.receipt_secret;
    get("received-reference").textContent = "Reference " + result.data.reference;
    show("received");
    if (storageError) {
      get("feedback").textContent = "The organisation received this report. Save the receipt, then clear this site's data to remove any retained copy.";
    }
  } catch {
    pending("Receipt could not be confirmed. Retry with the same report when connected.");
  } finally {
    busy = false;
    retry.querySelector("button").disabled = false;
    get("drop").disabled = false;
  }
}

window.addEventListener("online", send);
get("drop").addEventListener("click", async () => {
  if (!item || busy || !confirm("Remove this report from this device? If it already reached the organisation, this will not withdraw it.")) return;
  const removing = item;
  busy = true;
  retry.querySelector("button").disabled = true;
  get("drop").disabled = true;
  get("pending-message").textContent = "Removing the local copy…";
  try {
    if (removing.persist) await withQueueLock(() => setQueue("delete", removing.key));
    changes?.postMessage(removing.key);
    clearEntry();
    show("entry");
  } catch {
    pending("The stored report could not be removed. Try again or clear this site's data.");
  } finally {
    busy = false;
    retry.querySelector("button").disabled = false;
    get("drop").disabled = false;
  }
});

get("reveal").addEventListener("click", event => {
  const receipt = get("private-receipt");
  receipt.type = receipt.type === "password" ? "text" : "password";
  event.target.textContent = receipt.type === "password" ? "Show code" : "Hide code";
});
get("copy").addEventListener("click", async event => {
  try {
    await navigator.clipboard.writeText(get("private-receipt").value);
    event.target.textContent = "Copied";
  } catch {
    get("feedback").textContent = "Show the code to copy it manually.";
  }
});
get("use-receipt").addEventListener("click", () => {
  get("lookup").value = get("private-receipt").value;
  if (location.hash === "#status") show("status");
});
get("another").addEventListener("click", () => {
  get("private-receipt").value = "";
  get("lookup").value = "";
  get("copy").textContent = "Copy code";
  show("entry");
});
get("status-form").addEventListener("submit", async event => {
  event.preventDefault();
  const button = event.currentTarget.querySelector("button");
  const output = get("status-result");
  button.disabled = true;
  output.textContent = "Checking status…";
  try {
    const result = await post("/api/receipt/", { receipt_secret: get("lookup").value.trim().toLowerCase() },
      {}, AbortSignal.timeout?.(15000));
    output.textContent = result.ok ?
      labels[result.data.status] + " · " + wat(result.data.received_at) + " · " + result.data.reference :
      result.data.error || "Status is temporarily unavailable.";
  } catch { output.textContent = "Connect to the internet to check the status."; }
  finally { button.disabled = false; }
});
function navigate() {
  if (location.hash === "#status") show("status");
  else if (item) pending();
  else show(get("private-receipt").value ? "received" : "entry");
}
get("status-link").addEventListener("click", () => {
  if (location.hash === "#status") show("status");
});
window.addEventListener("hashchange", navigate);

if ("serviceWorker" in navigator) navigator.serviceWorker.register("/service-worker.js").catch(() => {});
if (!navigator.locks && keep) {
  keep.disabled = true;
  get("persist-help").textContent = "This browser cannot safely save a queued report. Keep this tab open until it is sent.";
}
try {
  const stored = await setQueue("get");
  if (!item && stored?.expires > Date.now()) { item = stored; watchExpiry(); }
  else if (stored?.expires <= Date.now()) await withQueueLock(() => setQueue("delete", stored.key));
} catch {
  // The form remains usable without persistent storage.
}
form.querySelector("button").disabled = false;
if (item || location.hash) navigate();
