// 4-check-task.js — SCRIPT 4. Follow-up task.
//
// Stage-dependent: only runs once the lead stage is marked (if it is blank, script 2
// asks them to mark it first). Ignores our own "[Compliance]" tasks so the audit
// never mistakes its own task for the consultant's follow-up.
const { SETTINGS } = require("./config");

module.exports = function checkTask(d) {
  if (!d.available.tasks) return [];
  if (!d.leadStage) return [];                     // stage first

  const prefix = (SETTINGS.TASK_PREFIX || "[Compliance]").toLowerCase();
  const real = d.tasks.filter((t) => !String(t.hs_task_subject || "").toLowerCase().startsWith(prefix));
  if (real.length === 0)
    return [{ area: "task", problem: "No task set up", action: "set up the next task for further follow up" }];
  return [];
};
