// 3-check-call.js — SCRIPT 3. Call logging and call recency.
//
// Rules:
//   last call TODAY or YESTERDAY  -> fine, do not ask them to call
//   last call 2+ days ago         -> ask them to call the client
//   no call logged at all         -> ask them to call the client
//                                   (this covers "email sent but no call logged")
//   a logged call with no outcome        -> ask them to select the call outcome
//   a CONNECTED call with no description -> ask them to log the call description
// Stays silent if the call lookup failed.
const { daysAgoPkt } = require("./0-hubspot");
const { SETTINGS } = require("./config");

module.exports = function checkCall(d) {
  if (!d.available.calls) return [];

  if (d.calls.length === 0)
    return [{ area: "call", problem: "No call logged", action: "call the client and log the call" }];

  const issues = [];
  const newest = Math.max(...d.calls.map((c) => c.when || 0));
  const age = daysAgoPkt(newest, SETTINGS.TZ_OFFSET_HOURS);

  if (age >= SETTINGS.CALL_STALE_AFTER_DAYS) {
    const when = age === Infinity ? "no dated call" : `last call was ${age} days ago`;
    issues.push({ area: "call", problem: `Not called recently (${when})`, action: "call the client and log the call" });
  }

  if (d.calls.some((c) => !c.outcome))
    issues.push({ area: "call", problem: "Logged call has no call outcome", action: "select the call outcome on the logged call" });

  if (SETTINGS.CHECK_CALL_DESCRIPTION && d.calls.some(
    (c) => String(c.outcome).toLowerCase() === "connected" && (!c.note || c.note.trim().length < 3)))
    issues.push({ area: "call", problem: "Connected call but no description logged", action: "log the call description" });

  return issues;
};
