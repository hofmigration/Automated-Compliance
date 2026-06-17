// contact-compliance.js — HOF Migration daily contact-compliance audit.
//
// What it does (once a day at 10 AM PKT):
//   1. Finds contacts touched YESTERDAY that are owned by the monitored consultants.
//   2. For each one, checks: name/occupation, lead stage, call logged, task,
//      email quality (placeholders, greeting, links, spelling), WhatsApp follow-up.
//   3. Keeps the top 3 issues (by lead-loss risk) per contact.
//   4. Posts a note on the contact naming the owner, and emails each consultant
//      their flags + emails Ali a full roundup.
//
// SAFE MODE: with SETTINGS.DRY_RUN = true it ONLY prints a report. No writes, no emails.
//
// Needs three GitHub secrets: HUBSPOT_TOKEN, GEMINI_KEY, RESEND_KEY.

const { OWNERS, SETTINGS } = require("./config");

const HUBSPOT_TOKEN = process.env.HUBSPOT_TOKEN;
const GEMINI_KEY    = process.env.GEMINI_KEY;
const RESEND_KEY    = process.env.RESEND_KEY;

const OWNER_IDS      = OWNERS.map((o) => o.id);
const OWNER_NAME     = Object.fromEntries(OWNERS.map((o) => [o.id, o.name]));
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

// ---------------------------------------------------------------------------
// HubSpot request helper (with simple rate-limit backoff)
// ---------------------------------------------------------------------------
async function hub(method, path, body) {
  const url = path.startsWith("http") ? path : `https://api.hubapi.com${path}`;
  for (let attempt = 0; attempt < 5; attempt++) {
    const res = await fetch(url, {
      method,
      headers: {
        Authorization: `Bearer ${HUBSPOT_TOKEN}`,
        "Content-Type": "application/json",
      },
      body: body ? JSON.stringify(body) : undefined,
    });
    if (res.status === 429) { await sleep(2000 * (attempt + 1)); continue; }
    if (!res.ok) {
      const t = await res.text();
      throw new Error(`HubSpot ${method} ${path} -> ${res.status}: ${t.slice(0, 300)}`);
    }
    return res.status === 204 ? null : res.json();
  }
  throw new Error(`HubSpot rate-limited after retries: ${method} ${path}`);
}

// ---------------------------------------------------------------------------
// Discovery — resolve property names / option labels in YOUR portal
// (so we don't depend on guessed internal names)
// ---------------------------------------------------------------------------
async function resolveContactProps() {
  const data = await hub("GET", "/crm/v3/properties/contacts");
  const byLabel = {};
  for (const p of data.results || []) byLabel[(p.label || "").trim().toLowerCase()] = p.name;
  const pick = (label, fallback) => byLabel[label.toLowerCase()] || fallback;
  const resolved = {
    leadStage:  pick("Lead Stage", null),
    outcome:    pick("Outcome", null),
    occupation: pick("Occupation", "jobtitle"),
  };
  console.log("Resolved contact properties:", resolved);
  return resolved;
}

async function callDispositionMap() {
  try {
    const p = await hub("GET", "/crm/v3/properties/calls/hs_call_disposition");
    const map = {};
    for (const opt of p.options || []) map[opt.value] = opt.label;
    return map; // { "<guid>": "Connected", ... }
  } catch (e) {
    console.log("Could not load call dispositions:", e.message);
    return {};
  }
}

async function ownerEmailMap() {
  const map = {};
  let after;
  for (let i = 0; i < 10; i++) {
    const data = await hub("GET", `/crm/v3/owners/?limit=100${after ? `&after=${after}` : ""}`);
    for (const o of data.results || []) map[String(o.id)] = o.email;
    after = data.paging?.next?.after;
    if (!after) break;
  }
  return map;
}

// ---------------------------------------------------------------------------
// "Yesterday" window in PKT, expressed in UTC milliseconds
// ---------------------------------------------------------------------------
function yesterdayWindow() {
  const offsetMs = SETTINGS.TZ_OFFSET_HOURS * 3600 * 1000;
  const nowPkt = new Date(Date.now() + offsetMs);
  const startTodayUtcMs =
    Date.UTC(nowPkt.getUTCFullYear(), nowPkt.getUTCMonth(), nowPkt.getUTCDate(), 0, 0, 0) - offsetMs;
  return { startMs: startTodayUtcMs - 24 * 3600 * 1000, endMs: startTodayUtcMs };
}

