// 7-note.js — SCRIPT 7. Writes the compliance note and posts it.
//
// THE MENTION: HubSpot only renders a REAL tag (blue, clickable) when the body
// contains its mention markup. A plain "@name" is just text. Copied exactly from
// the notes in this portal:
//   <span data-mention-id="475397717" data-mention-name="Thushara M S"
//         style="color: #425b76;font-weight: 600;">@Thushara M S</span>
//
// The note is OWNED BY ALI so it reads "Note by Ali Raza".
//
// HubSpot still does not NOTIFY for mentions created via API (their docs confirm),
// so the assigned task below is what actually reaches the consultant.
const { hub } = require("./0-hubspot");
const { SETTINGS } = require("./config");

const esc = (s) => String(s || "").replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;").replace(/"/g, "&quot;");

// the real HubSpot mention markup — this is what makes it an actual tag
function mentionHtml(ownerId, fullName) {
  const n = esc(fullName);
  return `<strong><span data-mention-id="${esc(ownerId)}" data-mention-name="${n}" style="color: #425b76;font-weight: 600;">@${n}</span></strong>`;
}

function joinActions(actions) {
  if (actions.length === 1) return actions[0];
  if (actions.length === 2) return `${actions[0]} and also ${actions[1]}`;
  return `${actions.slice(0, -1).join(", ")} and also ${actions[actions.length - 1]}`;
}

// Builds the note body. Two formats, both matching notes Ali actually writes:
//   "lines"    -> greeting, then one line per issue, then Thank you   (his current style)
//   "sentence" -> "Hi @name hope you are well. Kindly x and also y. thank you."
function buildNoteHtml(ownerId, fullName, issues) {
  const P = (inner) => `<p style="margin:0;">${inner}</p>`;
  const mention = mentionHtml(ownerId, fullName);

  if ((SETTINGS.NOTE_FORMAT || "lines") === "sentence") {
    const actions = [...new Set(issues.map((i) => i.action))];
    return `<div style="" dir="auto" data-top-level="true">${P(`Hi ${mention} hope you are well. Kindly ${joinActions(actions)}. thank you.`)}</div>`;
  }

  const lines = [P(`Hi ${mention}`)];
  const actions = [...new Set(issues.map((i) => i.action))];
  actions.forEach((a, i) => lines.push(P(esc(i === 0 ? `Kindly ${a}` : `Also ${a}`))));
  lines.push(P("Thank you"));
  return `<div style="" dir="auto" data-top-level="true">${lines.join("")}</div>`;
}

// plain text version, for the log and the emails
function composeNote(fullName, issues) {
  const actions = [...new Set(issues.map((i) => i.action))];
  if ((SETTINGS.NOTE_FORMAT || "lines") === "sentence")
    return `Hi @${fullName} hope you are well. Kindly ${joinActions(actions)}. thank you.`;
  return `Hi @${fullName} | ` + actions.map((a, i) => (i === 0 ? `Kindly ${a}` : `Also ${a}`)).join(" | ") + " | Thank you";
}

async function postNote(contactId, consultantOwnerId, consultantFullName, issues) {
  await hub("POST", "/crm/v3/objects/notes", {
    properties: {
      hs_timestamp: new Date().toISOString(),
      hs_note_body: buildNoteHtml(consultantOwnerId, consultantFullName, issues),
      hubspot_owner_id: String(SETTINGS.NOTE_OWNER_ID),          // note is from Ali
      hs_at_mentioned_owner_ids: String(consultantOwnerId),      // harmless extra
    },
    associations: [{ to: { id: String(contactId) }, types: [{ associationCategory: "HUBSPOT_DEFINED", associationTypeId: 202 }] }],
  });
}

// Assigns the consultant a task — this DOES appear in their HubSpot task queue.
// Prefixed so 4-check-task.js never counts it as their follow-up task.
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
      hubspot_owner_id: String(consultantOwnerId),
    },
    associations: [{ to: { id: String(contactId) }, types: [{ associationCategory: "HUBSPOT_DEFINED", associationTypeId: 204 }] }],
  });
}

module.exports = { composeNote, buildNoteHtml, postNote, createComplianceTask };
