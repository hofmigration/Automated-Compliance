// 3-check-call.js — SCRIPT 3. Call logging, recency and call quality.
//
// Rules:
//   RECENCY  last call today or yesterday -> fine. 2+ days ago, or no call at all
//            -> ask them to call the client.
//   QUALITY  only judged on RECENT calls (within CALL_STALE_AFTER_DAYS). We are
//            auditing this week's work, not a call from two months ago:
//              - a recent call with no call outcome -> ask them to select it
//              - a recent call where the client WAS REACHED (Connected / Meeting
//                booked) with no description -> ask them to log the description.
//                Not asked for Busy, No answer, Left voicemail, Wrong number etc,
//                because there is nothing to describe.
//              - "NA", "N/A", "-", "." do not count as a description.
// Stays silent if the call lookup failed.
const { daysAgoPkt } = require("./0-hubspot");
const { SETTINGS } = require("./config");

const PLACEHOLDER = /^(na|n\/a|n\.a\.?|none|nil|-+|\.+|x+)$/i;
const hasDescription = (note) => {
  const t = String(note || "").trim();
  return t.length >= 3 && !PLACEHOLDER.test(t);
};

module.exports = function checkCall(d) {
  if (!d.available.calls) return [];

  if (d.calls.length === 0)
    return [{ area: "call", problem: "No call logged", action: "call the client and log the call" }];

  const issues = [];
  const newest = Math.max(...d.calls.map((c) => c.when || 0));
  const age = daysAgoPkt(newest, SETTINGS.TZ_OFFSET_HOURS);

  if (age >= SETTINGS.CALL_STALE_AFTER_DAYS)
    issues.push({
      area: "call",
      problem: `Not called recently (last call was ${age === Infinity ? "undated" : `${age} days ago`})`,
      action: "call the client and log the call",
    });

  // quality is only judged on calls made in the audit window
  const recent = d.calls.filter((c) => daysAgoPkt(c.when, SETTINGS.TZ_OFFSET_HOURS) < SETTINGS.CALL_STALE_AFTER_DAYS);
  if (!recent.length) return issues;

  if (recent.some((c) => !c.outcome))
    issues.push({ area: "call", problem: "Logged call has no call outcome", action: "select the call outcome on the logged call" });

  if (SETTINGS.CHECK_CALL_DESCRIPTION) {
    const needsDesc = SETTINGS.CALL_DESCRIPTION_REQUIRED_OUTCOMES.map((s) => s.toLowerCase());
    const bad = recent.find((c) => needsDesc.includes(String(c.outcome).toLowerCase()) && !hasDescription(c.note));
    if (bad)
      issues.push({ area: "call", problem: `"${bad.outcome}" call but no description logged`, action: "log the call description" });
  }

  return issues;
};
