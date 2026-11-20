import { post, wat, node } from "./client.js";

const get = id => document.getElementById(id);
const labels = { received: "Received", in_review: "In review", closed: "Closed" };
const reasons = { review_started: "Review started", corroborated: "Corroborated for internal follow-up",
  insufficient_information: "Insufficient information", out_of_scope: "Out of scope",
  assignment_changed: "Assignee changed", reports_linked: "Reports linked", reports_separate: "Kept reports separate" };
const outcomes = ["corroborated", "insufficient_information", "out_of_scope"];
const categories = { access: "Access or accessibility", materials: "Materials or equipment",
  procedure: "Process or procedure", conduct: "Conduct or safety", other: "Other or unsure" };
let reports = [];
let selected;
let generation = 0;
let busy = false;
let searchTimer;

async function load() {
  const request = ++generation;
  const params = new URLSearchParams({ q: get("search").value, status: get("filter").value });
  if (get("assignment-filter")) params.set("unassigned", get("assignment-filter").value);
  get("queue-feedback").textContent = "Loading reports…";
  try {
    const response = await fetch("/api/review/?" + params, { cache: "no-store" });
    if (!response.ok) throw new Error(response.status === 403 ? "Review access is required." : "Could not load the queue.");
    const data = await response.json();
    if (request !== generation) return;
    reports = data.reports;
    if (!reports.some(report => report.reference === selected)) selected = reports[0]?.reference;
    get("queue-feedback").textContent = reports.length === 50 ? "Showing the latest 50 matching reports." :
      reports.length ? "" : "No reports match these filters.";
    render();
  } catch (error) {
    if (request === generation) get("queue-feedback").textContent = error.message;
  }
}

function render() {
  const list = get("report-list");
  list.replaceChildren();
  for (const report of reports) {
    const li = document.createElement("li");
    const button = node("button", "", "report-row");
    button.setAttribute("aria-current", String(report.reference === selected));
    const meta = node("span", report.reference.slice(0, 8));
    meta.append(node("small", labels[report.status]));
    button.append(meta, node("span", categories[report.category]));
    button.addEventListener("click", () => {
      selected = report.reference;
      for (const row of list.querySelectorAll("button")) row.setAttribute("aria-current", String(row === button));
      detail(report);
    });
    li.append(button);
    list.append(li);
  }
  detail(reports.find(report => report.reference === selected));
}

function detail(report) {
  const target = get("selected");
  target.replaceChildren();
  if (!report) return;
  target.append(
    node("h2", categories[report.category]),
    node("p", report.area + " · " + wat(report.occurred_at), "muted"),
    node("p", report.firsthand ? "Firsthand observation" : "Reported by someone else", "muted"),
    node("p", report.description),
  );
  if (get("assignment-filter")) {
    assignment(target, report);
    return;
  }
  const related = node("div", "");
  target.append(related);
  loadRelated(related, report);
  if (report.status !== "closed" && report.can_review) {
    const action = document.createElement("form");
    const closer = report.status === "in_review";
    if (closer) {
      const label = node("label", "Review outcome");
      label.htmlFor = "outcome";
      const select = document.createElement("select");
      select.name = "outcome";
      select.id = "outcome";
      select.required = true;
      for (const value of ["", ...outcomes]) {
        const option = node("option", reasons[value] || "Choose an outcome");
        option.value = value;
        select.append(option);
      }
      action.append(label, select);
    }
    const button = node("button", closer ? "Record outcome" : "Start review", "primary");
    const controls = node("div", "", "actions");
    controls.append(button);
    action.append(controls);
    action.addEventListener("submit", event => {
      event.preventDefault();
      const payload = { action: closer ? "close" : "start", version: report.version };
      if (closer) payload.reason = new FormData(action).get("outcome");
      update("/api/review/" + report.reference + "/", payload, button);
    });
    target.append(action);
  }
  const history = document.createElement("details");
  const content = node("ol", "", "history");
  history.append(node("summary", "View history"), content);
  history.addEventListener("toggle", async () => {
    if (!history.open) return;
    content.replaceChildren(node("li", "Loading history…"));
    try {
      const response = await fetch("/api/review/" + report.reference + "/", { cache: "no-store" });
      if (!response.ok) throw new Error();
      const data = await response.json();
      content.replaceChildren(node("li", "Received · " + wat(report.received_at)),
        ...data.events.map(event => {
          const row = node("li", (reasons[event.reason] || event.reason) + " · " + wat(event.created_at));
          if (event.note) row.append(node("p", event.note));
          return row;
        }));
    } catch { content.replaceChildren(node("li", "History is unavailable.")); }
  });
  target.append(history);
}

