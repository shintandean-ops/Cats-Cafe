// Whiskers & Coffee server: serves the website and sends booking tickets by email via Resend.
// Required environment variable in Render > Environment:
//   RESEND_API_KEY - from Resend > API Keys (starts with re_)
import express from "express";
import path from "node:path";
import { fileURLToPath } from "node:url";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const app = express();
app.use(express.json({ limit: "20kb" }));
app.use(express.static(__dirname, { extensions: ["html"] }));

const esc = (v) => String(v ?? "").replace(/[&<>"']/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "'" }[c]));
const clip = (v, n) => String(v ?? "").trim().slice(0, n);
const EMAIL_RE = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;

const hits = new Map();
function limited(ip) {
  const now = Date.now();
  const list = (hits.get(ip) || []).filter((t) => now - t < 10 * 60 * 1000);
  list.push(now);
  hits.set(ip, list);
  return list.length > 5;
}

app.post("/api/send-ticket", async (req, res) => {
  const { RESEND_API_KEY, SENDER_EMAIL = "Whiskers & Coffee <onboarding@resend.dev>" } = process.env;
  if (!RESEND_API_KEY) return res.status(503).json({ error: "Email is not configured on the server." });
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
    const r = await fetch("https://api.resend.com/emails", {
      method: "POST",
      headers: { Authorization: `Bearer ${RESEND_API_KEY}`, "Content-Type": "application/json" },
      body: JSON.stringify({
        from: SENDER_EMAIL,
        to: [t.email],
        subject: `Whiskers & Coffee booking ticket ${t.reference}`,
        html,
      }),
    });
    if (!r.ok) {
      console.error("Resend error", r.status, await r.text());
      return res.status(502).json({ error: "The email service rejected the request." });
    }
    res.json({ ok: true });
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: "Could not send the email." });
  }
});

app.post("/api/contact", async (req, res) => {
  const {
    RESEND_API_KEY,
    SENDER_EMAIL = "Whiskers & Coffee <onboarding@resend.dev>",
    CONTACT_EMAIL
  } = process.env;

  if (!RESEND_API_KEY || !CONTACT_EMAIL) {
    return res.status(503).json({
      error: "Contact email is not configured on the server."
    });
  }

  if (limited(req.ip)) {
    return res.status(429).json({
      error: "Too many messages. Please try again later."
    });
  }

  const b = req.body || {};

  const contact = {
    name: clip(b.name, 100),
    email: clip(b.email, 255),
    subject: clip(b.subject, 100),
    message: clip(b.message, 2000)
  };

  if (
    !contact.name ||
    !EMAIL_RE.test(contact.email) ||
    !contact.subject ||
    !contact.message
  ) {
    return res.status(400).json({
      error: "Please complete all fields with a valid email address."
    });
  }

  const html = `
    <div style="font-family:Arial,sans-serif;max-width:600px;margin:auto;padding:24px;color:#3b2a20">
      <h2>New Contact Us Message</h2>
      <p><strong>Name:</strong> ${esc(contact.name)}</p>
      <p><strong>Email:</strong> ${esc(contact.email)}</p>
      <p><strong>Subject:</strong> ${esc(contact.subject)}</p>
      <hr>
      <h3>Message</h3>
      <p style="white-space:pre-wrap">${esc(contact.message)}</p>
    </div>
  `;

  try {
    const r = await fetch("https://api.resend.com/emails", {
      method: "POST",
      headers: {
        Authorization: `Bearer ${RESEND_API_KEY}`,
        "Content-Type": "application/json"
      },
      body: JSON.stringify({
        from: SENDER_EMAIL,
        to: [CONTACT_EMAIL],
        reply_to: contact.email,
        subject: `Website Contact: ${contact.subject}`,
        html
      })
    });

    if (!r.ok) {
      console.error("Resend contact error", r.status, await r.text());
      return res.status(502).json({
        error: "The email service could not send your message."
      });
    }

    res.json({
      ok: true,
      message: "Your message has been sent successfully!"
    });

  } catch (err) {
    console.error(err);
    res.status(500).json({
      error: "Could not send your message."
    });
  }
});



const PORT = process.env.PORT || 3000;
app.listen(PORT, () => console.log(`Whiskers & Coffee running on http://localhost:${PORT}`));
