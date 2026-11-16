# Whiskers & Coffee

## Make "Email My Ticket" send real emails

1. **Brevo (free email service):** sign up at https://www.brevo.com
   - Senders, Domains & IPs > Senders > add and verify your email (e.g. your Gmail).
   - SMTP & API > API Keys > Generate a new API key. Copy it.
2. **GitHub:** create a new repository and upload everything in this folder.
3. **Render:** https://render.com > New > Web Service > pick your GitHub repo.
   - Build command: `npm install`
   - Start command: `npm start`
   - Environment variables:
     - `BREVO_API_KEY` = your Brevo API key
     - `SENDER_EMAIL` = the email you verified in Brevo
4. Open your Render link, make a booking, press **Email My Ticket**.

Never put the API key inside the HTML or commit it to GitHub — only in Render's Environment settings.

Run locally: `npm install`, then `BREVO_API_KEY=... SENDER_EMAIL=... npm start`, open http://localhost:3000
If the server isn't running (e.g. you open index.html directly), the button falls back to opening your email app.
