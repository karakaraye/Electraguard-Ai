const assert = require("node:assert/strict");
const { randomUUID } = require("node:crypto");
const { readFileSync } = require("node:fs");
const { request } = require("playwright");

process.loadEnvFile(".env");
const baseURL = new URL(process.env.QA_FRONTEND_ORIGIN || "http://localhost:3000").origin;
assert(["localhost", "127.0.0.1"].includes(new URL(baseURL).hostname), "Use an isolated local demo.");

async function write(client, path, options) {
  const csrf = await client.get("/api/auth/csrf");
  assert.equal(csrf.status(), 200);
  const { csrfToken } = await csrf.json();
  return client.post(path, {
    ...options,
    headers: { ...options.headers, Origin: baseURL, "X-CSRFToken": csrfToken },
  });
}

async function signIn(role) {
  const client = await request.newContext({ baseURL });
  const response = await write(client, "/api/auth/sign-in", {
    form: { email: role + "@demo.example", password: process.env["DEMO_" + role.toUpperCase() + "_PASSWORD"] },
  });
  assert.equal(response.status(), 200);
  return client;
}

async function run() {
  const clients = await Promise.all(["observer", "reviewer", "administrator"].map(signIn));
  const [observer, reviewer, administrator] = clients;
  try {
    const dashboard = "/api/dashboard?start=2026-03-12&end=2026-03-12";
    assert.equal((await (await administrator.get(dashboard)).json()).report_count, 1);
    const submission = await write(observer, "/api/reports", {
      headers: { "Idempotency-Key": randomUUID() },
      data: {
        occurred_at: "2026-03-12T09:05:00+01:00", location: "Fictional Cedar Training Hall",
        description: "A crate blocked the ramp and wheelchair users could not enter.",
      },
    });
    assert.equal(submission.status(), 201);
    const { reference } = await submission.json();
    const reportPath = "/api/reports/" + reference;
    const upload = await write(observer, reportPath + "/attachments", {
      multipart: {
        file: {
          name: "synthetic-evidence.png", mimeType: "image/png",
          buffer: readFileSync("demo/synthetic-evidence.png"),
        },
      },
    });
    assert.equal(upload.status(), 201);
    const { id } = await upload.json();
    const { reviewers } = await (await administrator.get("/api/assignments")).json();
    const assignee = reviewers.find(({ email }) => email === "reviewer@demo.example");
    assert.equal((await write(administrator, "/api/assignments/" + reference, {
      data: { reviewer: assignee.id, version: 0 },
    })).status(), 200);
    const casePath = "/api/review/" + reference;
    assert.equal((await reviewer.get(reportPath + "/attachments/" + id)).status(), 200);
    assert.equal((await (await reviewer.get(casePath + "/triage")).json()).status, "pending");
    assert.equal((await write(reviewer, casePath + "/actions", { data: { version: 1, action: "start" } })).status(), 200);
    assert.equal((await write(reviewer, casePath + "/actions", {
      data: { version: 2, action: "request_clarification", note: "Which entrance was blocked?" },
    })).status(), 200);
    assert.equal((await write(observer, reportPath + "/clarification", {
      data: { version: 3, note: "The east entrance ramp." },
    })).status(), 200);
    assert.equal((await write(reviewer, casePath + "/actions", {
      data: {
        version: 4, action: "close", outcome: "corroborated",
        note: "The fictional illustration and clarification support the account of a blocked east entrance ramp.",
      },
    })).status(), 200);
    const detail = await (await reviewer.get(casePath)).json();
    assert.deepEqual(detail.history.find(({ action }) => action === "close").change.attachment_ids, [id]);
    const results = await (await administrator.get(dashboard)).json();
    assert.equal(results.report_count, 2);
    assert(!("incident_count" in results));
    assert.deepEqual(results.statuses.filter(({ count }) => count), [
      { label: "Submitted", count: 1 }, { label: "Closed", count: 1 },
    ]);
    assert.deepEqual(results.outcomes.filter(({ count }) => count), [
      { label: "Corroborated by available evidence", count: 1 },
    ]);
    console.log("March worker-off demo API rehearsal passed: 2 reports, 1 Submitted, 1 Closed, 1 Corroborated.");
  } finally {
    await Promise.all(clients.map((client) => client.dispose()));
  }
}

run().catch((error) => {
  console.error(error.message);
  process.exitCode = 1;
});
