// 0-hubspot.js — shared HubSpot API helpers.
//
// IMPORTANT DESIGN RULE: a lookup that FAILS must never look like "no data".
// Association reads report {ids, ok}. If ok is false the read broke (missing
// scope, API change) and the check scripts must NOT flag the consultant.
const TOKEN = process.env.HUBSPOT_TOKEN;
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

async function hub(method, path, body) {
  const url = `https://api.hubapi.com${path}`;
  for (let a = 0; a < 6; a++) {
    const res = await fetch(url, {
      method, headers: { Authorization: `Bearer ${TOKEN}`, "Content-Type": "application/json" },
      body: body ? JSON.stringify(body) : undefined,
    });
    if (res.status === 429) { await sleep(2000 * (a + 1)); continue; }
    if (!res.ok) { const t = await res.text(); const e = new Error(`${method} ${path} -> ${res.status}: ${t.slice(0, 200)}`); e.status = res.status; throw e; }
    return res.status === 204 ? null : res.json();
  }
  throw new Error(`rate-limited: ${method} ${path}`);
}

// Warn once per engagement type instead of spamming the log
const warned = new Set();
function warnOnce(type, msg) {
  if (warned.has(type)) return;
  warned.add(type);
  console.log(`!! LOOKUP FAILED for "${type}" — ${msg}`);
  console.log(`   Contacts will NOT be flagged for missing ${type} while this is broken.`);
}

// Some object types answer to more than one name. WhatsApp/SMS live on the
// Communication object, which HubSpot exposes as "communications" or type id 0-18
// depending on the portal — so we try each until one returns records.
const ALIASES = {
  communications: ["communications", "0-18", "communication"],
};
const workingAlias = {};   // remembered after the first success

// Reads associations. Tries v4 then v3, and every alias for the type.
async function assocIds(contactId, toType) {
  const names = workingAlias[toType] ? [workingAlias[toType]] : (ALIASES[toType] || [toType]);
  let lastErr, anyOk = false;
  for (const name of names) {
    for (const version of ["v4", "v3"]) {
      try {
        const d = await hub("GET", `/crm/${version}/objects/contacts/${contactId}/associations/${name}?limit=200`);
        anyOk = true;
        const ids = (d.results || []).map((r) => r.toObjectId || r.id).filter(Boolean);
        if (ids.length) { workingAlias[toType] = name; return { ids, ok: true, via: name }; }
      } catch (e) { lastErr = e; }
    }
  }
  if (anyOk) return { ids: [], ok: true, via: names[0] };   // reachable, genuinely empty
  warnOnce(toType, lastErr?.message || "unknown error");
  return { ids: [], ok: false, error: lastErr?.message };
}

async function batchRead(objectType, ids, properties) {
  if (!ids.length) return { records: [], ok: true };
  const out = [];
  for (let i = 0; i < ids.length; i += 100) {
    try {
      const d = await hub("POST", `/crm/v3/objects/${objectType}/batch/read`, { properties, inputs: ids.slice(i, i + 100).map((id) => ({ id: String(id) })) });
      out.push(...(d.results || []));
    } catch (e) { warnOnce(`${objectType} (read)`, e.message); return { records: out, ok: false }; }
  }
  return { records: out, ok: true };
}

// Startup self-test: proves which lookups actually work before auditing anyone.
async function preflight(sampleContactId) {
  console.log(`\n--- checking access (sample contact ${sampleContactId}) ---`);
  const status = {};
  for (const type of ["calls", "emails", "tasks", "communications", "deals"]) {
    const r = await assocIds(sampleContactId, type);
    status[type] = r.ok;
    console.log(`  ${r.ok ? "OK     " : "BROKEN "} ${type}${r.ok ? ` (${r.ids.length} linked${r.via && r.via !== type ? `, via "${r.via}"` : ""})` : ""}`);
  }
  const broken = Object.entries(status).filter(([, ok]) => !ok).map(([t]) => t);
  if (broken.length) {
    console.log(`\n  WARNING: ${broken.join(", ")} could not be read. Add the matching read`);
    console.log(`  scopes to the "HOF QA System" private app in HubSpot, then re-run.`);
    console.log(`  Checks that depend on them are switched OFF for this run.`);
  }
  console.log("");
  return status;
}

// Calendar-day distance in PKT: 0 = today, 1 = yesterday, 2+ = older.
function daysAgoPkt(ms, tzOffsetHours = 5) {
  if (!ms) return Infinity;
  const off = tzOffsetHours * 3600 * 1000;
  const dayOf = (t) => Math.floor((t + off) / 86400000);
  return dayOf(Date.now()) - dayOf(ms);
}

const newestFirst = (a) => a.slice().sort((x, y) => Date.parse(y.properties.hs_timestamp || 0) - Date.parse(x.properties.hs_timestamp || 0));
const strip = (h) => (h || "").replace(/<[^>]+>/g, " ").replace(/\s+/g, " ").trim();
const urls = (h) => (h || "").match(/https?:\/\/[^\s"'<>)]+/gi) || [];

module.exports = { hub, assocIds, batchRead, preflight, newestFirst, strip, urls, daysAgoPkt };
