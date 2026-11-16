// Whiskers & Coffee server: serves the website and sends booking tickets by email.
// Email is sent with Brevo's HTTP API (free plan, works on Render where SMTP ports are blocked).
// Required environment variables (set them in Render > Environment):
//   BREVO_API_KEY  - from Brevo > SMTP & API > API Keys
//   SENDER_EMAIL   - an email address you verified in Brevo > Senders
//   SENDER_NAME    - optional, defaults to "Whiskers & Coffee"
import express from "express";
import path from "node:path";
import { fileURLToPath } from "node:url";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const app = express();
app.use(express.json({ limit: "20kb" }));
app.use(express.static(__dirname, { extensions: ["html"] }));

const esc = (v) => String(v ?? "").replace(/[&<>"']/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" }[c]));
const clip = (v, n) => String(v ?? "").trim().slice(0, n);
const EMAIL_RE = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;

// Very small rate limit: max 5 emails per IP every 10 minutes.
const hits = new Map();
function limited(ip) {
  const now = Date.now();
  const list = (hits.get(ip) || []).filter((t) => now - t < 10 * 60 * 1000);
  list.push(now);
  hits.set(ip, list);
  return list.length > 5;
}

app.post("/api/send-ticket", async (req, res) => {
  const { BREVO_API_KEY, SENDER_EMAIL, SENDER_NAME = "Whiskers & Coffee" } = process.env;
  if (!BREVO_API_KEY || !SENDER_EMAIL) return res.status(503).json({ error: "Email is not configured on the server." });
  if (limited(req.ip)) return res.status(429).json({ error: "Too many emails. Please try again later." });

  const b = req.body || {};
  const t = {
    reference: clip(b.reference, 40), name: clip(b.name, 100), email: clip(b.email, 255),
    phone: clip(b.phone, 40), date: clip(b.date, 20), time: clip(b.time, 10),
    guests: clip(b.guests, 3), duration: clip(b.duration, 4), requests: clip(b.requests, 500) || "None",
  };
  if (!t.reference || !t.name || !EMAIL_RE.test(t.email)) return res.status(400).json({ error: "Missing or invalid booking details." });

  const row = (k, v) => `<tr><td style="padding:8px 0;color:#7a5c48;font-weight:bold">${k}</td><td style="padding:8px 0">${esc(v)}</td></tr>`;
  const html = `<div style="font-family:Arial,sans-serif;max-width:520px;margin:auto;padding:24px;border:2px dashed #b87950;border-radius:16px;color:#3b2a20">
    <h2 style="margin-top:0">Thank you, ${esc(t.name)}!</h2>
    <p>Your Whiskers &amp; Coffee booking ticket is below. Please keep it for your visit.</p>
    <div style="text-align:center;background:#f7eee7;border-radius:12px;padding:14px;margin:16px 0">
      <div style="font-size:12px;letter-spacing:2px;font-weight:bold">BOOKING REFERENCE</div>
      <div style="font-size:24px;font-weight:bold;letter-spacing:1px">${esc(t.reference)}</div></div>
    <table style="width:100%;border-collapse:collapse">${row("Date", t.date)}${row("Time", t.time)}${row("Guests", t.guests)}${row("Experience", t.duration + " minutes")}${row("Phone", t.phone)}${row("Requests", t.requests)}</table>
    <p style="margin-bottom:0">See you and the cats soon! 🐾</p></div>`;

  try {
    const r = await fetch("https://api.brevo.com/v3/smtp/email", {
      method: "POST",
      headers: { "api-key": BREVO_API_KEY, "Content-Type": "application/json", Accept: "application/json" },
      body: JSON.stringify({
        sender: { name: SENDER_NAME, email: SENDER_EMAIL },
        to: [{ email: t.email, name: t.name }],
        subject: `Whiskers & Coffee booking ticket ${t.reference}`,
        htmlContent: html,
      }),
    });
    if (!r.ok) {
      console.error("Brevo error", r.status, await r.text());
      return res.status(502).json({ error: "The email service rejected the request." });
    }
    res.json({ ok: true });
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: "Could not send the email." });
  }
});

const PORT = process.env.PORT || 3000;
app.listen(PORT, () => console.log(`Whiskers & Coffee running on http://localhost:${PORT}`));
