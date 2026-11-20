import { post, wat } from "./client.js";

const get = id => document.getElementById(id);
const form = get("report-form");
const retry = get("retry-form");
const code = get("intake");
const lifetime = 24 * 60 * 60 * 1000;
const labels = { received: "Received", in_review: "In review", closed: "Closed" };
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
      tx.onabort = () => { db.close(); reject(tx.error); };
    };
  });
}

function show(section, focus = true) {
  for (const id of ["entry", "pending", "received", "status"]) get(id).hidden = id !== section;
  panel = section;
  get("feedback").textContent = "";
  if (focus) get(section).querySelector("h1").focus();
}

function pending(message) {
  show("pending");
  get("pending").querySelector("h1").textContent = item.persist ? "Report queued" : "Report pending";
  get("pending-message").textContent = message ?? (item.persist ?
    "Saved on this device. The organisation has not confirmed receipt." :
    "Held in this tab. Keep it open until the organisation confirms receipt.");
}

function watchExpiry() {
  clearTimeout(expiry);
  if (!item?.persist) return;
  expiry = setTimeout(async () => {
    const stored = await setQueue("get").catch(() => null);
    if (stored?.key === item?.key && Date.now() >= stored.expires && !busy) {
      await setQueue("delete", stored.key).catch(() => {});
      item = undefined;
      show("entry");
      get("feedback").textContent = "The report expired on this device. Check any receipt you saved or file again.";
    } else if (busy) {
      expiry = setTimeout(watchExpiry, 500);
    }
  }, Math.max(0, item.expires - Date.now()));
}

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
      const stored = await setQueue("put", item);
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
  if (item.persist && Date.now() >= item.expires) {
    watchExpiry();
    return;
  }
  const submitted = item;
  busy = true;
  retry.querySelector("button").disabled = true;
  get("drop").disabled = true;
  get("pending-message").textContent = "Sending report…";
  try {
    const result = await post("/api/reports/", submitted.payload, {
      "Idempotency-Key": submitted.key, "X-Intake-Token": code.value,
    });
    if (!result.ok) {
      if (result.status === 403) code.value = "";
      pending(result.data.error || "Receipt could not be confirmed. Retry when connected.");
      return;
    }
    if (!result.data.reference) throw new Error("Missing acknowledgement");
    if (submitted.persist) await setQueue("delete", submitted.key).catch(() => {});
    clearTimeout(expiry);
    item = undefined;
    code.value = "";
    form.reset();
    get("private-receipt").type = "password";
    get("reveal").textContent = "Show code";
    get("private-receipt").value = submitted.payload.receipt_secret;
    get("received-reference").textContent = "Reference " + result.data.reference;
    show("received");
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
  try {
    if (item.persist) await setQueue("delete", item.key);
    item = undefined;
    clearTimeout(expiry);
    code.value = "";
    form.reset();
    show("entry");
  } catch {
    get("feedback").textContent = "The stored report could not be removed. Try again.";
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
    const result = await post("/api/receipt/", { receipt_secret: get("lookup").value.trim().toLowerCase() });
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
try {
  const stored = await setQueue("get");
  if (!item && stored?.expires > Date.now()) { item = stored; watchExpiry(); }
  else if (stored?.expires <= Date.now()) await setQueue("delete", stored.key);
} catch {
  // The form remains usable without persistent storage.
}
if (item || location.hash) navigate();
