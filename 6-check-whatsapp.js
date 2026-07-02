// 6-check-whatsapp.js — SCRIPT 6. Strict WhatsApp check.
// Rules: if the latest call outcome is anything except "Connected", a WhatsApp
// message must be logged. If logged, it must be within 24h and free of mistakes.
const { SETTINGS } = require("./config");

async function gemini(text) {
  if (!process.env.GEMINI_KEY || !text || !text.trim()) return [];
  const prompt = `You are a STRICT QA auditor. List every clear spelling mistake in this WhatsApp message from a consultant to a client. Reply ONLY a JSON array of short strings (max 3), or []. Text:\n"""${String(text).slice(0, 1500)}"""`;
  try {
    const res = await fetch(`https://generativelanguage.googleapis.com/v1beta/models/${SETTINGS.GEMINI_MODEL}:generateContent?key=${process.env.GEMINI_KEY}`,
      { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ contents: [{ parts: [{ text: prompt }] }], generationConfig: { temperature: 0 } }) });
    const t = (await res.json())?.candidates?.[0]?.content?.parts?.[0]?.text || "[]";
    const m = t.match(/\[[\s\S]*\]/);
    return m ? JSON.parse(m[0]) : [];
  } catch { return []; }
}

module.exports = async function checkWhatsapp(d) {
  const issues = [];
  const latestCall = d.calls[0];
  if (!latestCall) return issues; // no call -> script 3 already flags it
  const skip = SETTINGS.WHATSAPP_SKIP_CALL_OUTCOMES.map((s) => s.toLowerCase());
  const required = !skip.includes(String(latestCall.outcome).toLowerCase());
  const wa = d.whatsapps[0];

  if (required && !wa) {
    issues.push({ area: "whatsapp", problem: `Call was "${latestCall.outcome}" but no WhatsApp logged`, action: "send the client a WhatsApp follow up" });
    return issues;
  }
  if (wa) {
    const gapH = (wa.when - latestCall.when) / 3600000;
    if (required && gapH > SETTINGS.WHATSAPP_DELAY_HOURS)
      issues.push({ area: "whatsapp", problem: `WhatsApp sent ${Math.round(gapH)}h after the call (limit ${SETTINGS.WHATSAPP_DELAY_HOURS}h)`, action: "send the WhatsApp follow up within 24 hours" });
    for (const s of await gemini(wa.body)) issues.push({ area: "whatsapp", problem: `WhatsApp: ${s}`, action: "correct the mistakes in the WhatsApp message" });
  }
  return issues;
};
