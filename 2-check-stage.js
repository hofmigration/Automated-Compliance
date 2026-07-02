// 2-check-stage.js — SCRIPT 2. Strict check of identity fields + lead stage + outcome.
// Rules: name present, occupation present, lead stage set, and if any call is
// logged then the outcome must also be set (outcome depends on the call).
module.exports = function checkStage(d) {
  const issues = [];
  if (!d.name) issues.push({ area: "stage", problem: "Contact has no name", action: "add the client name" });
  if (!d.occupation) issues.push({ area: "stage", problem: "Occupation is blank", action: "fill in the client occupation" });
  if (!d.leadStage) issues.push({ area: "stage", problem: "Lead stage not set", action: "update the lead stage" });
  if (d.calls.length > 0 && !d.outcome) issues.push({ area: "stage", problem: "Call logged but outcome not marked", action: "mark the outcome" });
  return issues;
};
