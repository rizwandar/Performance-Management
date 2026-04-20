const APP_NAME = 'In Good Hands';
const APP_URL  = process.env.CLIENT_URL || 'http://localhost:5173';

// ---------------------------------------------------------------------------
// Base layout — wraps all emails in consistent branding
// ---------------------------------------------------------------------------
function layout(content) {
  return `
    <!DOCTYPE html>
    <html lang="en">
    <head>
      <meta charset="UTF-8"/>
      <meta name="viewport" content="width=device-width, initial-scale=1.0"/>
    </head>
    <body style="margin:0; padding:0; background:#F0F7F2; font-family: Georgia, 'Times New Roman', serif;">
      <table width="100%" cellpadding="0" cellspacing="0" style="background:#F0F7F2; padding: 40px 0;">
        <tr>
          <td align="center">
            <table width="600" cellpadding="0" cellspacing="0" style="background:#ffffff; border-radius:12px; overflow:hidden; max-width:600px; width:100%;">

              <!-- Header -->
              <tr>
                <td style="background: linear-gradient(135deg, #1A3D28, #2D5A3D); padding: 32px 40px; text-align:center;">
                  <h1 style="margin:0; color:#ffffff; font-size:26px; font-weight:normal; letter-spacing:1px;">
                    ${APP_NAME}
                  </h1>
                  <p style="margin:6px 0 0; color:#A8C5B0; font-size:13px;">
                    Everything in good hands
                  </p>
                </td>
              </tr>

              <!-- Body -->
              <tr>
                <td style="padding: 40px; color:#1F2937; font-size:16px; line-height:1.7;">
                  ${content}
                </td>
              </tr>

              <!-- Footer -->
              <tr>
                <td style="background:#F0F7F2; padding:24px 40px; text-align:center; border-top:1px solid #D6E8DC;">
                  <p style="margin:0; color:#6B7280; font-size:13px;">
                    This email was sent by ${APP_NAME}.<br/>
                    If you did not expect this email, you can safely ignore it.
                  </p>
                </td>
              </tr>

            </table>
          </td>
        </tr>
      </table>
    </body>
    </html>
  `;
}

// ---------------------------------------------------------------------------
// Button helper
// ---------------------------------------------------------------------------
function button(text, url) {
  return `
    <p style="text-align:center; margin: 32px 0;">
      <a href="${url}"
         style="background:#2D5A3D; color:#ffffff; padding:14px 32px; border-radius:8px;
                text-decoration:none; font-size:16px; display:inline-block;">
        ${text}
      </a>
    </p>
    <p style="text-align:center; font-size:12px; color:#9CA3AF; margin-top:-16px;">
      Or copy this link into your browser:<br/>
      <span style="color:#6D28D9;">${url}</span>
    </p>
  `;
}

// ---------------------------------------------------------------------------
// Email verification — sent on registration
// ---------------------------------------------------------------------------
function emailVerificationEmail({ name, verifyLink }) {
  return layout(`
    <p>Dear ${name},</p>
    <p>
      Thank you for creating your account on <strong>${APP_NAME}</strong>.
    </p>
    <p>
      To complete your registration, please verify your email address by clicking the button below.
      This link is valid for <strong>24 hours</strong>.
    </p>
    ${button('Verify my email address', verifyLink)}
    <p style="color:#6B7280; font-size:14px;">
      If you did not create an account with us, you can safely ignore this email.
    </p>
    <p style="color:#6B7280; font-size:14px;">
      With care,<br/>
      The ${APP_NAME} team
    </p>
  `);
}

// ---------------------------------------------------------------------------
// Welcome email — sent after email is verified
// ---------------------------------------------------------------------------
function welcomeEmail({ name }) {
  return layout(`
    <p>Dear ${name},</p>
    <p>
      Welcome to <strong>${APP_NAME}</strong>. We're glad you're here. We know
      this kind of planning takes courage to start.
    </p>
    <p>
      Your account is ready. When you're ready, you can begin filling in your details
      at whatever pace feels right for you. There's no rush, and you can always come back
      and add more over time.
    </p>
    <p>
      What you record here will one day give the people you love the clarity and
      comfort they need. That is a profound gift.
    </p>
    ${button('Begin my journey', `${APP_URL}/login`)}
    <p style="color:#6B7280; font-size:14px;">
      With care,<br/>
      The ${APP_NAME} team
    </p>
  `);
}

