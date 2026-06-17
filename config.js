// config.js — settings for the HOF Contact Compliance audit.
//
// SAFE TO EDIT:
//   - OWNERS list (add / remove consultants)
//   - anything inside SETTINGS
// Leave the rest as-is unless you know what you're changing.

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
  // ----- SAFE MODE -----
  // true  = ONLY prints a report to the log. No notes posted, no emails sent.
  // false = goes live (posts notes + sends emails).
  // KEEP THIS TRUE until your first dry run looks correct.
  DRY_RUN: true,

  // Who receives the daily roundup of everything flagged.
  ALI_EMAIL: "razaali@hofmigration.com",

  // The "from" address for all emails.
  // IMPORTANT: "onboarding@resend.dev" can ONLY deliver to ALI_EMAIL above.
  // To email the consultants too, verify hofmigration.com in Resend (see README),
  // then change this to "noreply@hofmigration.com".
  FROM_EMAIL: "onboarding@resend.dev",

  // Your HubSpot portal ID (used to build record links in the emails/log).
  PORTAL_ID: "23735726",

  // Signature links that count as "proper".
  COMPANY_URL: "https://www.hofmigration.com/",
  LINKEDIN_URL: "https://www.linkedin.com/company/hofmigration/",

  // WhatsApp is required after a call UNLESS the call outcome is one of these.
  // (You chose: required for everything except "Connected".)
  WHATSAPP_SKIP_CALL_OUTCOMES: ["Connected"],

  // Hours after which a WhatsApp follow-up counts as a "delayed reply".
  WHATSAPP_DELAY_HOURS: 24,

  // Gemini model used for spelling / quality checks.
  GEMINI_MODEL: "gemini-flash-lite-latest",

  // Most issues to report per contact.
  MAX_ISSUES_PER_CONTACT: 3,

  // "Yesterday" is calculated in this timezone (PKT = UTC+5).
  TZ_OFFSET_HOURS: 5,

  // Priority weights — higher = more likely to be one of the top 3 shown.
  // Order reflects "what loses the lead": call > email > whatsapp.
  WEIGHTS: {
    call: 5,
    leadStage: 3.5,
    email: 4,
    task: 2.5,
    whatsapp: 3,
    identity: 2,
  },
};

module.exports = { OWNERS, SETTINGS };
