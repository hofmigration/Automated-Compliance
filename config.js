// config.js — settings for the compliance pipeline. SAFE TO EDIT.

const OWNERS = [
  { id: "89994865",   name: "Ambreen Sayed" },
  { id: "79152876",   name: "Insha Khan" },
  { id: "81129092",   name: "Akanksha Yadav" },
  { id: "93415418",   name: "Sneha Nair" },
  { id: "594801542",  name: "Wahab Saeed Dogar" },
  { id: "82714205",   name: "Muhammad Jalal Shah" },
  { id: "89398738",   name: "Komal Zahid" },
  { id: "78332276",   name: "Kawleen Kaur" },
  { id: "93601358",   name: "Anne Mariele De Guzman" },
  { id: "93714384",   name: "Mia Kordab" },
  { id: "2111743372", name: "Ronalyn Aguilar" },
  { id: "82756823",   name: "Arya Murali" },
  { id: "457296009",  name: "Rahul Pillai" },
  { id: "331190104",  name: "Aleen Naeem" },
  { id: "86887642",   name: "Khurram Iqbal" },
  { id: "76337310",   name: "Ahlam Khandoq" },
  { id: "76337312",   name: "Patrecia Haddad" },
  { id: "77931703",   name: "Abhi V" },
  { id: "331190099",  name: "Ayesha Anum" },
  { id: "94003500",   name: "Maaoui Chima Ines" },
  { id: "425098599",  name: "Jully Gill" },
  { id: "1186837974", name: "Asfandyar Malik" },
  { id: "93601359",   name: "Ayaat Gamal" },
  { id: "85714760",   name: "Rabbiya Mohsin" },
  { id: "83210660",   name: "Muhammad Diean" },
  { id: "84648486",   name: "Muhammad Shahzad Fiaz" },
  { id: "84172061",   name: "Ayesha Zahid" },
  { id: "84172062",   name: "Fatima Zahid" },
  { id: "85070897",   name: "Ahmad Ali" },
  { id: "83788398",   name: "Ali Raza Qureshi" },
  { id: "83788394",   name: "Mishal Naseem" },
  { id: "81515876",   name: "Hamza Mughal" },
  { id: "75852018",   name: "Fahad Butt" },
  { id: "239623628",  name: "Atika Zainab" },
  { id: "89097037",   name: "Tuba Ahmad" },
  { id: "93521996",   name: "Laraib Khalid" },
  { id: "93521993",   name: "Muhammad Hasham Azhar" },
  { id: "93521995",   name: "Ahmed Malik" },
  { id: "93521994",   name: "Laaiba Anum" },
  { id: "90507249",   name: "Muhammad Hanzla" },
  { id: "90507250",   name: "Muhammad Awaad" },
  { id: "89097036",   name: "Mashal Fatima" },
  { id: "95715299",   name: "Haleema Umar" },
  { id: "94388823",   name: "Rida Faisal" },
  { id: "96753780",   name: "Janice Noronha" },
  // These two are new HubSpot users whose names are BLANK in HubSpot. The names
  // below are used for the @mention, but their HubSpot profiles should be completed.
  { id: "97131926",   name: "Insha Ali" },
  { id: "97131963",   name: "Uzma Qamar" },
];

// ---------------------------------------------------------------------------
// RUN-TIME SELECTION (set from the "Run workflow" dropdowns; no file editing)
//   CONSULTANTS_INPUT — "all", or names/ids: "Ambreen, Jalal, 86887642"
//   LEAD_STAGE_INPUT  — "all", or one stage: "No Answer"
//   LIMIT_INPUT       — "0" for every contact, or a number to cap the run
// ---------------------------------------------------------------------------
const ALL_STAGES = [
  "USA NIW", "Qualified CAN", "Qualified AUS", "Sale", "Visit Visa",
  "Germany Opportunity Card", "Qualified Spain", "No Answer", "They Didn't Fill",
  "Call Back", "Wrong Number", "Ineligible", "Occupation Not Listed", "Cannot Dial",
  "Outside GCC", "Switched off", "Portugal D2/D8", "Already Migrated", "Duplicate",
  "Started With Competitor", "Work Permit",
];

function selectOwners() {
  // The workflow sends the four consultant dropdowns joined by "|".
  // "- none -" placeholders are ignored; "all" anywhere means everyone.
  const raw = (process.env.CONSULTANTS_INPUT || "all").trim();
  const terms = raw
    .split(/[|,]/)
    .map((t) => t.trim().toLowerCase())
    .filter((t) => t && t !== "- none -" && t !== "none" && t !== "-");
  if (!terms.length || terms.includes("all")) return { owners: OWNERS, unmatched: [], all: true };
  const owners = [], unmatched = [];
  for (const term of terms) {
    const hits = OWNERS.filter((o) => o.name.toLowerCase() === term || o.name.toLowerCase().includes(term) || o.id === term);
    if (!hits.length) unmatched.push(term);
    for (const h of hits) if (!owners.some((x) => x.id === h.id)) owners.push(h);
  }
  return { owners, unmatched, all: false };
}

