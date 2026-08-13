// 5-check-email.js — SCRIPT 5. An email must have been sent; if sent, it must be clean.
// Signature link checks REMOVED (they were firing on nearly every email).
const { strip } = require("./0-hubspot");
const { SETTINGS } = require("./config");

async function gemini(kind, text) {
  if (!process.env.GEMINI_KEY || !text || !text.trim()) return [];
  const clean = String(text).replace(/https?:\/\/\S+/g, "[link]").slice(0, 4000);
  const prompt = `You are a STRICT email QA auditor. List ONLY clear spelling mistakes or leftover template placeholders in this ${kind}. Ignore formatting, tone and signatures. Reply ONLY a JSON array of short strings (max 3), or [] if clean. Text:\n"""${clean}"""`;
  try {
    const res = await fetch(`https://generativelanguage.googleapis.com/v1beta/models/${SETTINGS.GEMINI_MODEL}:generateContent?key=${process.env.GEMINI_KEY}`,
      { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ contents: [{ parts: [{ text: prompt }] }], generationConfig: { temperature: 0 } }) });
    const t = (await res.json())?.candidates?.[0]?.content?.parts?.[0]?.text || "[]";
    const m = t.match(/\[[\s\S]*\]/);
    return m ? JSON.parse(m[0]) : [];
  } catch { return []; }
}

module.exports = async function checkEmail(d) {
  if (!d.available.emails) return [];          // lookup broke -> stay silent
  const e = d.emails[0];

  // Rule: the email is expected once a call has been logged. If no call exists,
  // script 3 asks them to call — asking for both at once just piles on.
  if (!e) {
    if (d.available.calls && d.calls.length > 0)
      return [{ area: "email", problem: "Call logged but no email sent", action: "send the client an email" }];
    return [];
  }

  const issues = [];
  const raw = e.hs_email_html || e.hs_email_text || "";
  const subject = e.hs_email_subject || "";

  if (/\{\{|\}\}|\[first ?name\]|\[name\]|%[a-z_]+%/i.test(subject))
    issues.push({ area: "email", problem: "Unfilled placeholder in email subject", action: "correct the placeholder in the email subject" });

  // Greeting must contain the CLIENT'S name. The old version grabbed whatever word
  // followed "Hi" and assumed it was a name, so "Hi, please find details" passed.
  // Now it looks for a real part of the contact's name near the greeting.
  const head = strip(raw).slice(0, 90);
  const greeted = /\b(hi|hello|dear|good\s+(morning|afternoon|evening))\b/i.test(head);
  const nameTokens = String(d.name || "").split(/\s+/).filter((t) => t.replace(/[^A-Za-z]/g, "").length >= 3)
    .map((t) => t.toLowerCase().replace(/[^a-z]/g, ""));
  if (greeted && nameTokens.length && !nameTokens.some((t) => head.toLowerCase().includes(t)))
    issues.push({ area: "email", problem: "Email greeting has no client name", action: "add the client name in the email greeting" });

  if (SETTINGS.CHECK_EMAIL_SPELLING) {
    for (const s of await gemini("email subject", subject)) issues.push({ area: "email", problem: `Subject: ${s}`, action: "correct the mistake in the email subject" });
    for (const s of await gemini("email body", e.hs_email_text || raw)) issues.push({ area: "email", problem: `Email: ${s}`, action: "correct the mistakes in the email" });
  }
  return issues;
};
