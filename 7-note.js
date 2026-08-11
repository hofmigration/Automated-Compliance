// 7-note.js — SCRIPT 7. Writes the compliance note and posts it.
//
// THREE things this handles:
//  1. The note is OWNED BY ALI (not the consultant), so it reads as a note from
//     the compliance lead, not something the consultant wrote to themselves.
//  2. The consultant is recorded as @mentioned on the note.
//     NOTE: HubSpot does NOT send notifications for mentions made via API, so a
//     mention alone will never reach them. That is what the task below is for.
//  3. Optionally assigns the consultant a TASK, which DOES land in their HubSpot
//     task queue — the only reliable in-HubSpot way to make sure they see it.
//
// Wording follows Ali's style, with slight natural variation so 20 notes in a row
// do not look copy-pasted:
//   "Hi @ayesha hope you are well. Kindly update the lead stage and also set up
//    the next task for further follow up. thank you."
const { hub } = require("./0-hubspot");
const { SETTINGS } = require("./config");

const OPENERS = [
  "hope you are well",
  "hope you are doing well",
  "hope all is well",
  "hope you are well today",
];
const VERBS = ["Kindly", "Kindly", "Please kindly", "Please"];

// stable per contact: the same contact always gets the same wording
const pick = (arr, seed) => arr[Math.abs(Number(String(seed).slice(-6)) || 0) % arr.length];

function joinActions(actions) {
  if (actions.length === 1) return actions[0];
  if (actions.length === 2) return `${actions[0]} and also ${actions[1]}`;
  return `${actions.slice(0, -1).join(", ")} and also ${actions[actions.length - 1]}`;
}

function composeNote(ownerFirstName, issues, contactId = "0") {
  const first = (ownerFirstName || "there").toLowerCase();
  const actions = [...new Set(issues.map((i) => i.action))];
  return `Hi @${first} ${pick(OPENERS, contactId)}. ${pick(VERBS, contactId)} ${joinActions(actions)}. thank you.`;
}

async function postNote(contactId, consultantOwnerId, noteText) {
  await hub("POST", "/crm/v3/objects/notes", {
    properties: {
      hs_timestamp: new Date().toISOString(),
      hs_note_body: `<div>${noteText}</div>`,
      // the note belongs to Ali (the compliance lead), not the consultant
      hubspot_owner_id: String(SETTINGS.NOTE_OWNER_ID),
      // records the consultant as mentioned (does not notify — see header)
      hs_at_mentioned_owner_ids: String(consultantOwnerId),
    },
    associations: [{ to: { id: String(contactId) }, types: [{ associationCategory: "HUBSPOT_DEFINED", associationTypeId: 202 }] }],
  });
}

// Assigns the consultant a task so it appears in their HubSpot task queue.
// Prefixed so our own task check never counts it as their follow-up task.
async function createComplianceTask(contactId, consultantOwnerId, contactName, issues) {
  const actions = [...new Set(issues.map((i) => i.action))];
  const due = new Date(Date.now() + SETTINGS.TASK_DUE_IN_HOURS * 3600 * 1000);
  await hub("POST", "/crm/v3/objects/tasks", {
    properties: {
      hs_timestamp: due.toISOString(),
      hs_task_subject: `${SETTINGS.TASK_PREFIX} ${contactName || "Contact"} — ${joinActions(actions)}`.slice(0, 250),
      hs_task_body: `Compliance check on ${contactName || "this contact"}. Kindly ${joinActions(actions)}.`,
      hs_task_status: "NOT_STARTED",
      hs_task_priority: "HIGH",
      hs_task_type: "TODO",
      hubspot_owner_id: String(consultantOwnerId),   // assigned TO the consultant
    },
    associations: [{ to: { id: String(contactId) }, types: [{ associationCategory: "HUBSPOT_DEFINED", associationTypeId: 204 }] }],
  });
}

module.exports = { composeNote, postNote, createComplianceTask };
