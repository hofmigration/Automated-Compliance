// 4-check-task.js — SCRIPT 4. A follow-up task must be set up so the lead is not wasted.
module.exports = function checkTask(d) {
  if (d.tasks.length === 0) return [{ area: "task", problem: "No task set up", action: "set up the next task for further follow up" }];
  return [];
};
