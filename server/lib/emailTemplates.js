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
// Trial ending reminder (BIL-04) - sent 2 days before a card-required trial
// converts to a paid subscription. The FTC's click-to-cancel rule and most
// state auto-renewal laws require this kind of advance notice before a card
// already on file gets charged.
// ---------------------------------------------------------------------------
function trialEndingReminderEmail({ name, planName, price, chargeDate }) {
  return layout(`
    <p>Dear ${name},</p>
    <p>
      Your free trial of <strong>${APP_NAME} ${planName}</strong> ends in 2 days, on
      <strong>${chargeDate}</strong>. After that, your card on file will be charged
      <strong>${price}</strong> and your subscription will continue automatically.
    </p>
    <p style="background:#F0F9FF; border:1px solid #BAE6FD; border-radius:8px; padding:14px 16px; color:#0C4A6E; font-size:14px;">
      Want to cancel? You can do so anytime before ${chargeDate} in one click, no charge at all.
    </p>
    ${button('Manage my subscription', `${APP_URL}/profile/settings`)}
    <p style="color:#6B7280; font-size:14px;">
      If you'd like to keep your Premium access, there's nothing you need to do.
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
  const validityLine = expiresHours
    ? `The link is valid for <strong>${expiresHours} hours</strong>.`
    : `This link does not expire.`;
  const expiryFootnote = expiresHours
    ? `This link is unique to you and will expire after ${expiresHours} hours.
       If you need access again, ${ownerName} can generate a new link from their account.`
    : `This link is unique to you and does not expire.`;
  return layout(`
    <p>Dear ${recipientName},</p>
    <p>
      <strong>${ownerName}</strong> has entrusted you with access to parts of their
      personal plans through <strong>${APP_NAME}</strong>.
    </p>
    <p>
      ${APP_NAME} is a service people use to record their wishes and important information
      ahead of time and share it with people they care about. ${ownerName} wanted you to
      have access to some of what they've recorded.
    </p>
    <p>
      This is a secure, read-only link. It allows you to view the information
      ${ownerName} has chosen to share with you. ${validityLine}
    </p>
    ${button('View shared information', accessLink)}
    <p style="color:#6B7280; font-size:14px;">
      ${expiryFootnote}
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
        and must log in again before trying. After ${maxAttempts} total attempts your vault will be
        temporarily locked for 15 minutes. Nothing is ever deleted for incorrect attempts.
       </p>`
    : '';

  return layout(`
    <p>Dear ${name},</p>
    <p>
      We detected a failed attempt to access your vault on <strong>${APP_NAME}</strong>.
    </p>
    <p style="background:#FFF7ED; border:1px solid #FED7AA; border-radius:8px; padding:14px 16px; font-size:14px; color:#92400E;">
      <strong>Attempt ${attempts} of ${maxAttempts}</strong>${remaining > 0 ? `: ${remaining} attempt${remaining !== 1 ? 's' : ''} remaining before a temporary 15-minute lockout.` : '.'}
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
// Vault temporarily locked notification
// ---------------------------------------------------------------------------
function vaultLockedEmail({ name, lockedUntil, minutes }) {
  const until = new Date(lockedUntil).toLocaleString('en-US', {
    dateStyle: 'medium', timeStyle: 'short',
  });
  return layout(`
    <p>Dear ${name},</p>
    <p>
      After 5 consecutive failed vault password attempts, your vault on
      <strong>${APP_NAME}</strong> has been temporarily locked for ${minutes} minutes as a security measure.
    </p>
    <p style="background:#FFF7ED; border:1px solid #FED7AA; border-radius:8px; padding:14px 16px; color:#92400E; font-size:14px;">
      <strong>Nothing has been deleted.</strong> Your vault-protected data is completely safe.
      You can try again after ${until}, or enter the correct password sooner to unlock it immediately.
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
      ${APP_NAME} is a service people use to record their wishes and important information
      ahead of time and share it with people they care about. ${ownerName} set this up so
      that if something happened to them, the people they trust most, including you, would
      have what they need.
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
      you using the secure link below. ${expiresHours
        ? `The link is valid for <strong>${expiresHours} hours</strong>.`
        : `This link does not expire.`}
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

// ---------------------------------------------------------------------------
// Executor designation — sent the moment an owner makes someone their executor,
// well before anything has happened. Introduces the service itself (this may
// be the recipient's first-ever contact with In Good Hands), explains the
// role, includes an immediate 14-day read-only preview link (accessLink, see
// generateAccessLink's 'executor_preview' purpose) so an executor has what
// they need for funeral/practical arrangements without waiting out the
// owner's full inactivity period, and separately covers both the automatic
// timer and reporting a passing directly, since funerals often happen within
// days.
// ---------------------------------------------------------------------------
function executorDesignatedEmail({ recipientName, ownerName, inactivityPeriodMonths, accessLink, reportDeathLink }) {
  return layout(`
    <p>Dear ${recipientName},</p>
    <p>
      <strong>${ownerName}</strong> has named you as their Legacy Contact on <strong>${APP_NAME}</strong>.
      There is nothing you need to do right now, this is simply so you know what the role
      means and what to expect.
    </p>
    <p>
      ${APP_NAME} is a service people use to record their wishes and important information
      ahead of time and share it with people they care about. ${ownerName} set this up so
      that if something happened to them, the people they trust most, including you, would
      have what they need.
    </p>
    <p>
      As Legacy Contact, you may need this information on short notice, for funeral arrangements
      and other practical matters, so we're giving you read-only access right away rather than
      making you wait. The link below lets you view everything ${ownerName} has recorded,
      except their private vault credentials, which are never shared this way.
      <strong>It's valid for 14 days and is for your reference only</strong>, it does not let
      you report anything.
    </p>
    ${button('View shared information', accessLink)}
    <p>
      If ${ownerName} does not log into their account for <strong>${inactivityPeriodMonths} months</strong>,
      or if someone lets us know they have passed away, you will receive a separate email with
      a new link. That one works the same way but also lets you confirm what has happened,
      which is what actually notifies their other trusted contacts and the people they asked
      to be told.
    </p>
    ${button('Report a passing', reportDeathLink)}
    <p style="color:#6B7280; font-size:14px;">
      It's worth keeping ${ownerName}'s account email address handy, since that's what
      you'll need to use the link above.
    </p>
    <p style="color:#6B7280; font-size:14px;">
      If you were not expecting this message or believe it has been sent in error, please
      contact us using the form at the bottom of the site.
    </p>
    <p style="color:#6B7280; font-size:14px;">
      With care,<br/>
      The ${APP_NAME} team
    </p>
  `);
}

// ---------------------------------------------------------------------------
// Executor invite — sent when the inactivity timer lapses and the owner has
// designated an executor. Unlike the plain trusted-contact notification above,
// this grants full access (minus the vault) and explains the executor can
// confirm the owner has passed away, which is what actually triggers the
// notifications to the owner's other trusted contacts and people to notify.
// ---------------------------------------------------------------------------
function executorInviteEmail({ recipientName, ownerName, accessLink }) {
  return layout(`
    <p>Dear ${recipientName},</p>
    <p>
      We are reaching out on behalf of <strong>${ownerName}</strong>, who has named you as
      their Legacy Contact on <strong>${APP_NAME}</strong>.
    </p>
    <p>
      ${APP_NAME} is a service people use to record their wishes and important information
      ahead of time and share it with people they care about. ${ownerName} set this up so
      that if something happened to them, the people they trust most, including you, would
      have what they need.
    </p>
    <p>
      ${ownerName} has not logged into their account within the period they chose, and we
      have not been able to reach them. As their Legacy Contact, you are the first person we turn
      to in this situation.
    </p>
    <p>
      We are not able to confirm what this means. It may simply be that they have been away
      or have forgotten about the account. Please try to reach them directly first if you can.
    </p>
    <p>
      Using the secure link below, you can view everything ${ownerName} recorded, with the
      exception of their private vault (passwords and sensitive credentials), which is never
      shared this way. If you confirm that ${ownerName} has passed away, this link also lets
      you let us know, which will notify their other trusted contacts and the people they
      asked to be told, according to their wishes.
    </p>
    ${button('View information and respond', accessLink)}
    <p style="color:#6B7280; font-size:14px;">
      This link does not expire. If ${ownerName} turns out to be fine, please contact us
      using the form at the bottom of the site.
    </p>
    <p style="color:#6B7280; font-size:14px;">
      With care,<br/>
      The ${APP_NAME} team
    </p>
  `);
}

// ---------------------------------------------------------------------------
// Executor invite via manual report — sent when someone uses the public
// "Report a passing" page rather than waiting for the inactivity timer. Same
// access and confirm-demise capability as executorInviteEmail, but the wording
// doesn't imply the owner has gone quiet, since that isn't why this one fires.
// ---------------------------------------------------------------------------
function executorReportedInviteEmail({ recipientName, ownerName, accessLink }) {
  return layout(`
    <p>Dear ${recipientName},</p>
    <p>
      Someone recently reported to us that <strong>${ownerName}</strong> has passed away.
      You are named as ${ownerName}'s Legacy Contact on <strong>${APP_NAME}</strong>, so we are
      reaching out to you directly.
    </p>
    <p>
      Using the secure link below, you can view everything ${ownerName} recorded, with the
      exception of their private vault (passwords and sensitive credentials), which is never
      shared this way. If you can confirm that ${ownerName} has passed away, this link also
      lets you let us know, which will notify their other trusted contacts and the people
      they asked to be told, according to their wishes.
    </p>
    ${button('View information and respond', accessLink)}
    <p style="color:#6B7280; font-size:14px;">
      This link does not expire. If this message reached you unexpectedly, or ${ownerName}
      is in fact fine, please contact us using the form at the bottom of the site.
    </p>
    <p style="color:#6B7280; font-size:14px;">
      With care,<br/>
      The ${APP_NAME} team
    </p>
  `);
}

// ---------------------------------------------------------------------------
// People to notify — sent once a demise has been confirmed. Purely informational,
// no login link and no plan data, only for people the owner asked to be told.
// ---------------------------------------------------------------------------
function demiseNotificationEmail({ recipientName, ownerName }) {
  return layout(`
    <p>Dear ${recipientName},</p>
    <p>
      We are writing with sad news. <strong>${ownerName}</strong> has been recorded as
      deceased, and they had asked that you be one of the people told directly.
    </p>
    <p>
      This message contains no further details or documents. It is simply the notice
      ${ownerName} wanted you to receive. Someone close to them will likely be in touch
      separately with more information.
    </p>
    <p style="color:#6B7280; font-size:14px;">
      If you are not sure what this means or believe this message reached you in error,
      please contact us using the form at the bottom of the site.
    </p>
    <p style="color:#6B7280; font-size:14px;">
      With care,<br/>
      The ${APP_NAME} team
    </p>
  `);
}

// ---------------------------------------------------------------------------
// Organization portal — invite a brand-new customer to sign up
// ---------------------------------------------------------------------------
function orgInviteEmail({ name, orgName, inviteLink }) {
  return layout(`
    <p>Dear ${name},</p>
    <p>
      <strong>${orgName}</strong> has invited you to complete an end-of-life plan on
      <strong>${APP_NAME}</strong>. This is a secure, private place to record your wishes, legal
      documents, financial details, and more, so the people who matter to you have clarity when
      it counts.
    </p>
    <p>
      To get started, create your account using the button below. This link is valid for
      <strong>7 days</strong>. ${orgName} will never see or set your password.
    </p>
    ${button('Complete my signup', inviteLink)}
    <p style="color:#6B7280; font-size:14px;">
      If you were not expecting this invitation, you can safely ignore this email.
    </p>
    <p style="color:#6B7280; font-size:14px;">
      With care,<br/>
      The ${APP_NAME} team
    </p>
  `);
}

// ---------------------------------------------------------------------------
// Organization portal — link request for a customer who already has an account
// ---------------------------------------------------------------------------
function orgLinkRequestEmail({ name, orgName, linkRequestLink }) {
  return layout(`
    <p>Dear ${name},</p>
    <p>
      <strong>${orgName}</strong> would like to connect to your ${APP_NAME} account to assist
      with your planning.
    </p>
    <p>
      Approving this request lets ${orgName} staff view your plan to help you complete it. No
      data moves and nothing changes until you approve. This link is valid for
      <strong>7 days</strong>.
    </p>
    ${button('Review this request', linkRequestLink)}
    <p style="color:#6B7280; font-size:14px;">
      If you do not recognize ${orgName} or do not wish to connect, simply ignore this email and
      nothing will change.
    </p>
    <p style="color:#6B7280; font-size:14px;">
      With care,<br/>
      The ${APP_NAME} team
    </p>
  `);
}

// ---------------------------------------------------------------------------
// Organization portal — request permission to edit a customer's plan on their behalf
// ---------------------------------------------------------------------------
function orgEditConsentRequestEmail({ name, orgName, consentLink }) {
  return layout(`
    <p>Dear ${name},</p>
    <p>
      <strong>${orgName}</strong> is requesting permission to make edits to your plan on your
      behalf, to help you complete it.
    </p>
    <p>
      Approving this only allows edits, on top of the viewing access you've already granted. You
      can revoke this at any time from your account settings. This link is valid for
      <strong>7 days</strong>.
    </p>
    ${button('Review this request', consentLink)}
    <p style="color:#6B7280; font-size:14px;">
      If you do not wish to grant this, simply ignore this email and nothing will change.
    </p>
    <p style="color:#6B7280; font-size:14px;">
      With care,<br/>
      The ${APP_NAME} team
    </p>
  `);
}

// ---------------------------------------------------------------------------
// Organization portal — notify a designated executor after a customer is marked deceased
// ---------------------------------------------------------------------------
function executorNotificationEmail({ executorName, ownerName }) {
  return layout(`
    <p>Dear ${executorName},</p>
    <p>
      We are writing to let you know that ${ownerName} has been recorded as deceased by their
      organization, and that ${ownerName} named you as their Legacy Contact on ${APP_NAME}.
    </p>
    <p>
      ${ownerName}'s plan exists and is now locked from further edits. Access to their private
      vault (passwords and sensitive credentials) is not released automatically. It requires the
      credentials ${ownerName} arranged with you privately during their lifetime.
    </p>
    <p style="color:#6B7280; font-size:14px;">
      If you are not sure what this means or believe this message reached you in error, please
      contact us using the form at the bottom of the site.
    </p>
    <p style="color:#6B7280; font-size:14px;">
      With care,<br/>
      The ${APP_NAME} team
    </p>
  `);
}

// ---------------------------------------------------------------------------
// Organization self-registration: invite the applicant to complete their own
// account setup and choose a plan
// ---------------------------------------------------------------------------
function orgAdminInviteEmail({ name, orgName, completeLink }) {
  return layout(`
    <p>Dear ${name},</p>
    <p>
      Thank you for registering <strong>${orgName}</strong> with <strong>${APP_NAME}</strong>. You're
      almost set up.
    </p>
    <p>
      Use the button below to choose your plan and create your password. This link is valid for
      <strong>7 days</strong>.
    </p>
    ${button('Complete my organization setup', completeLink)}
    <p style="color:#6B7280; font-size:14px;">
      If you did not request this, you can safely ignore this email.
    </p>
    <p style="color:#6B7280; font-size:14px;">
      With care,<br/>
      The ${APP_NAME} team
    </p>
  `);
}

// ---------------------------------------------------------------------------
// Organization portal: notify IGHP that an org wants a deactivated staff
// account reactivated. Internal email, not sent to the org or the staff member.
// ---------------------------------------------------------------------------
function orgReactivationRequestEmail({ orgName, staffName, staffEmail, staffRole, requestedByName, requestedByEmail }) {
  return layout(`
    <p>A reactivation request has been submitted.</p>
    <table style="width:100%; border-collapse:collapse; margin:16px 0;">
      <tr><td style="padding:6px 0; font-weight:600; color:#555; width:160px;">Organization</td><td style="padding:6px 0;">${orgName}</td></tr>
      <tr><td style="padding:6px 0; font-weight:600; color:#555;">Account to reactivate</td><td style="padding:6px 0;">${staffName} (${staffEmail}), ${staffRole}</td></tr>
      <tr><td style="padding:6px 0; font-weight:600; color:#555;">Requested by</td><td style="padding:6px 0;">${requestedByName} (${requestedByEmail})</td></tr>
    </table>
    <p style="color:#6B7280; font-size:14px;">
      Reactivate from the Admin panel's Organizations tab once you've verified the request.
    </p>
  `);
}

module.exports = {
  emailVerificationEmail,
  welcomeEmail,
  passwordResetEmail,
  inactivityReminderEmail,
  trialEndingReminderEmail,
  inactivityContactNotificationEmail,
  executorDesignatedEmail,
  executorInviteEmail,
  executorReportedInviteEmail,
  demiseNotificationEmail,
  contactAccessEmail,
  orgReactivationRequestEmail,
  orgAdminInviteEmail,
  vaultAttemptEmail,
  vaultLockedEmail,
  accountDeletionConfirmEmail,
  orgInviteEmail,
  orgLinkRequestEmail,
  orgEditConsentRequestEmail,
  executorNotificationEmail,
};
