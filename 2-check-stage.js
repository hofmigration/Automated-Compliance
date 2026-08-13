// 2-check-stage.js — SCRIPT 2. Lead stage and outcome.
//
// Rule: if the lead stage is not marked, that is the first thing to fix.
// (When the stage IS marked, the stage-dependent scripts 4, 6 and 8 take over.)
const { SETTINGS } = require("./config");

module.exports = function checkStage(d) {
  const issues = [];

  // identity (from the original SOP: check client name, then occupation)
  if (!d.name) issues.push({ area: "data", problem: "Contact has no name", action: "add the client name" });

  if (!d.leadStage) {
    issues.push({ area: "stage", problem: "No lead stage marked", action: "mark the lead stage" });
  } else if (d.calls.length > 0 && !d.outcome) {
    // outcome depends on the call, so only expected once a call exists
    issues.push({ area: "outcome", problem: "Call logged but no outcome marked", action: "mark the outcome" });
  }

  if (SETTINGS.CHECK_OCCUPATION && !d.occupation)
    issues.push({ area: "data", problem: "Occupation is blank", action: "fill in the client occupation" });

  return issues;
};
