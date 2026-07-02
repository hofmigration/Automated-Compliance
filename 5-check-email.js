// 5-check-email.js — SCRIPT 5. Strict email QA on the latest outgoing email.
// Rules: no unfilled placeholders in the subject; greeting must include the client
// name; signature must have the company + LinkedIn links; no spelling mistakes
// (spelling judged by Gemini with a strict prompt, URLs stripped first).
const { strip, urls } = require("./0-hubspot");
const { SETTINGS } = require("./config");

async function gemini(kind, text) {
  if (!process.env.GEMINI_KEY || !text || !text.trim()) return [];
  const clean = String(text).replace(/https?:\/\/\S+/g, "[link]").slice(0, 4000);
  const prompt = `You are a STRICT email QA auditor. List every clear spelling mistake or leftover template placeholder in this ${kind}. Reply ONLY a JSON array of short strings (max 5), or [] if clean. Text:\n"""${clean}"""`;
  try {
    const res = await fetch(`https://generativelanguage.googleapis.com/v1beta/models/${SETTINGS.GEMINI_MODEL}:generateContent?key=${process.env.GEMINI_KEY}`,
      { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ contents: [{ parts: [{ text: prompt }] }], generationConfig: { temperature: 0 } }) });
    const t = (await res.json())?.candidates?.[0]?.content?.parts?.[0]?.text || "[]";
    const m = t.match(/\[[\s\S]*\]/);
    return m ? JSON.parse(m[0]) : [];
  } catch { return []; }
}

module.exports = async function checkEmail(d) {
  const e = d.emails[0];
  if (!e) return [];
  const issues = [];
  const raw = e.hs_email_html || e.hs_email_text || "";
  const subject = e.hs_email_subject || "";

  if (/\{\{|\}\}|\[first ?name\]|\[name\]|%[a-z_]+%/i.test(subject))
    issues.push({ area: "email", problem: "Unfilled placeholder in email subject", action: "correct the placeholder in the email subject" });

  const text = strip(raw);
  const m = text.match(/\b(hi|hello|dear)\b[\s,!]*([A-Za-z]*)/i);
  if (m && (!m[2] || m[2].length < 2))
    issues.push({ area: "email", problem: "Email greeting has no client name", action: "add the client name after the greeting" });

  const u = urls(raw).map((x) => x.toLowerCase());
  if (!u.some((x) => x.includes("hofmigration.com")))
    issues.push({ area: "email", problem: "Company website link missing from signature", action: "add the company website link to your signature" });
  if (!u.some((x) => x.includes("linkedin.com/company/hofmigration")))
    issues.push({ area: "email", problem: "LinkedIn link missing from signature", action: "add the LinkedIn link to your signature" });

  for (const s of await gemini("email subject", subject)) issues.push({ area: "email", problem: `Subject: ${s}`, action: "correct the mistake in the email subject" });
  for (const s of await gemini("email body", e.hs_email_text || raw)) issues.push({ area: "email", problem: `Email: ${s}`, action: "correct the mistakes in the email" });
  return issues;
};
