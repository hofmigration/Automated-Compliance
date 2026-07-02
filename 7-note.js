// 7-note.js — SCRIPT 7. Writes the note EXACTLY in Ali's style and posts it.
// Example produced:
// "Hi @ayesha hope you are well. Kindly update the lead stage and also set up
//  the next task for further follow up. thank you."
const { hub } = require("./0-hubspot");

function composeNote(ownerFirstName, issues) {
  const first = (ownerFirstName || "there").toLowerCase();
  const actions = [...new Set(issues.map((i) => i.action))]; // dedupe repeated actions
  let ask;
  if (actions.length === 1) ask = actions[0];
  else if (actions.length === 2) ask = `${actions[0]} and also ${actions[1]}`;
  else ask = `${actions.slice(0, -1).join(", ")} and also ${actions[actions.length - 1]}`;
  return `Hi @${first} hope you are well. Kindly ${ask}. thank you.`;
}

async function postNote(contactId, ownerId, noteText) {
  await hub("POST", "/crm/v3/objects/notes", {
    properties: { hs_timestamp: new Date().toISOString(), hs_note_body: `<div>${noteText}</div>`, hubspot_owner_id: String(ownerId) },
    associations: [{ to: { id: String(contactId) }, types: [{ associationCategory: "HUBSPOT_DEFINED", associationTypeId: 202 }] }],
  });
}

module.exports = { composeNote, postNote };
