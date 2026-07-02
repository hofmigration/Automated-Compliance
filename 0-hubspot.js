// 0-hubspot.js — shared HubSpot API helpers used by every script in the pipeline.
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
    if (!res.ok) { const t = await res.text(); throw new Error(`${method} ${path} -> ${res.status}: ${t.slice(0, 200)}`); }
    return res.status === 204 ? null : res.json();
  }
  throw new Error(`rate-limited: ${method} ${path}`);
}

async function assocIds(contactId, toType) {
  try { const d = await hub("GET", `/crm/v3/objects/contacts/${contactId}/associations/${toType}?limit=200`); return (d.results || []).map((r) => r.toObjectId || r.id).filter(Boolean); }
  catch { return []; }
}

async function batchRead(objectType, ids, properties) {
  if (!ids.length) return [];
  const out = [];
  for (let i = 0; i < ids.length; i += 100) {
    const d = await hub("POST", `/crm/v3/objects/${objectType}/batch/read`, { properties, inputs: ids.slice(i, i + 100).map((id) => ({ id: String(id) })) });
    out.push(...(d.results || []));
  }
  return out;
}

const newestFirst = (a) => a.slice().sort((x, y) => Date.parse(y.properties.hs_timestamp || 0) - Date.parse(x.properties.hs_timestamp || 0));
const oldestFirst = (a) => a.slice().sort((x, y) => Date.parse(x.properties.hs_timestamp || 0) - Date.parse(y.properties.hs_timestamp || 0));
const strip = (h) => (h || "").replace(/<[^>]+>/g, " ").replace(/\s+/g, " ").trim();
const urls = (h) => (h || "").match(/https?:\/\/[^\s"'<>)]+/gi) || [];

module.exports = { hub, assocIds, batchRead, newestFirst, oldestFirst, strip, urls };
