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
];

const SETTINGS = {
  // true = report only (no notes, no emails). Set false to go live.
  DRY_RUN: true,
  DRY_RUN_LIMIT: 60,    // live contacts audited per dry-run (0 = all)
  DRY_RUN_SAMPLE: 20,   // how many flagged examples to print

  ALI_EMAIL: "razaali@hofmigration.com",
  FROM_EMAIL: "onboarding@resend.dev", // change to noreply@hofmigration.com after Resend domain verify
  PORTAL_ID: "23735726",

  // WhatsApp required after a call unless the outcome is one of these:
  WHATSAPP_SKIP_CALL_OUTCOMES: ["Connected"],
  WHATSAPP_DELAY_HOURS: 24,

  // Closed/dead stages — skipped entirely. NOTE: these are the INTERNAL values
  // (e.g. "Call Back" is the internal value of "Schedule Call Back").
  TERMINAL_STAGES: [
    "Sale", "Duplicate", "Wrong Number", "Cannot Dial", "Outside GCC",
    "Already Migrated", "Started With Competitor", "Ineligible",
    "Occupation Not Listed", "They Didn't Fill",
  ],

  GEMINI_MODEL: "gemini-flash-lite-latest",
  MAX_ISSUES_PER_CONTACT: 3,
  TZ_OFFSET_HOURS: 5,
};

module.exports = { OWNERS, SETTINGS };