// ---------------------------------------------------------------------------
// Password reset email
// ---------------------------------------------------------------------------
function passwordResetEmail({ name, resetLink }) {
  return layout(`
    <p>Dear ${name},</p>
    <p>
      We received a request to reset the password on your ${APP_NAME} account.
    </p>
    <p>
      Click the button below to choose a new password. This link is valid for
      <strong>1 hour</strong>.
    </p>
    ${button('Reset my password', resetLink)}
    <p style="color:#6B7280; font-size:14px;">
      If you didn't request a password reset, you can safely ignore this email.
      Your account remains secure and nothing has changed.
    </p>
    <p style="color:#6B7280; font-size:14px;">
      With care,<br/>
      The ${APP_NAME} team
    </p>
  `);
}

// ---------------------------------------------------------------------------
// Inactivity reminder email
// ---------------------------------------------------------------------------
function inactivityReminderEmail({ name, daysLeft, inactivityPeriodMonths }) {
  const urgency = daysLeft <= 1
    ? 'This is a final, gentle reminder.'
    : daysLeft <= 7
      ? 'We wanted to reach out while there\'s still a little time.'
      : 'We wanted to give you plenty of notice.';

  const daysText = daysLeft === 1 ? '1 day' : `${daysLeft} days`;

  return layout(`
    <p>Dear ${name},</p>
    <p>${urgency}</p>
    <p>
      Your ${APP_NAME} account is set to notify your trusted contacts if we don't
      hear from you within your chosen period of
      <strong>${inactivityPeriodMonths} month${inactivityPeriodMonths === 1 ? '' : 's'}</strong>.
    </p>
    <p>
      We haven't seen you log in for a while. Your trusted contacts will be notified
      in <strong>${daysText}</strong>, unless you check in.
    </p>
    <p>
      If you're well and everything is fine, simply logging in will reset your timer.
      No other action is needed.
    </p>
    ${button("I'm okay, reset my timer", `${APP_URL}/login`)}
    <p style="color:#6B7280; font-size:14px;">
      If your circumstances have changed and you'd like to update who has access
      to your information, or adjust your notification period, you can do so from
      your account settings after logging in.
    </p>
    <p style="color:#6B7280; font-size:14px;">
      With care,<br/>
      The ${APP_NAME} team
    </p>
  `);
}

// ---------------------------------------------------------------------------
// Trusted contact access link email
// ---------------------------------------------------------------------------
function contactAccessEmail({ recipientName, ownerName, accessLink, expiresHours }) {
  return layout(`
    <p>Dear ${recipientName},</p>
    <p>
      <strong>${ownerName}</strong> has entrusted you with access to parts of their
      personal plans through <strong>${APP_NAME}</strong>.
    </p>
    <p>
      This is a secure, read-only link. It allows you to view the information
      ${ownerName} has chosen to share with you. The link is valid for
      <strong>${expiresHours} hours</strong>.
    </p>
    ${button('View shared information', accessLink)}
    <p style="color:#6B7280; font-size:14px;">
      This link is unique to you and will expire after ${expiresHours} hours.
      If you need access again, ${ownerName} can generate a new link from their account.
    </p>
    <p style="color:#6B7280; font-size:14px;">
      If you were not expecting this message, you can safely ignore it.
      No action is required.
    </p>
    <p style="color:#6B7280; font-size:14px;">
      With care,<br/>
      The ${APP_NAME} team
    </p>
  `);
}

// ---------------------------------------------------------------------------
// Vault attempt alert
// ---------------------------------------------------------------------------
function vaultAttemptEmail({ name, attempts, remaining, maxAttempts }) {
  const logoutWarning = attempts >= 3
    ? `<p style="background:#FEF2F2; border:1px solid #FECACA; border-radius:8px; padding:14px 16px; color:#991B1B; font-size:14px;">
        <strong>Security notice:</strong> After 3 incorrect attempts you are automatically signed out
        and must log in again before trying. After ${maxAttempts} total attempts your vault data will be permanently deleted.
       </p>`
    : '';

  return layout(`
    <p>Dear ${name},</p>
    <p>
      We detected a failed attempt to access your vault on <strong>${APP_NAME}</strong>.
    </p>
    <p style="background:#FFF7ED; border:1px solid #FED7AA; border-radius:8px; padding:14px 16px; font-size:14px; color:#92400E;">
      <strong>Attempt ${attempts} of ${maxAttempts}</strong>${remaining > 0 ? `: ${remaining} attempt${remaining !== 1 ? 's' : ''} remaining before vault data is permanently deleted.` : '.'}
    </p>
    ${logoutWarning}
    <p>
      If this was you and you have simply forgotten your vault password, you can reset it
      from within the app. Resetting will delete your vault-protected data, but all your
      other plans and wishes will be kept safe.
    </p>
    <p>
      If this was <strong>not</strong> you, someone may be attempting to access your account.
      Please change your account password immediately and contact us if you have concerns.
    </p>
    <p style="color:#6B7280; font-size:14px;">
      With care,<br/>
      The ${APP_NAME} team
    </p>
  `);
}

