// 3-check-call.js — SCRIPT 3. A call must be logged, with a call outcome selected.
module.exports = function checkCall(d) {
  if (d.calls.length === 0) return [{ area: "call", problem: "No call logged", action: "log the call with the client" }];
  if (d.calls.some((c) => !c.outcome)) return [{ area: "call", problem: "Logged call has no call outcome", action: "select the call outcome on the logged call" }];
  return [];
};
