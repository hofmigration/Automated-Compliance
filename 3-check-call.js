// 3-check-call.js — SCRIPT 3. Call checks.
//  - a call must be logged
//  - the logged call must have a call outcome selected
//  - a CONNECTED call must have a description logged (spotted in Ali's own notes:
//    "Connected call but no description is logged")
// Stays silent if the call lookup failed.
const { SETTINGS } = require("./config");

module.exports = function checkCall(d) {
  if (!d.available.calls) return [];
  if (d.calls.length === 0) return [{ area: "call", problem: "No call logged", action: "log the call with the client" }];

  const issues = [];
  if (d.calls.some((c) => !c.outcome))
    issues.push({ area: "call", problem: "Logged call has no call outcome", action: "select the call outcome on the logged call" });

  if (SETTINGS.CHECK_CALL_DESCRIPTION) {
    const connectedNoDesc = d.calls.some(
      (c) => String(c.outcome).toLowerCase() === "connected" && (!c.note || c.note.trim().length < 3)
    );
    if (connectedNoDesc)
      issues.push({ area: "call", problem: "Connected call but no description logged", action: "log the call description" });
  }
  return issues;
};
