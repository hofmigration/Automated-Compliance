// 1-fetch.js — SCRIPT 1. Finds yesterday's touched contacts for the monitored
// consultants, skips dead/closed stages, and attaches every engagement
// (calls, emails, tasks, whatsapps) so the check scripts can judge them.
const { hub, assocIds, batchRead, preflight, newestFirst, strip } = require("./0-hubspot");
const { SETTINGS, SELECTED_OWNERS } = require("./config");

const OWNER_IDS = SELECTED_OWNERS.map((o) => o.id);
const TERMINAL = SETTINGS.TERMINAL_STAGES.map((s) => s.toLowerCase());

// HubSpot's standard call-outcome codes. Used as a FALLBACK so a call outcome is
// never left as a raw code (that bug made the WhatsApp check fire on connected calls).
const STANDARD_DISPOSITIONS = {
  "9d9162e7-6cf3-4944-bf63-4dff82258764": "Busy",
  "f240bbac-87c9-4f6e-bf70-924b57d47db7": "Connected",
  "a4c4c377-d246-4b32-a13b-75a56a4cd0ff": "Left live message",
  "b2cf5968-551e-4856-9783-52b3da59a7d0": "Left voicemail",
  "73a0d17f-1163-4015-bdd5-ec830791da20": "No answer",
  "17b47fee-58de-441e-a44c-c6300d46f273": "Wrong number",
};

function yesterdayWindow() {
  const off = SETTINGS.TZ_OFFSET_HOURS * 3600 * 1000;
  const n = new Date(Date.now() + off);
  const startToday = Date.UTC(n.getUTCFullYear(), n.getUTCMonth(), n.getUTCDate()) - off;
  return { startMs: startToday - 86400000, endMs: startToday };
}

async function dispositionMap() {
  const map = { ...STANDARD_DISPOSITIONS };
  try {
    const p = await hub("GET", "/crm/v3/properties/calls/hs_call_disposition");
    for (const o of p.options || []) map[o.value] = o.label;   // portal values win
  } catch (e) { console.log("Using standard call outcomes only:", e.message); }
  return map;
}

async function fetchContacts() {
  const { startMs, endMs } = yesterdayWindow();
  const out = []; let after;
  const filters = [{ propertyName: "hubspot_owner_id", operator: "IN", values: OWNER_IDS }];
  // when a single lead stage is chosen, ask HubSpot for just that stage
  if (SETTINGS.ONLY_STAGE) filters.push({ propertyName: "lead_stage", operator: "EQ", value: SETTINGS.ONLY_STAGE });
  for (let page = 0; page < 200; page++) {
    const d = await hub("POST", "/crm/v3/objects/contacts/search", {
      filterGroups: [{ filters }],
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
  const [callA, emailA, taskA, commA, dealA] = await Promise.all([
    assocIds(c.id, "calls"), assocIds(c.id, "emails"), assocIds(c.id, "tasks"), assocIds(c.id, "communications"),
    assocIds(c.id, "deals"),
  ]);
  const [callR, emailR, taskR, commR] = await Promise.all([
    batchRead("calls", callA.ids, ["hs_call_body", "hs_call_title", "hs_call_disposition", "hs_timestamp"]),
    batchRead("emails", emailA.ids, ["hs_email_subject", "hs_email_text", "hs_email_html", "hs_timestamp", "hs_email_direction"]),
    batchRead("tasks", taskA.ids, ["hs_task_subject", "hs_task_status", "hs_timestamp"]),
    batchRead("communications", commA.ids, ["hs_communication_channel_type", "hs_communication_body", "hs_timestamp"]),
  ]);
  const calls = callR.records, emails = emailR.records, tasks = taskR.records, comms = commR.records;
  // did each lookup actually work? checks must stay quiet when it did not
  const available = {
    calls: callA.ok && callR.ok,
    emails: emailA.ok && emailR.ok,
    tasks: taskA.ok && taskR.ok,
    whatsapps: commA.ok && commR.ok,
    deals: dealA.ok,
  };
  const p = c.properties;
  return {
    available,
    dealCount: dealA.ids.length,
    hasDeal: dealA.ok && dealA.ids.length > 0,
    id: c.id,
    name: [p.firstname, p.lastname].filter(Boolean).join(" ").trim(),
    ownerId: p.hubspot_owner_id,
    leadStage: p.lead_stage || null,
    outcome: p.outcome || null,
    occupation: p.jobtitle || null,
    calls: newestFirst(calls).map((x) => ({
      outcome: dispoMap[x.properties.hs_call_disposition] || x.properties.hs_call_disposition || "",
      when: Date.parse(x.properties.hs_timestamp || 0),
      note: strip(x.properties.hs_call_body || x.properties.hs_call_title),
    })),
    emails: newestFirst(emails.filter((e) => (e.properties.hs_email_direction || "") !== "INCOMING_EMAIL")).map((x) => x.properties),
    tasks: tasks.map((x) => x.properties),
    whatsapps: newestFirst(comms.filter((x) => String(x.properties.hs_communication_channel_type || "").toUpperCase() === "WHATSAPP")).map((x) => ({ when: Date.parse(x.properties.hs_timestamp || 0), body: strip(x.properties.hs_communication_body) })),
  };
}

module.exports = { fetchContacts, attachEngagements, dispositionMap, preflight, TERMINAL };
