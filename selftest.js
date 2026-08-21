// selftest.js — the rules register, as a runnable test.
//
// WHY THIS EXISTS: every rule we agreed is listed here as a scenario with the
// issue it MUST produce. Run this after any edit. If a rule ever stops firing,
// this fails and names it — so a scenario can never be silently dropped again.
//
// Run locally or add it as a workflow step:  node selftest.js
// It needs no HubSpot token and no Gemini key (AI checks return nothing without
// a key, so AI-only rules are marked and skipped).

process.env.HUBSPOT_TOKEN = process.env.HUBSPOT_TOKEN || "selftest";

const checkStage = require("./2-check-stage");
const checkCall = require("./3-check-call");
const checkTask = require("./4-check-task");
const checkEmail = require("./5-check-email");
const checkWhatsapp = require("./6-check-whatsapp");
const checkMatch = require("./8-check-stage-match");
const { composeNote } = require("./7-note");
const { SETTINGS } = require("./config");

const DAY = 86400000, now = Date.now();
const OK = { calls: true, emails: true, tasks: true, whatsapps: true, deals: true };
const PRIORITY = { stagematch: 1, call: 2, stage: 3, outcome: 4, email: 5, task: 6, whatsapp: 7, data: 8 };

// a fully compliant contact — each scenario breaks exactly one thing
const good = (o = {}) => ({
  available: OK, hasDeal: false, dealCount: 0, id: "900001", name: "Ahmed Khan", ownerId: "1",
  leadStage: "Qualified CAN", outcome: "Opportunity", occupation: "Engineer",
  calls: [{ outcome: "Connected", when: now, note: "spoke with client, interested in Canada" }],
  tasks: [{ hs_task_subject: "Follow up call" }],
  emails: [{ hs_email_subject: "Canada PR process", hs_email_text: "Hi Ahmed, thank you for your time today." }],
  whatsapps: [],
  ...o,
});

