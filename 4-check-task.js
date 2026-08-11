// 4-check-task.js — SCRIPT 4. A follow-up task must be set up so the lead is not wasted.
// Ignores tasks WE created (the "[Compliance]" ones), otherwise the audit would
// see its own task and wrongly pass the contact.
// Stays silent if the task lookup failed.
const { SETTINGS } = require("./config");

module.exports = function checkTask(d) {
  if (!d.available.tasks) return [];
  const prefix = (SETTINGS.TASK_PREFIX || "[Compliance]").toLowerCase();
  const real = d.tasks.filter((t) => !String(t.hs_task_subject || "").toLowerCase().startsWith(prefix));
  if (real.length === 0) return [{ area: "task", problem: "No task set up", action: "set up the next task for further follow up" }];
  return [];
};
