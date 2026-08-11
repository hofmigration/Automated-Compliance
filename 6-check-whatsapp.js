// 6-check-whatsapp.js — SCRIPT 6. WhatsApp is required only when the client was
// NOT reached (Busy / No answer / Left voicemail / Left live message / Wrong number).
// If the call was Connected, nothing is required here.
const { SETTINGS } = require("./config");

module.exports = async function checkWhatsapp(d) {
  if (!d.available.whatsapps || !d.available.calls) return [];   // lookup broke -> stay silent
  const latestCall = d.calls[0];
  if (!latestCall || !latestCall.outcome) return [];    // no call, or unknown outcome -> script 3 handles it
  const skip = SETTINGS.WHATSAPP_SKIP_CALL_OUTCOMES.map((s) => s.toLowerCase());
  if (skip.includes(String(latestCall.outcome).toLowerCase())) return [];

  const wa = d.whatsapps[0];
  if (!wa) return [{ area: "whatsapp", problem: `Call was "${latestCall.outcome}" but no WhatsApp logged`, action: "send the client a WhatsApp message" }];

  const gapH = (wa.when - latestCall.when) / 3600000;
  if (gapH > SETTINGS.WHATSAPP_DELAY_HOURS)
    return [{ area: "whatsapp", problem: `WhatsApp sent ${Math.round(gapH)}h after the call`, action: "send the WhatsApp follow up within 24 hours" }];
  return [];
};
