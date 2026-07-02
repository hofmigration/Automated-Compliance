// contact-compliance.js — THE RUNNER. Connects the pipeline:
//   1-fetch -> 2-check-stage -> 3-check-call -> 4-check-task ->
//   5-check-email -> 6-check-whatsapp -> 7-note
// Every LIVE contact touched yesterday goes through all six checks, strictly.
// Issues are ordered by lead-loss priority (call > email > whatsapp > stage > task),
// capped at MAX_ISSUES_PER_CONTACT for the note, then Script 7 writes the note in
// Ali's style. Consultants and Ali get their emails.
//
// SAFE MODE: DRY_RUN=true prints everything, posts/sends nothing.

const { OWNERS, SETTINGS } = require("./config");
const { hub } = require("./0-hubspot");
const { fetchContacts, attachEngagements, dispositionMap, TERMINAL } = require("./1-fetch");
const checkStage = require("./2-check-stage");
const checkCall = require("./3-check-call");
const checkTask = require("./4-check-task");
const checkEmail = require("./5-check-email");
const checkWhatsapp = require("./6-check-whatsapp");
const { composeNote, postNote } = require("./7-note");

const OWNER_NAME = Object.fromEntries(OWNERS.map((o) => [o.id, o.name]));
const PRIORITY = { call: 1, email: 2, whatsapp: 3, stage: 4, task: 5 };

async function ownerEmailMap() {
  const map = {}; let after;
  for (let i = 0; i < 10; i++) {
    const d = await hub("GET", `/crm/v3/owners/?limit=100${after ? `&after=${after}` : ""}`);
    for (const o of d.results || []) map[String(o.id)] = o.email;
    after = d.paging?.next?.after; if (!after) break;
  }
  return map;
}
async function sendEmail(to, subject, html) {
  if (!process.env.RESEND_KEY) { console.log("No RESEND_KEY; skip email to", to); return; }
  const res = await fetch("https://api.resend.com/emails", {
    method: "POST", headers: { Authorization: `Bearer ${process.env.RESEND_KEY}`, "Content-Type": "application/json" },
    body: JSON.stringify({ from: SETTINGS.FROM_EMAIL, to: [to], subject, html }),
  });
  console.log(res.ok ? `Email sent to ${to}` : `Email to ${to} failed: ${res.status}`);
}
const recordLink = (id) => `https://app.hubspot.com/contacts/${SETTINGS.PORTAL_ID}/record/0-1/${id}`;

async function main() {
  if (!process.env.HUBSPOT_TOKEN) throw new Error("Missing HUBSPOT_TOKEN");
  console.log(`=== HOF Contact Compliance pipeline — ${new Date().toISOString()} ===  DRY_RUN=${SETTINGS.DRY_RUN}`);

  const dispoMap = await dispositionMap();
  const contacts = await fetchContacts();
  console.log(`Contacts touched yesterday (${OWNERS.length} consultants): ${contacts.length}`);

  const flagged = []; let skipped = 0, audited = 0;
  for (const c of contacts) {
    const stage = c.properties.lead_stage;
    if (stage && TERMINAL.includes(String(stage).toLowerCase())) { skipped++; continue; }
    if (SETTINGS.DRY_RUN && SETTINGS.DRY_RUN_LIMIT && audited >= SETTINGS.DRY_RUN_LIMIT) break;
    audited++;

    let d;
    try { d = await attachEngagements(c, dispoMap); }
    catch (e) { console.log(`fetch error ${c.id}: ${e.message}`); continue; }

    // ---- the chain: each script adds its findings ----
    let issues = [];
    try {
      issues = issues.concat(checkStage(d));          // script 2
      issues = issues.concat(checkCall(d));           // script 3
      issues = issues.concat(checkTask(d));           // script 4
      issues = issues.concat(await checkEmail(d));    // script 5
      issues = issues.concat(await checkWhatsapp(d)); // script 6
    } catch (e) { console.log(`check error ${c.id}: ${e.message}`); }

    if (!issues.length) continue;
    issues.sort((a, b) => (PRIORITY[a.area] || 9) - (PRIORITY[b.area] || 9));
    const top = issues.slice(0, SETTINGS.MAX_ISSUES_PER_CONTACT);

    const ownerName = OWNER_NAME[d.ownerId] || `owner ${d.ownerId}`;
    const note = composeNote(ownerName.split(" ")[0], top);   // script 7
    flagged.push({ ...d, ownerName, top, all: issues, note });

    if (!SETTINGS.DRY_RUN) {
      try { await postNote(d.id, d.ownerId, note); }
      catch (e) { console.log(`note error ${d.id}: ${e.message}`); }
    }
  }

  // ---- summary ----
  const perOwner = {}, perProblem = {};
  for (const f of flagged) {
    perOwner[f.ownerName] = (perOwner[f.ownerName] || 0) + 1;
    for (const i of f.all) perProblem[i.problem.split(":")[0]] = (perProblem[i.problem.split(":")[0]] || 0) + 1;
  }
  const desc = (o) => Object.entries(o).sort((a, b) => b[1] - a[1]);
  console.log(`\n===== SUMMARY =====`);
  console.log(`Scanned ${contacts.length} | skipped (closed stages) ${skipped} | audited ${audited} | FLAGGED ${flagged.length}`);
  console.log(`\nIssues by type:`); for (const [p, n] of desc(perProblem)) console.log(`  ${String(n).padStart(4)}  ${p}`);
  console.log(`\nFlagged per consultant:`); for (const [o, n] of desc(perOwner)) console.log(`  ${String(n).padStart(4)}  ${o}`);
  console.log(`\nSample (first ${SETTINGS.DRY_RUN_SAMPLE}):`);
  for (const f of flagged.slice(0, SETTINGS.DRY_RUN_SAMPLE)) {
    console.log(`\n• ${f.ownerName} — ${f.name || f.id}`);
    console.log(`  note:   ${f.note}`);
    console.log(`  issues: ${f.all.map((i) => i.problem).join("; ")}`);
  }
  if (SETTINGS.DRY_RUN) { console.log(`\nDRY RUN: nothing posted or emailed.`); return; }

  // ---- emails ----
  const byOwner = {}; for (const f of flagged) (byOwner[f.ownerId] ||= []).push(f);
  const emails = await ownerEmailMap();
  for (const [ownerId, items] of Object.entries(byOwner)) {
    const to = emails[ownerId]; const ownerName = OWNER_NAME[ownerId] || ownerId;
    if (!to) { console.log(`No email for ${ownerName}`); continue; }
    const list = items.map((it) => `<p><a href="${recordLink(it.id)}">${it.name || it.id}</a><ul>${it.top.map((i) => `<li>${i.problem}</li>`).join("")}</ul></p>`).join("");
    await sendEmail(to, `Compliance — ${items.length} of your contacts need attention`, `<p>Hi ${ownerName.split(" ")[0]},</p>${list}`);
  }
  const roundup = Object.entries(byOwner).map(([oid, items]) =>
    `<h3>${OWNER_NAME[oid] || oid} (${items.length})</h3>` +
    items.map((it) => `<p><a href="${recordLink(it.id)}">${it.name || it.id}</a>: ${it.top.map((i) => i.problem).join("; ")}</p>`).join("")
  ).join("");
  await sendEmail(SETTINGS.ALI_EMAIL, `Contact compliance — ${flagged.length} flagged`, roundup || "<p>Nothing flagged.</p>");
}

main().catch((e) => { console.error("FATAL:", e); process.exit(1); });