// [ name, contact, expectation ]
//   null        -> must produce NO issues at all
//   "text"      -> must produce an issue containing "text"
//   "!text"     -> must NOT produce any issue containing "text" (others allowed)
//   "SKIP"      -> contact is skipped before checks (deal)
//   "AI-SKIP"   -> needs GEMINI_KEY, skipped without one
const SCENARIOS = [
  // --- baseline ---
  ["compliant contact produces nothing", good(), null],

  // --- deal ---
  ["contact with a deal is skipped", good({ hasDeal: true, leadStage: null, calls: [], emails: [] }), "SKIP"],

  // --- identity ---
  ["client name missing", good({ name: "" }), "no name"],
  ["occupation blank (only when toggle on)", good({ occupation: null }), SETTINGS.CHECK_OCCUPATION ? "Occupation" : null],

  // --- lead stage / outcome ---
  ["lead stage not marked", good({ leadStage: null, outcome: null }), "No lead stage marked"],
  ["call logged but outcome blank", good({ outcome: null }), "no outcome marked"],

  // --- call ---
  ["no call logged at all", good({ calls: [] }), "No call logged"],
  ["email sent but no call logged", good({ calls: [] }), "No call logged"],
  ["call today is fine", good({ calls: [{ outcome: "Connected", when: now, note: "spoke" }] }), null],
  ["call yesterday is fine", good({ calls: [{ outcome: "Connected", when: now - DAY, note: "spoke" }] }), null],
  ["call 2 days ago is stale", good({ calls: [{ outcome: "Connected", when: now - 2 * DAY, note: "spoke" }] }), "Not called recently"],
  ["call 10 days ago is stale", good({ calls: [{ outcome: "Connected", when: now - 10 * DAY, note: "spoke" }] }), "Not called recently"],
  ["logged call with no call outcome", good({ calls: [{ outcome: "", when: now, note: "spoke" }] }), "no call outcome"],
  ["connected call with no description", good({ calls: [{ outcome: "Connected", when: now, note: "" }] }), "no description"],

  // --- call quality must only judge RECENT calls (Mishal Naseem case) ---
  ["busy + no answer yesterday, old connected call: no description ask",
    good({ calls: [
      { outcome: "No answer", when: now - DAY, note: "NA" },
      { outcome: "Busy", when: now - DAY, note: "Call id : 0c809ecf" },
      { outcome: "Connected", when: now - 30 * DAY, note: "" },
    ] }), "!no description"],
  ["busy call today needs no description", good({ calls: [{ outcome: "Busy", when: now, note: "" }], whatsapps: [{ when: now, body: "Hello sir" }] }), null],
  ["no answer call today needs no description", good({ leadStage: "No Answer", calls: [{ outcome: "No answer", when: now, note: "NA" }], whatsapps: [{ when: now, body: "Hello sir" }] }), null],
  ["connected call today with no description IS flagged", good({ calls: [{ outcome: "Connected", when: now, note: "" }] }), "no description"],
  ["connected call with only \"NA\" is not a description", good({ calls: [{ outcome: "Connected", when: now, note: "NA" }] }), "no description"],
  ["meeting booked needs a description too", good({ calls: [{ outcome: "Meeting booked", when: now, note: "" }] }), "no description"],
  ["meeting booked needs no whatsapp", good({ calls: [{ outcome: "Meeting booked", when: now, note: "client agreed to a zoom on friday" }], whatsapps: [] }), null],
  ["old call with no outcome is not flagged today",
    good({ calls: [{ outcome: "Connected", when: now, note: "spoke at length" }, { outcome: "", when: now - 40 * DAY, note: "old" }] }), null],

  // --- task ---
  ["no task set up", good({ tasks: [] }), "No task set up"],
  ["only our own compliance task exists", good({ tasks: [{ hs_task_subject: "[Compliance] Ahmed — mark the lead stage" }] }), "No task set up"],
  ["task check waits for the lead stage", good({ leadStage: null, outcome: null, tasks: [] }), "No lead stage marked"],

  // --- email ---
  ["call logged but no email sent", good({ emails: [] }), "no email sent"],
  ["no email is NOT asked when no call either", good({ calls: [], emails: [] }), "No call logged"],
  ["placeholder left in subject", good({ emails: [{ hs_email_subject: "Hello {{firstname}}", hs_email_text: "Hi Ahmed, details." }] }), "placeholder"],
  ["greeting with no client name", good({ emails: [{ hs_email_subject: "Canada PR", hs_email_text: "Hi, please find details." }] }), "no client name"],

  // --- whatsapp ---
  ["no answer call with no whatsapp", good({ leadStage: "No Answer", calls: [{ outcome: "No answer", when: now, note: "" }], whatsapps: [] }), "no WhatsApp logged"],
  ["busy call with no whatsapp", good({ calls: [{ outcome: "Busy", when: now, note: "" }], whatsapps: [] }), "no WhatsApp logged"],
  ["connected call needs no whatsapp", good({ calls: [{ outcome: "Connected", when: now, note: "spoke" }], whatsapps: [] }), null],
  ["old whatsapp does not count for a new no-answer call",
    good({ calls: [{ outcome: "No answer", when: now, note: "" }], whatsapps: [{ when: now - 30 * DAY, body: "hello sir" }] }), "no WhatsApp logged"],
  ["whatsapp sent within 24h is fine",
    good({ calls: [{ outcome: "No answer", when: now - 3600000, note: "" }], whatsapps: [{ when: now, body: "Hello sir, we tried calling you." }] }), null],
  ["whatsapp sent late is flagged",
    good({ calls: [{ outcome: "No answer", when: now - 4 * DAY, note: "" }], whatsapps: [{ when: now, body: "Hello sir" }] }), "after the call"],

  // --- WhatsApp that IS logged must be recognised (Rahima Nabili case) ---
  ["whatsapp logged after a no-answer call is accepted",
    good({ leadStage: "No Answer", calls: [{ outcome: "No answer", when: now - 7200000, note: "" }],
           whatsapps: [{ when: now - 3600000, body: "[14:08] Rahima Nabili: Hello Mr. Saqib" }] }), "!no WhatsApp"],
  ["several whatsapps logged, newest after the call, accepted",
    good({ leadStage: "No Answer", calls: [{ outcome: "No answer", when: now - 7200000, note: "" }],
           whatsapps: [{ when: now - 3600000, body: "Upload complete" }, { when: now - 20 * DAY, body: "Hello" }] }), "!no WhatsApp"],

  // --- the hours box ---
  ["hours box is read correctly", null, "HOURS"],

  // --- broken lookups must never accuse anyone ---
  ["broken call lookup stays silent", good({ available: { ...OK, calls: false }, calls: [] }), null],
  ["broken task lookup stays silent", good({ available: { ...OK, tasks: false }, tasks: [] }), null],
  ["broken email lookup stays silent", good({ available: { ...OK, emails: false }, emails: [] }), null],
  ["broken whatsapp lookup stays silent",
    good({ available: { ...OK, whatsapps: false }, calls: [{ outcome: "No answer", when: now, note: "" }], whatsapps: [] }), null],

  // --- AI-only rule (needs GEMINI_KEY, otherwise skipped) ---
  ["stage contradicts the call notes",
    good({ leadStage: "No Answer", calls: [{ outcome: "Connected", when: now, note: "spoke with client at length, he is a qualified engineer and very interested in Canada PR" }] }),
    process.env.GEMINI_KEY ? "does not match" : "AI-SKIP"],
];

