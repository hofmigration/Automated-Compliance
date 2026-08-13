// 8-check-stage-match.js — SCRIPT 8. THE INTELLIGENT CHECK.
// Reads what the consultant actually WROTE in the call notes and compares it with
// the lead stage they selected. Catches cases like: the note says the client was
// spoken to and is qualified/interested, but the lead stage still says "No Answer".
// Only runs when there are real call notes, and only flags a CLEAR contradiction.
const { SETTINGS } = require("./config");

const VALID_STAGES = [
  "USA NIW", "Qualified CAN", "Qualified AUS", "Sale", "Visit Visa",
  "Germany Opportunity Card", "Qualified Spain", "No Answer", "They Didn't Fill",
  "Call Back", "Wrong Number", "Ineligible", "Occupation Not Listed", "Cannot Dial",
  "Outside GCC", "Switched off", "Portugal D2/D8", "Already Migrated", "Duplicate",
  "Started With Competitor", "Work Permit",
];

// Stages that claim the client was never reached. If the notes show a real
// conversation, that is a contradiction worth flagging.
const NOT_REACHED = ["no answer", "switched off", "cannot dial"];

module.exports = async function checkStageMatch(d) {
  if (!SETTINGS.CHECK_STAGE_MATCH || !process.env.GEMINI_KEY) return [];
  if (!d.leadStage) return [];                                   // stage first (script 2)
  const notes = d.calls.map((c) => c.note).filter((n) => n && n.length > 15);
  if (!notes.length) return [];

  const stage = String(d.leadStage).toLowerCase();
  const outcomes = d.calls.map((c) => c.outcome).filter(Boolean).join(", ");

  const prompt = `You audit an immigration consultancy's CRM. A consultant logged calls with these notes and selected a lead stage. Decide if the lead stage CLEARLY contradicts the notes.

Lead stage selected: "${d.leadStage}"
Call outcomes logged: ${outcomes || "none"}
Call notes:
${notes.map((n) => `- ${n}`).join("\n")}

Valid lead stages: ${VALID_STAGES.join(", ")}

Flag a mismatch ONLY if the notes clearly show something the stage denies — for example the notes show the client was spoken to, is interested, or qualifies for a country, but the stage says "No Answer" / "Switched off" / "Cannot Dial". Do NOT guess. If the notes are vague, short, or consistent with the stage, there is no mismatch.

Reply ONLY JSON: {"mismatch": true|false, "suggested": "<one valid lead stage or empty>", "reason": "<max 12 words>"}`;

  try {
    const res = await fetch(`https://generativelanguage.googleapis.com/v1beta/models/${SETTINGS.GEMINI_MODEL}:generateContent?key=${process.env.GEMINI_KEY}`,
      { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ contents: [{ parts: [{ text: prompt }] }], generationConfig: { temperature: 0 } }) });
    const t = (await res.json())?.candidates?.[0]?.content?.parts?.[0]?.text || "";
    const m = t.match(/\{[\s\S]*\}/);
    if (!m) return [];
    const j = JSON.parse(m[0]);
    if (!j.mismatch) return [];

    // Extra safety: only report when the stage claims the client was not reached,
    // OR the AI proposes a different, valid stage.
    const suggested = VALID_STAGES.find((s) => s.toLowerCase() === String(j.suggested || "").toLowerCase());
    if (!NOT_REACHED.includes(stage) && !suggested) return [];

    return [{
      area: "stagematch",
      problem: `Lead stage "${d.leadStage}" does not match the call notes (${j.reason || "notes show otherwise"})`,
      action: suggested ? `change the lead stage to ${suggested} as per the call notes` : "correct the lead stage as per the call notes",
    }];
  } catch { return []; }
};