// ---------------------------------------------------------------------------
// Fetch contacts touched yesterday, owned by the monitored consultants
// (sorted by last-contacted DESC, filtered to the window client-side)
// ---------------------------------------------------------------------------
async function fetchContacts(props) {
  const { startMs, endMs } = yesterdayWindow();
  const wanted = [
    "firstname", "lastname", "hubspot_owner_id", "notes_last_contacted",
    props.leadStage, props.outcome, props.occupation,
  ].filter(Boolean);

  const results = [];
  let after;
  for (let page = 0; page < 60; page++) {
    const data = await hub("POST", "/crm/v3/objects/contacts/search", {
      filterGroups: [{ filters: [{ propertyName: "hubspot_owner_id", operator: "IN", values: OWNER_IDS }] }],
      sorts: [{ propertyName: "notes_last_contacted", direction: "DESCENDING" }],
      properties: wanted,
      limit: 100,
      after,
    });
    let stop = false;
    for (const c of data.results || []) {
      const lc = c.properties.notes_last_contacted ? Date.parse(c.properties.notes_last_contacted) : 0;
      if (lc >= endMs) continue;          // touched today or later -> skip
      if (lc < startMs) { stop = true; break; } // older than yesterday -> done (sorted desc)
      results.push(c);
    }
    after = data.paging?.next?.after;
    if (stop || !after) break;
  }
  return results;
}

// ---------------------------------------------------------------------------
// Associations + batch reads
// ---------------------------------------------------------------------------
async function assocIds(contactId, toType) {
  try {
    const data = await hub("GET", `/crm/v3/objects/contacts/${contactId}/associations/${toType}?limit=100`);
    return (data.results || []).map((r) => r.toObjectId || r.id).filter(Boolean);
  } catch (e) {
    return [];
  }
}

async function batchRead(objectType, ids, properties) {
  if (!ids.length) return [];
  const out = [];
  for (let i = 0; i < ids.length; i += 100) {
    const data = await hub("POST", `/crm/v3/objects/${objectType}/batch/read`, {
      properties,
      inputs: ids.slice(i, i + 100).map((id) => ({ id: String(id) })),
    });
    out.push(...(data.results || []));
  }
  return out;
}

const newestFirst = (arr) =>
  arr.slice().sort((a, b) => Date.parse(b.properties.hs_timestamp || 0) - Date.parse(a.properties.hs_timestamp || 0));

// ---------------------------------------------------------------------------
// Text checks
// ---------------------------------------------------------------------------
async function geminiIssues(kind, text) {
  if (!GEMINI_KEY || !text || !text.trim()) return [];
  const clean = String(text).replace(/https?:\/\/\S+/g, "[link]").slice(0, 4000); // strip URLs first
  const prompt =
    `You are a strict QA reviewer for ${kind} written by a sales consultant. ` +
    `Find ONLY clear problems: spelling mistakes, missing client name after a greeting, ` +
    `leftover template placeholders, or obviously unprofessional wording. ` +
    `Reply with a JSON array of short strings (max 5). If nothing is wrong, reply []. ` +
    `Text:\n"""${clean}"""`;
  try {
    const res = await fetch(
      `https://generativelanguage.googleapis.com/v1beta/models/${SETTINGS.GEMINI_MODEL}:generateContent?key=${GEMINI_KEY}`,
      { method: "POST", headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ contents: [{ parts: [{ text: prompt }] }] }) }
    );
    const data = await res.json();
    const out = data?.candidates?.[0]?.content?.parts?.[0]?.text || "[]";
    const m = out.match(/\[[\s\S]*\]/);
    return m ? JSON.parse(m[0]) : [];
  } catch (e) {
    console.log("Gemini error:", e.message);
    return [];
  }
}