(async () => {
  let pass = 0, fail = 0, skip = 0;
  console.log(`RULES SELF-TEST — ${SCENARIOS.length} scenarios\n`);

  for (const [label, d, must] of SCENARIOS) {
    if (must === "SKIP") {
      const ok = d.hasDeal === true;
      console.log(`${ok ? "PASS" : "FAIL"}  ${label}`);
      ok ? pass++ : fail++;
      continue;
    }
    if (must === "AI-SKIP") { console.log(`SKIP  ${label} (no GEMINI_KEY)`); skip++; continue; }
    if (must === "HOURS") {
      const cases = [["1", 1], ["18", 18], ["24", 24], ["72", 72], ["0", 0], ["any", 0],
                     ["", 24], ["abc", 24], ["24 hours", 24], [undefined, 24]];
      let ok = true, detail = [];
      for (const [input, expect] of cases) {
        for (const k of Object.keys(require.cache)) delete require.cache[k];
        if (input === undefined) delete process.env.HOURS_INPUT; else process.env.HOURS_INPUT = input;
        const got = require("./config").SETTINGS.AUDIT_HOURS;
        if (got !== expect) { ok = false; detail.push(`${JSON.stringify(input)} -> ${got}, expected ${expect}`); }
      }
      delete process.env.HOURS_INPUT;
      for (const k of Object.keys(require.cache)) delete require.cache[k];
      console.log(`${ok ? "PASS" : "FAIL"}  ${label}`);
      if (!ok) console.log("        " + detail.join("; "));
      ok ? pass++ : fail++;
      continue;
    }

    let issues = [];
    try {
      issues = issues.concat(checkStage(d), checkCall(d), checkTask(d),
        await checkEmail(d), await checkWhatsapp(d), await checkMatch(d));
    } catch (e) {
      console.log(`FAIL  ${label}\n        crashed: ${e.message}`); fail++; continue;
    }
    issues.sort((a, b) => (PRIORITY[a.area] || 9) - (PRIORITY[b.area] || 9));
    const text = issues.map((i) => i.problem).join("; ");

    let ok;
    if (must === null) ok = issues.length === 0;
    else if (String(must).startsWith("!")) ok = !text.toLowerCase().includes(String(must).slice(1).toLowerCase());
    else ok = text.toLowerCase().includes(String(must).toLowerCase());
    if (ok) { pass++; console.log(`PASS  ${label}`); }
    else {
      fail++;
      console.log(`FAIL  ${label}`);
      console.log(`        expected: ${must === null ? "no issues"
        : String(must).startsWith("!") ? `NO issue containing "${String(must).slice(1)}"`
        : `an issue containing "${must}"`}`);
      console.log(`        got:      ${text || "(no issues)"}`);
    }
  }

  console.log(`\n${pass} passed, ${fail} failed, ${skip} skipped`);
  if (fail) {
    console.log(`\nA rule stopped working. Fix it before running the audit for real.`);
    process.exit(1);
  }
  console.log(`\nExample note:\n  ${composeNote("Ayesha", [
    { action: "mark the lead stage" }, { action: "call the client and log the call" },
  ])}`);
})();
