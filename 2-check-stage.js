// 2-check-stage.js — SCRIPT 2. Lead stage + outcome must be selected.
// (Occupation is optional — turn it on with CHECK_OCCUPATION in config.)
const { SETTINGS } = require("./config");

module.exports = function checkStage(d) {
  const issues = [];
  if (!d.leadStage) issues.push({ area: "stage", problem: "No lead stage selected", action: "update the lead stage" });
  if (!d.outcome && d.calls.length > 0) issues.push({ area: "outcome", problem: "No outcome selected", action: "select the outcome" });
  if (SETTINGS.CHECK_OCCUPATION && !d.occupation) issues.push({ area: "data", problem: "Occupation is blank", action: "fill in the client occupation" });
  return issues;
};
