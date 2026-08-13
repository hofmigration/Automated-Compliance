// 6-check-whatsapp.js — SCRIPT 6. WhatsApp follow-up.
//
// Rules:
//   Required only when the client was NOT reached — i.e. any call outcome except
//   the ones in WHATSAPP_SKIP_CALL_OUTCOMES (Connected).
//   The WhatsApp must come AFTER that call. An older WhatsApp does not count,
//   otherwise a message from weeks ago would satisfy today's no-answer call.
//   Once logged: must be within WHATSAPP_DELAY_HOURS, and free of spelling mistakes.
// Stage-dependent: stays quiet until the lead stage is marked (script 2 asks first).
// Stays silent if the WhatsApp or call lookup failed.
const { SETTINGS } = require("./config");

async function gemini(text) {
  if (!process.env.GEMINI_KEY || !text || !text.trim()) return [];
  const prompt = `You are a STRICT QA auditor. List ONLY clear spelling mistakes in this WhatsApp message from a consultant to a client. Ignore casual tone, greetings and emoji. Reply ONLY a JSON array of short strings (max 3), or [] if clean. Text:\n"""${String(text).slice(0, 1500)}"""`;
  try {
    const res = await fetch(`https://generativelanguage.googleapis.com/v1beta/models/${SETTINGS.GEMINI_MODEL}:generateContent?key=${process.env.GEMINI_KEY}`,
      { method: "POST", headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ contents: [{ parts: [{ text: prompt }] }], generationConfig: { temperature: 0 } }) });
    const t = (await res.json())?.candidates?.[0]?.content?.parts?.[0]?.text || "[]";
    const m = t.match(/\[[\s\S]*\]/);
    return m ? JSON.parse(m[0]) : [];
  } catch { return []; }
}

module.exports = async function checkWhatsapp(d) {
  if (!d.available.whatsapps || !d.available.calls) return [];
  if (!d.leadStage) return [];

  const latestCall = d.calls[0];
  if (!latestCall || !latestCall.outcome) return [];      // script 3 handles those
  const skip = SETTINGS.WHATSAPP_SKIP_CALL_OUTCOMES.map((s) => s.toLowerCase());
  if (skip.includes(String(latestCall.outcome).toLowerCase())) return [];

  // only a WhatsApp sent AFTER the call counts as the follow-up for it
  const followUp = d.whatsapps.find((w) => w.when >= latestCall.when);

  if (!followUp)
    return [{ area: "whatsapp", problem: `Call was "${latestCall.outcome}" but no WhatsApp logged after it`, action: "send the client a WhatsApp message" }];

  const issues = [];
  const gapH = (followUp.when - latestCall.when) / 3600000;
  if (gapH > SETTINGS.WHATSAPP_DELAY_HOURS)
    issues.push({ area: "whatsapp", problem: `WhatsApp sent ${Math.round(gapH)}h after the call`, action: `send the WhatsApp follow up within ${SETTINGS.WHATSAPP_DELAY_HOURS} hours` });

  if (SETTINGS.CHECK_WHATSAPP_SPELLING)
    for (const m of await gemini(followUp.body))
      issues.push({ area: "whatsapp", problem: `WhatsApp: ${m}`, action: "correct the mistakes in the WhatsApp message" });

  return issues;
};
