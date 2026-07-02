// 4-check-task.js — SCRIPT 4. Strict follow-up task check.
// Rules: if the lead stage means "reach the client again" (Call Back / No Answer /
// Switched off), a follow-up task must exist so the lead is not wasted.
const NEEDS_FOLLOWUP = ["call back", "schedule call back", "no answer", "switched off"];
module.exports = function checkTask(d) {
  const stage = String(d.leadStage || "").toLowerCase();
  if (NEEDS_FOLLOWUP.includes(stage) && d.tasks.length === 0)
    return [{ area: "task", problem: `Lead stage "${d.leadStage}" but no follow-up task`, action: "set up the next task for further follow up" }];
  return [];
};