async function update(path, payload, button) {
  if (busy) return;
  busy = true;
  button.disabled = true;
  try {
    const response = await post(path, payload);
    if (response.ok || [404, 409].includes(response.status)) await load();
    if (!response.ok) get("queue-feedback").textContent = response.data.error || "Could not update the report.";
  } catch {
    get("queue-feedback").textContent = "Could not confirm the update. Refresh before trying again.";
  } finally {
    busy = false;
    button.disabled = false;
  }
}

async function assignment(target, report) {
  const panel = node("div", "");
  panel.append(node("p", "Assigned to: " + (report.assigned_to || "Unassigned")));
  target.append(panel);
  if (report.status === "closed") return;
  try {
    const response = await fetch("/api/review/assignees/", { cache: "no-store" });
    if (!response.ok) throw new Error();
    const { reviewers } = await response.json();
    const form = document.createElement("form");
    const label = node("label", "Assign reviewer");
    label.htmlFor = "assignee";
    const select = document.createElement("select");
    select.id = "assignee";
    select.required = true;
    select.append(new Option("Choose a reviewer", ""));
    for (const reviewer of reviewers) select.append(new Option(reviewer.label, reviewer.id));
    const button = node("button", "Save assignment", "primary");
    form.append(label, select, node("div", "", "actions"));
    form.lastChild.append(button);
    form.addEventListener("submit", event => {
      event.preventDefault();
      update("/api/review/" + report.reference + "/assignment/",
        { version: report.version, reviewer: Number(select.value) }, button);
    });
    panel.append(form);
  } catch { panel.append(node("p", "Reviewer accounts are unavailable.")); }
}

async function loadRelated(target, report) {
  try {
    const response = await fetch("/api/review/" + report.reference + "/", { cache: "no-store" });
    if (!response.ok) throw new Error();
    const { candidates } = await response.json();
    if (!candidates.length) return;
    target.className = "related";
    target.append(node("h3", "Related reports"));
    for (const candidate of candidates) {
      const disclosure = document.createElement("details");
      const summary = node("summary", "Compare reports · " + candidate.reference.slice(0, 8) + " · Same area · " +
        candidate.minutes_apart + " minutes apart" +
        (candidate.decision ? " · " + (candidate.decision === "linked" ? "Linked" : "Kept separate") : ""));
      disclosure.append(summary, comparison(report, candidate));
      target.append(disclosure);
    }
  } catch { target.append(node("p", "Related reports are temporarily unavailable.", "muted")); }
}

function comparison(report, candidate) {
  const area = node("div", "");
  const columns = node("div", "", "compare-grid");
  for (const [label, record] of [["Original report", report], ["Related report", candidate]]) {
    const column = node("section", "");
    column.append(node("h3", label), node("p", record.area + " · " + wat(record.occurred_at)),
      node("p", categories[record.category] + " · " + (record.firsthand ? "Firsthand" : "Secondhand")),
      node("p", record.description));
    columns.append(column);
  }
  area.append(columns);
  if (!report.can_review) return area;
  const form = document.createElement("form");
  const note = document.createElement("textarea");
  note.id = "note-" + candidate.reference;
  note.required = true;
  note.maxLength = 400;
  note.rows = 2;
  const label = node("label", "Reason for your decision");
  label.htmlFor = note.id;
  const actions = node("div", "", "actions");
  for (const [value, title] of [["linked", "Link reports"], ["separate", candidate.decision === "linked" ? "Reverse link" : "Keep separate"]]) {
    if (candidate.decision === value) continue;
    const button = node("button", title, value === "linked" ? "primary" : undefined);
    button.value = value;
    actions.append(button);
  }
  form.append(label, note, actions);
  form.addEventListener("submit", event => {
    event.preventDefault();
    const button = event.submitter;
    if (!button) return;
    update("/api/review/" + report.reference + "/links/" + candidate.reference + "/", {
      decision: button.value, note: note.value,
      versions: { [report.reference]: report.version, [candidate.reference]: candidate.version },
    }, button);
  });
  area.append(form);
  return area;
}

get("search").addEventListener("input", () => {
  clearTimeout(searchTimer);
  searchTimer = setTimeout(load, 180);
});
get("filter").addEventListener("change", load);
get("assignment-filter")?.addEventListener("change", load);
load();