function selectStage() {
  const raw = (process.env.LEAD_STAGE_INPUT || "all").trim();
  const low = raw.toLowerCase();
  if (!raw || low === "all") return { stage: null, blank: false, invalid: null };
  // audit contacts that have activity but NO lead stage marked
  if (low === "(not marked)" || low === "not marked" || low === "blank" || low === "none")
    return { stage: null, blank: true, invalid: null };
  const match = ALL_STAGES.find((s) => s.toLowerCase() === low);
  return match ? { stage: match, blank: false, invalid: null } : { stage: null, blank: false, invalid: raw };
}

const OWNER_SELECTION = selectOwners();
const STAGE_SELECTION = selectStage();

const SETTINGS = {
  // Dry run = safe test (report only, nothing written). Live = posts notes + sends emails.
  // MANUAL runs: choose in the dropdown. SCHEDULED runs: use the fallback below.
  // To make the daily 10 AM run go LIVE, change the "true" below to "false".
  DRY_RUN: process.env.DRY_RUN_INPUT ? process.env.DRY_RUN_INPUT === "true" : true,

  // Contacts to audit per run. 0 = ALL of them (no cap).
  LIMIT: (() => {
    const raw = (process.env.LIMIT_INPUT || "all").trim().toLowerCase();
    if (!raw || raw === "all" || raw === "0") return 0;          // 0 = no cap
    const n = parseInt(raw, 10);
    return Number.isFinite(n) && n > 0 ? n : 0;
  })(),

  // Which slice of time to audit: "yesterday", "today", or a number of days.
  AUDIT_WINDOW: process.env.AUDIT_WINDOW_INPUT || "yesterday",

  // Only audit this lead stage (null = every live stage).
  ONLY_STAGE: STAGE_SELECTION.stage,
  ONLY_STAGE_BLANK: STAGE_SELECTION.blank,
  INVALID_STAGE: STAGE_SELECTION.invalid,
  ALL_STAGES,

  PRINT_SAMPLE: 20,   // flagged examples printed in the log

  ALI_EMAIL: "razaali@hofmigration.com",

  // The compliance note is posted as ALI (owner id 86250521), so it reads as a
  // note from the compliance lead rather than from the consultant themselves.
  NOTE_OWNER_ID: "86250521",

  // Note wording. "lines" matches the notes Ali writes today (greeting, one line
  // per issue, Thank you). "sentence" is the single-sentence version.
  NOTE_FORMAT: "lines",

  // HubSpot never notifies for @mentions created by a script, so optionally
  // assign the consultant a TASK — that DOES reach their HubSpot task queue.
  CREATE_TASK_FOR_CONSULTANT: true,
  TASK_PREFIX: "[Compliance]",        // our tasks are ignored by 4-check-task.js
  TASK_DUE_IN_HOURS: 24,
  FROM_EMAIL: "onboarding@resend.dev", // change to noreply@hofmigration.com after Resend domain verify
  PORTAL_ID: "23735726",

  // Your portal's call outcomes: Busy, Connected, Left live message,
  // Left voicemail, Meeting booked, No answer, Wrong number.

  // WhatsApp required after a call UNLESS the client was actually reached:
  WHATSAPP_SKIP_CALL_OUTCOMES: ["Connected", "Meeting booked"],
  WHATSAPP_DELAY_HOURS: 24,

  // A call description is only expected when there was a real conversation.
  // Busy / No answer / Left voicemail / Wrong number need no description.
  CALL_DESCRIPTION_REQUIRED_OUTCOMES: ["Connected", "Meeting booked"],

  // Closed/dead stages — skipped entirely. NOTE: these are the INTERNAL values
  // (e.g. "Call Back" is the internal value of "Schedule Call Back").
  TERMINAL_STAGES: [
    "Sale", "Duplicate", "Wrong Number", "Cannot Dial", "Outside GCC",
    "Already Migrated", "Started With Competitor", "Ineligible",
    "Occupation Not Listed", "They Didn't Fill",
  ],

  // ----- WHICH CHECKS RUN -----
  CHECK_STAGE_MATCH: true,     // AI: lead stage vs what the call notes actually say
  CHECK_EMAIL_SPELLING: true,  // AI: spelling / placeholders in the sent email
  CHECK_OCCUPATION: false,     // blank occupation (off — it was noisy)
  CHECK_CALL_DESCRIPTION: true,// connected call with no description logged
  CHECK_WHATSAPP_SPELLING: false,// spelling mistakes in the WhatsApp follow-up (OFF)

  // SAFETY NET: if a whole run reads ZERO WhatsApp messages across every contact,
  // that almost certainly means we cannot see them (as happened before) rather
  // than nobody using WhatsApp. In that case all "no WhatsApp logged" findings are
  // dropped and a warning is printed, so consultants are never wrongly accused.
  WHATSAPP_SANITY_NET: true,

  // Ask the consultant to call when the last logged call is this many calendar
  // days old. 2 = today and yesterday are fine, 2 days ago or older is not.
  CALL_STALE_AFTER_DAYS: 2,

  GEMINI_MODEL: "gemini-flash-lite-latest",
  MAX_ISSUES_PER_CONTACT: 3,
  TZ_OFFSET_HOURS: 5,
};

module.exports = { OWNERS, SETTINGS, SELECTED_OWNERS: OWNER_SELECTION.owners, UNMATCHED_NAMES: OWNER_SELECTION.unmatched, ALL_OWNERS_SELECTED: OWNER_SELECTION.all };
