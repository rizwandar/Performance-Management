/**
 * Send an email via Resend.
 *
 * IMPORTANT — from address:
 *   • Default is 'onboarding@resend.dev' (Resend's shared test domain).
 *     With this sender, Resend only delivers to the email address that
 *     owns the Resend account (all others are silently dropped).
 *   • To send to ANY email address, add a verified domain in Resend and
 *     set FROM_EMAIL in server/.env (e.g. noreply@yourdomain.com).
 *
 * API key:
 *   • Set RESEND_API_KEY in server/.env. If the key is missing or invalid,
 *     emails are skipped with a console warning (no hard crash).
 */
const FROM_EMAIL = process.env.FROM_EMAIL || 'In Good Hands <onboarding@resend.dev>';

async function sendEmail({ to, subject, html }) {
  const apiKey = process.env.RESEND_API_KEY;

  if (!apiKey) {
    console.warn(`[email] RESEND_API_KEY not set — skipping email to ${to}`);
    return;
  }

  const res = await fetch('https://api.resend.com/emails', {
    method: 'POST',
    headers: {
      'Authorization': `Bearer ${apiKey}`,
      'Content-Type': 'application/json',
    },
    body: JSON.stringify({
      from:    FROM_EMAIL,
      to:      [to],
      subject,
      html,
    }),
  });

  if (!res.ok) {
    const body = await res.text();
    // 401 = invalid/expired key, 422 = unverified sender domain
    if (res.status === 401) {
      console.error(`[email] Resend API key is invalid or expired. Update RESEND_API_KEY in server/.env`);
    } else if (res.status === 422) {
      console.error(`[email] Resend rejected the sender domain. Use a verified domain and set FROM_EMAIL in server/.env`);
    } else {
      console.error(`[email] Resend error ${res.status}: ${body}`);
    }
    throw new Error(`Email delivery failed (${res.status})`);
  }

  console.log(`[email] Sent "${subject}" to ${to}`);
}

module.exports = { sendEmail };
