// 3-check-call.js — SCRIPT 3. Strict call check.
// Rules: every worked lead must have a logged call. A note is not a logged call.
// Every logged call must carry a call outcome (Busy / Connected / etc).
module.exports = function checkCall(d) {
  const issues = [];
  if (d.calls.length === 0) {
    issues.push({ area: "call", problem: "No call logged", action: "log your call with the client" });
    return issues;
  }
  if (d.calls.some((c) => !c.outcome)) issues.push({ area: "call", problem: "Logged call has no call outcome selected", action: "select the call outcome on your logged call" });
  return issues;
};