// ---------------------------------------------------------------------------
// Vault destroyed notification
// ---------------------------------------------------------------------------
function vaultDestroyedEmail({ name }) {
  return layout(`
    <p>Dear ${name},</p>
    <p>
      After 5 consecutive failed vault password attempts, your vault-protected data on
      <strong>${APP_NAME}</strong> has been permanently deleted as a security measure.
    </p>
    <p style="background:#FEF2F2; border:1px solid #FECACA; border-radius:8px; padding:14px 16px; color:#991B1B; font-size:14px;">
      <strong>Deleted:</strong> Your digital credentials and legal document records stored in the vault.
      All other sections (wishes, messages, financial affairs, contacts, and more) are completely safe and untouched.
    </p>
    <p>
      You can create a new vault at any time by visiting the Digital Life or Legal Documents
      sections and setting a new vault password.
    </p>
    <p>
      If you did not make these attempts, someone may have had access to your account.
      We strongly recommend changing your account password immediately.
    </p>
    <p style="color:#6B7280; font-size:14px;">
      With care,<br/>
      The ${APP_NAME} team
    </p>
  `);
}

// ---------------------------------------------------------------------------
// Account deletion confirmation
// ---------------------------------------------------------------------------
function accountDeletionConfirmEmail({ name }) {
  return layout(`
    <p>Dear ${name},</p>
    <p>
      This email confirms that your <strong>${APP_NAME}</strong> account and all associated
      data have been permanently deleted, as you requested.
    </p>
    <p style="background:#F0F9FF; border:1px solid #BAE6FD; border-radius:8px; padding:14px 16px; color:#0C4A6E; font-size:14px;">
      <strong>What was deleted:</strong> Your account, profile, all plans and wishes,
      contacts, messages, vault data, and any uploaded files. Nothing remains on our servers.
    </p>
    <p>
      We are sorry to see you go. If you ever want to start fresh, you are always welcome
      to create a new account.
    </p>
    <p style="color:#6B7280; font-size:14px;">
      With care,<br/>
      The ${APP_NAME} team
    </p>
  `);
}

// ---------------------------------------------------------------------------
// Inactivity — trusted contact notification (sent when owner's timer expires)
// ---------------------------------------------------------------------------
function inactivityContactNotificationEmail({ recipientName, ownerName, accessLink, expiresHours }) {
  return layout(`
    <p>Dear ${recipientName},</p>
    <p>
      We are reaching out on behalf of <strong>${ownerName}</strong>, who has listed you as
      a trusted contact on <strong>${APP_NAME}</strong>.
    </p>
    <p>
      ${ownerName} set up their account so that if they were not active for a period of time,
      you would be notified and given access to the plans and wishes they have recorded.
      That period has now passed, and we have not seen them log in.
    </p>
    <p>
      We are not able to confirm what this means. It may simply be that they have been away
      or have forgotten about the account. Please do try to reach them directly first if you
      can.
    </p>
    <p>
      When you are ready, you can view the information ${ownerName} has chosen to share with
      you using the secure link below. The link is valid for <strong>${expiresHours} hours</strong>.
    </p>
    ${button('View shared information', accessLink)}
    <p style="color:#6B7280; font-size:14px;">
      This link gives you read-only access to the sections ${ownerName} specifically chose
      to share with you. Sensitive vault-protected information, such as passwords, is not
      included unless ${ownerName} granted you explicit access to it.
    </p>
    <p style="color:#6B7280; font-size:14px;">
      If you were not expecting this message or believe it has been sent in error, please
      do not hesitate to contact us using the form at the bottom of the site.
    </p>
    <p style="color:#6B7280; font-size:14px;">
      With care,<br/>
      The ${APP_NAME} team
    </p>
  `);
}

module.exports = {
  emailVerificationEmail,
  welcomeEmail,
  passwordResetEmail,
  inactivityReminderEmail,
  inactivityContactNotificationEmail,
  contactAccessEmail,
  vaultAttemptEmail,
  vaultDestroyedEmail,
  accountDeletionConfirmEmail,
};