const extractUrls = (html) => (html || "").match(/https?:\/\/[^\s"'<>)]+/gi) || [];

function checkSignature(html) {
  const issues = [];
  const urls = extractUrls(html);
  if (!urls.some((u) => u.toLowerCase().includes("hofmigration.com")))
    issues.push("Signature is missing or has an incorrect company website link");
  if (!urls.some((u) => u.toLowerCase().includes("linkedin.com/company/hofmigration")))
    issues.push("Signature is missing or has an incorrect LinkedIn link");
  const plain = (html || "").toLowerCase();
  if (!plain.includes("hofmigration") && !/regards|sincerely|thanks|team/i.test(html || ""))
    issues.push("No signature in the email");
  return issues;
}

function checkSalutation(html) {
  const text = (html || "").replace(/<[^>]+>/g, " ").replace(/\s+/g, " ").trim();
  const m = text.match(/\b(hi|hello|dear)\b[\s,!]*([A-Za-z]*)/i);
  if (m && (!m[2] || m[2].length < 2)) return ['Greeting has no client name (e.g. a bare "Hi,")'];
  return [];
}

function checkPlaceholders(subject) {
  if (!subject) return [];
  if (/\{\{|\}\}|\[first ?name\]|\[name\]|%[a-z_]+%/i.test(subject))
    return ["Subject line has an unfilled placeholder / merge tag"];
  return [];
}

// ---------------------------------------------------------------------------
// Audit one contact -> { name, top:[{area,weight,msg}], allCount }
// ---------------------------------------------------------------------------
async function auditContact(c, props, dispoMap) {
  const p = c.properties;
  const W = SETTINGS.WEIGHTS;
  const issues = [];
  const add = (area, msg) => issues.push({ area, weight: W[area] || 1, msg });

  // 1) identity
  const name = [p.firstname, p.lastname].filter(Boolean).join(" ").trim();
  if (!name) add("identity", "Contact has no name");
  if (props.occupation && !p[props.occupation]) add("identity", "Occupation is blank");

  // 2) lead stage
  const stage = props.leadStage ? p[props.leadStage] : null;
  if (!stage) add("leadStage", "Lead Stage is not set");

  // engagements
  const [callIds, emailIds, taskIds, commIds] = await Promise.all([
    assocIds(c.id, "calls"), assocIds(c.id, "emails"),
    assocIds(c.id, "tasks"), assocIds(c.id, "communications"),
  ]);
  const [calls, emails, tasks, comms] = await Promise.all([
    batchRead("calls", callIds, ["hs_call_title", "hs_call_body", "hs_call_disposition", "hs_timestamp", "hs_call_direction"]),
    batchRead("emails", emailIds, ["hs_email_subject", "hs_email_text", "hs_email_html", "hs_timestamp", "hs_email_direction"]),
    batchRead("tasks", taskIds, ["hs_task_subject", "hs_task_type", "hs_task_status", "hs_timestamp"]),
    batchRead("communications", commIds, ["hs_communication_channel_type", "hs_communication_body", "hs_timestamp"]),
  ]);

  // 3) call
  if (calls.length === 0) add("call", "No call logged for this contact");
  const latestCall = newestFirst(calls)[0];
  const callOutcome = latestCall
    ? (dispoMap[latestCall.properties.hs_call_disposition] || latestCall.properties.hs_call_disposition)
    : null;

  // 4) task
  if ((stage || "").toLowerCase() === "schedule call back" && tasks.length === 0)
    add("task", "Lead is 'Schedule Call Back' but no follow-up task was created");

  // 5) email (latest outgoing)
  const outgoing = emails.filter((e) => (e.properties.hs_email_direction || "") !== "INCOMING_EMAIL");
  const latestEmail = newestFirst(outgoing)[0];
  if (latestEmail) {
    const ep = latestEmail.properties;
    checkPlaceholders(ep.hs_email_subject).forEach((m) => add("email", m));
    const body = ep.hs_email_text || ep.hs_email_html || "";
    checkSalutation(ep.hs_email_html || body).forEach((m) => add("email", m));
    checkSignature(ep.hs_email_html || body).forEach((m) => add("email", m));
    (await geminiIssues("an email subject line", ep.hs_email_subject)).forEach((m) => add("email", `Subject: ${m}`));
    (await geminiIssues("an email body", body)).forEach((m) => add("email", m));
  }

  // 6) whatsapp (only if a call happened with a non-skip outcome)
  const whatsapps = comms.filter((x) =>
    String(x.properties.hs_communication_channel_type || "").toUpperCase() === "WHATSAPP");
  const skip = SETTINGS.WHATSAPP_SKIP_CALL_OUTCOMES.map((s) => s.toLowerCase());
  const whatsappRequired = callOutcome && !skip.includes(String(callOutcome).toLowerCase());
  if (whatsappRequired && whatsapps.length === 0)
    add("whatsapp", `Call outcome "${callOutcome}" but no WhatsApp message logged`);
  if (whatsapps.length) {
    const latestWa = newestFirst(whatsapps)[0];
    if (latestCall) {
      const gapH = (Date.parse(latestWa.properties.hs_timestamp) - Date.parse(latestCall.properties.hs_timestamp)) / 3600000;
      if (gapH > SETTINGS.WHATSAPP_DELAY_HOURS)
        add("whatsapp", `WhatsApp follow-up sent more than ${SETTINGS.WHATSAPP_DELAY_HOURS}h after the call`);
    }
    (await geminiIssues("a WhatsApp message", latestWa.properties.hs_communication_body)).forEach((m) => add("whatsapp", m));
  }

  issues.sort((a, b) => b.weight - a.weight);
  return { name, top: issues.slice(0, SETTINGS.MAX_ISSUES_PER_CONTACT), allCount: issues.length };
}

// ---------------------------------------------------------------------------
// Notes + emails
// ---------------------------------------------------------------------------
function noteBody(contactName, ownerName, top) {
  const lines = top.map((i) => `&bull; ${i.msg}`).join("<br>");
  return (
    `<div><strong>Compliance check &mdash; ${contactName || "this contact"}</strong><br>` +
    `Owner: <strong>${ownerName}</strong><br><br>${lines || "No issues."}</div>`
  );
}

async function postNote(contactId, ownerId, body) {
  await hub("POST", "/crm/v3/objects/notes", {
    properties: {
      hs_timestamp: new Date().toISOString(),
      hs_note_body: body,
      hubspot_owner_id: String(ownerId),
    },
    // 202 = HUBSPOT_DEFINED association: note -> contact
    associations: [{ to: { id: String(contactId) }, types: [{ associationCategory: "HUBSPOT_DEFINED", associationTypeId: 202 }] }],
  });
}

function recordLink(contactId) {
  return `https://app.hubspot.com/contacts/${SETTINGS.PORTAL_ID}/record/0-1/${contactId}`;
}

function itemsToHtml(items) {
  return items
    .map((it) => {
      const lis = it.top.map((i) => `<li>${i.msg}</li>`).join("");
      return `<p><a href="${recordLink(it.id)}">${it.name}</a><ul>${lis}</ul></p>`;
    })
    .join("");
}

async function sendEmail(to, subject, html) {
  if (!RESEND_KEY) { console.log("No RESEND_KEY set; skipping email to", to); return; }
  const res = await fetch("https://api.resend.com/emails", {
    method: "POST",
    headers: { Authorization: `Bearer ${RESEND_KEY}`, "Content-Type": "application/json" },
    body: JSON.stringify({ from: SETTINGS.FROM_EMAIL, to: [to], subject, html }),
  });
  if (!res.ok) console.log(`Email to ${to} failed: ${res.status} ${(await res.text()).slice(0, 200)}`);
  else console.log(`Email sent to ${to}`);
}

// ---------------------------------------------------------------------------
// Main
// ---------------------------------------------------------------------------
async function main() {
  if (!HUBSPOT_TOKEN) throw new Error("Missing HUBSPOT_TOKEN secret");
  console.log(`=== HOF Contact Compliance — ${new Date().toISOString()} ===`);
  console.log(`DRY_RUN = ${SETTINGS.DRY_RUN}`);

  const props = await resolveContactProps();
  if (!props.leadStage) console.log('WARNING: no contact property labelled "Lead Stage" was found.');
  if (!props.outcome) console.log('WARNING: no contact property labelled "Outcome" was found.');
  const dispoMap = await callDispositionMap();
  console.log("Call dispositions:", dispoMap);

  const contacts = await fetchContacts(props);
  console.log(`Contacts touched yesterday (owned by the ${OWNERS.length} consultants): ${contacts.length}`);

  const byOwner = {}; // ownerId -> [{ name, top, id }]
  let flagged = 0;

  for (const c of contacts) {
    const ownerId = c.properties.hubspot_owner_id;
    const ownerName = OWNER_NAME[ownerId] || `owner ${ownerId}`;
    let r;
    try { r = await auditContact(c, props, dispoMap); }
    catch (e) { console.log(`Error auditing contact ${c.id}: ${e.message}`); continue; }
    if (!r.top.length) continue;

    flagged++;
    console.log(`\nFLAG  ${ownerName}  —  ${r.name || c.id}  (showing ${r.top.length}/${r.allCount})`);
    r.top.forEach((i) => console.log(`        [${i.area}] ${i.msg}`));

    if (!SETTINGS.DRY_RUN) {
      try { await postNote(c.id, ownerId, noteBody(r.name, ownerName, r.top)); }
      catch (e) { console.log(`  ! failed to post note for ${c.id}: ${e.message}`); }
    }
    (byOwner[ownerId] ||= []).push({ name: r.name || c.id, top: r.top, id: c.id });
  }

  console.log(`\n=== ${flagged} contacts flagged ===`);

  if (SETTINGS.DRY_RUN) { console.log("DRY RUN: no notes posted, no emails sent."); return; }

  // consultant emails
  const emailMap = await ownerEmailMap();
  for (const [ownerId, items] of Object.entries(byOwner)) {
    const to = emailMap[ownerId];
    const ownerName = OWNER_NAME[ownerId] || `owner ${ownerId}`;
    if (!to) { console.log(`No email found for ${ownerName}; skipping their email.`); continue; }
    await sendEmail(
      to,
      `Compliance — ${items.length} of your contacts need attention`,
      `<p>Hi ${ownerName.split(" ")[0]},</p><p>These contacts you touched yesterday have compliance issues:</p>${itemsToHtml(items)}`
    );
  }

  // Ali roundup
  const roundup = Object.entries(byOwner)
    .map(([ownerId, items]) => `<h3>${OWNER_NAME[ownerId] || ownerId} (${items.length})</h3>${itemsToHtml(items)}`)
    .join("");
  await sendEmail(
    SETTINGS.ALI_EMAIL,
    `Contact compliance — ${flagged} flagged (${new Date().toLocaleDateString()})`,
    roundup || "<p>Nothing flagged today.</p>"
  );
}

main().catch((e) => { console.error("FATAL:", e); process.exit(1); });
