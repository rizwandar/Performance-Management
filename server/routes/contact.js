const express = require('express');
const router  = express.Router();
const { sendEmail } = require('../lib/sendEmail');

const ADMIN_EMAIL = process.env.ADMIN_EMAIL || 'admin@igh.local';

// Rate limit is applied at the app level (apiLimiter).
// Contact form submissions require a name, email, and message.
router.post('/', async (req, res) => {
  const { name, email, subject_type, message } = req.body;

  if (!name  || !name.trim())    return res.status(400).json({ error: 'Please enter your name.' });
  if (!email || !email.trim())   return res.status(400).json({ error: 'Please enter your email address.' });
  if (!message || !message.trim()) return res.status(400).json({ error: 'Please enter a message.' });

  // Basic email format check
  if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) {
    return res.status(400).json({ error: 'Please enter a valid email address.' });
  }

  const typeLabel = {
    feedback: 'Feedback',
    support:  'Support Request',
    general:  'General Enquiry',
  }[subject_type] || 'General Enquiry';

  const html = `
    <div style="font-family: Georgia, serif; max-width: 600px; margin: 0 auto; color: #1A3D28;">
      <h2 style="color: #1A3D28; border-bottom: 2px solid #C9904A; padding-bottom: 8px;">
        In Good Hands: ${typeLabel}
      </h2>
      <table style="width: 100%; border-collapse: collapse; margin-bottom: 20px;">
        <tr>
          <td style="padding: 8px; font-weight: 600; color: #555; width: 120px;">Name</td>
          <td style="padding: 8px;">${name}</td>
        </tr>
        <tr style="background: #f9f7f2;">
          <td style="padding: 8px; font-weight: 600; color: #555;">Email</td>
          <td style="padding: 8px;"><a href="mailto:${email}">${email}</a></td>
        </tr>
        <tr>
          <td style="padding: 8px; font-weight: 600; color: #555;">Type</td>
          <td style="padding: 8px;">${typeLabel}</td>
        </tr>
      </table>
      <div style="background: #f9f7f2; border-left: 3px solid #C9904A; padding: 16px; border-radius: 4px;">
        <p style="font-weight: 600; margin-bottom: 8px; color: #555;">Message</p>
        <p style="white-space: pre-wrap; margin: 0;">${message.replace(/</g, '&lt;').replace(/>/g, '&gt;')}</p>
      </div>
    </div>
  `;

  try {
    await sendEmail({
      to:      ADMIN_EMAIL,
      subject: `[In Good Hands] ${typeLabel} from ${name}`,
      html,
    });
    console.log(`[contact] ${typeLabel} from ${email}`);
    res.json({ success: true });
  } catch (err) {
    console.error('[contact] Email failed:', err.message, '| ADMIN_EMAIL:', ADMIN_EMAIL);
    // If email fails in non-production, still acknowledge receipt
    if (process.env.NODE_ENV !== 'production') {
      console.warn('[contact] Email delivery failed — non-prod, acknowledging anyway');
      return res.json({ success: true, warning: 'Message logged but email not delivered (email not configured).' });
    }
    res.status(500).json({ error: 'We could not send your message right now. Please try again later.' });
  }
});

module.exports = router;
