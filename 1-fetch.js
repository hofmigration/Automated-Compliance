// 1-fetch.js — SCRIPT 1 of the pipeline.
// Finds yesterday's touched contacts owned by the monitored consultants,
// skips dead/closed stages, and attaches every engagement (calls, emails,
// tasks, whatsapps) so the check scripts can judge them.
const { hub, assocIds, batchRead, newestFirst, strip } = require("./0-hubspot");
const { OWNERS, SETTINGS } = require("./config");

const OWNER_IDS = OWNERS.map((o) => o.id);
const TERMINAL = SETTINGS.TERMINAL_STAGES.map((s) => s.toLowerCase());

function yesterdayWindow() {
  const off = SETTINGS.TZ_OFFSET_HOURS * 3600 * 1000;
  const n = new Date(Date.now() + off);
  const startToday = Date.UTC(n.getUTCFullYear(), n.getUTCMonth(), n.getUTCDate()) - off;
  return { startMs: startToday - 86400000, endMs: startToday };
}

async function dispositionMap() {
  try { const p = await hub("GET", "/crm/v3/properties/calls/hs_call_disposition"); const m = {}; for (const o of p.options || []) m[o.value] = o.label; return m; }
  catch { return {}; }
}

async function fetchContacts() {
  const { startMs, endMs } = yesterdayWindow();
  const out = []; let after;
  for (let page = 0; page < 80; page++) {
    const d = await hub("POST", "/crm/v3/objects/contacts/search", {
      filterGroups: [{ filters: [{ propertyName: "hubspot_owner_id", operator: "IN", values: OWNER_IDS }] }],
      sorts: [{ propertyName: "notes_last_contacted", direction: "DESCENDING" }],
      properties: ["firstname", "lastname", "hubspot_owner_id", "notes_last_contacted", "lead_stage", "outcome", "jobtitle"],
      limit: 100, after,
    });
    let stop = false;
    for (const c of d.results || []) {
      const lc = c.properties.notes_last_contacted ? Date.parse(c.properties.notes_last_contacted) : 0;
      if (lc >= endMs) continue;
      if (lc < startMs) { stop = true; break; }
      out.push(c);
    }
    after = d.paging?.next?.after;
    if (stop || !after) break;
  }
  return out;
}

async function attachEngagements(c, dispoMap) {
  const [callIds, emailIds, taskIds, commIds] = await Promise.all([
    assocIds(c.id, "calls"), assocIds(c.id, "emails"), assocIds(c.id, "tasks"), assocIds(c.id, "communications"),
  ]);
  const [calls, emails, tasks, comms] = await Promise.all([
    batchRead("calls", callIds, ["hs_call_body", "hs_call_disposition", "hs_timestamp"]),
    batchRead("emails", emailIds, ["hs_email_subject", "hs_email_text", "hs_email_html", "hs_timestamp", "hs_email_direction"]),
    batchRead("tasks", taskIds, ["hs_task_subject", "hs_task_status", "hs_timestamp"]),
    batchRead("communications", commIds, ["hs_communication_channel_type", "hs_communication_body", "hs_timestamp"]),
  ]);
  const p = c.properties;
  return {
    id: c.id,
    name: [p.firstname, p.lastname].filter(Boolean).join(" ").trim(),
    ownerId: p.hubspot_owner_id,
    leadStage: p.lead_stage || null,
    outcome: p.outcome || null,
    occupation: p.jobtitle || null,
    calls: newestFirst(calls).map((x) => ({ outcome: dispoMap[x.properties.hs_call_disposition] || x.properties.hs_call_disposition || "", when: Date.parse(x.properties.hs_timestamp || 0), note: strip(x.properties.hs_call_body) })),
    emails: newestFirst(emails.filter((e) => (e.properties.hs_email_direction || "") !== "INCOMING_EMAIL")).map((x) => x.properties),
    tasks: tasks.map((x) => x.properties),
    whatsapps: newestFirst(comms.filter((x) => String(x.properties.hs_communication_channel_type || "").toUpperCase() === "WHATSAPP")).map((x) => ({ when: Date.parse(x.properties.hs_timestamp || 0), body: strip(x.properties.hs_communication_body) })),
  };
}

module.exports = { fetchContacts, attachEngagements, dispositionMap, TERMINAL };
