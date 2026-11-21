"use strict";

const assert = require("node:assert/strict");
const { randomUUID } = require("node:crypto");
const { readFileSync } = require("node:fs");
const { request } = require("playwright");

const origin = new URL(process.env.QA_FRONTEND_ORIGIN);
assert.equal(origin.protocol, "https:");
assert(["localhost", "127.0.0.1"].includes(origin.hostname), "Use an isolated local database and ingress.");
const date = process.env.QA_DATE;
assert(/^\d{4}-\d{2}-\d{2}$/.test(date ?? ""), "Set an unused QA_DATE.");
const evidence = readFileSync(process.env.QA_EVIDENCE_PATH);
assert.equal(evidence.length, 2 * 1024 * 1024, "Use a valid generated PNG exactly 2 MiB long.");

async function post(client, path, payload) {
  const csrf = await client.get("/api/auth/csrf");
  assert.equal(csrf.status(), 200, "CSRF endpoint");
  const { csrfToken } = await csrf.json();
  return client.post(path, {
    ...payload,
    headers: { ...payload.headers, Origin: origin.origin, "X-CSRFToken": csrfToken },
  });
}

async function signIn(client, role) {
  const password = process.env[`QA_${role.toUpperCase()}_PASSWORD`];
  assert(password, "Use the isolated QA account credentials.");
  const response = await post(client, "/api/auth/sign-in", {
    form: { email: `${role}@qa.example`, password },
  });
  assert.equal(response.status(), 200, "HTTPS sign-in");
  const { cookies } = await client.storageState();
  for (const name of ["sessionid", "csrftoken"]) {
    const cookie = cookies.find((entry) => entry.name === name);
    assert(cookie?.secure && cookie.httpOnly, "Session and CSRF cookies must be Secure and HttpOnly.");
  }
}

async function main() {
  const clients = await Promise.all(Array.from({ length: 3 }, () =>
    request.newContext({ baseURL: origin.origin, ignoreHTTPSErrors: false })));
  const [observer, reviewer, admin] = clients;
  try {
    for (const [client, role] of [[observer, "observer"], [reviewer, "reviewer"], [admin, "administrator"]]) {
      await signIn(client, role);
    }
    const period = `/api/dashboard?start=${date}&end=${date}`;
    assert.equal((await (await admin.get(period)).json()).report_count, 0, "Use an unused test date.");
    const key = randomUUID();
    const payload = {
      headers: { "Idempotency-Key": key },
      data: {
        occurred_at: `${date}T00:02:00+01:00`,
        location: "Isolated quality-assurance environment",
        description: "Generated test observation for secure transport verification.",
      },
    };
    const create = await post(observer, "/api/reports", payload);
    assert.equal(create.status(), 201, "New report");
    const { reference } = await create.json();
    const retry = await post(observer, "/api/reports", payload);
    assert.equal(retry.status(), 200, "Idempotent retry");
    assert.equal((await retry.json()).reference, reference);
    const report = `/api/reports/${reference}`;
    const upload = await post(observer, `${report}/attachments`, {
      multipart: { file: { name: "test.png", mimeType: "image/png", buffer: evidence } },
    });
    assert.equal(upload.status(), 201, "Maximum-size image through HTTPS ingress");
    const { id } = await upload.json();
    const file = `${report}/attachments/${id}`;
    assert.equal((await reviewer.get(file)).status(), 404, "Unassigned reviewer");
    assert([403, 404].includes((await admin.get(file)).status()), "Administrator is denied evidence");
    const { reviewers } = await (await admin.get("/api/assignments")).json();
    const assignee = reviewers.find(({ email }) => email === "reviewer@qa.example");
    assert(assignee);
    assert.equal((await post(admin, `/api/assignments/${reference}`, {
      data: { version: 0, reviewer: assignee.id },
    })).status(), 200, "Assignment");
    const download = await reviewer.get(file);
    assert.equal(download.status(), 200, "Assigned reviewer download");
    assert.match(download.headers()["cache-control"], /no-store/);
    assert((await download.body()).equals(evidence), "Compare original bytes through ingress.");
    const path = `/api/review/${reference}/actions`;
    assert.equal((await post(reviewer, path, { data: { version: 1, action: "start" } })).status(), 200);
    assert.equal((await post(reviewer, path, { data: {
      version: 2, action: "close", outcome: "out_of_scope", note: "Synthetic transport test completed.",
    } })).status(), 200);
    const dashboard = await (await admin.get(period)).json();
    assert.equal(dashboard.report_count, 1, "WAT report count");
    assert(!("incident_count" in dashboard), "Report-only mode");
    console.log("HTTPS API acceptance passed, including cookies, CSRF, 2 MiB evidence, role isolation and closure.");
  } finally {
    await Promise.all(clients.map((client) => client.dispose()));
  }
}

main().catch((error) => {
  console.error(`HTTPS API acceptance failed (${error.name})${error.code === "ERR_ASSERTION" ? `: ${error.message}` : "."}`);
  process.exitCode = 1;
});
