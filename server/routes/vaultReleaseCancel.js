const express = require('express');
const router  = express.Router();
const { cancelByToken, peekCancelToken } = require('../lib/releaseChallenge');
// The same escaper the email templates use, rather than a second copy of it.
// Everything interpolated into the pages below is either a constant from the
// table in this file or a token that has already matched a strict hex regex,
// so this is belt and braces rather than the only defence, which is exactly
// how it should be for the one page in the product that must render correctly
// for someone who has just been told they were reported dead.
const { escapeHtml } = require('../lib/emailTemplates');

/**
 * The "I am here" link from the challenge email
 * (docs/VAULT_RELEASE_ON_DEATH_SPEC.md, sections 3.3 and 9.2).
 *
 * Unauthenticated on purpose, and this is the one route in the product where
 * that is the safer choice rather than a compromise. Someone who has just
 * been falsely declared dead may not be able to sign in quickly: a forgotten
 * password, a phone they are only reading mail on, a hospital bed. Cancelling
 * has to be the cheapest action in the whole system, because the asymmetry
 * this feature rests on is that cancelling errs toward not releasing, while
 * releasing cannot be undone at all.
 *
 * What the token can do, which is what makes the lack of a session
 * acceptable: nothing except stop a release. It cannot read the vault, cannot
 * reach key_enc, cannot produce or reveal a release code, cannot sign anyone
 * in and cannot cause a release. The worst an attacker achieves by stealing
 * or guessing one is to prevent a vault from being handed over, which is the
 * outcome the design prefers when in doubt. It is 32 bytes from
 * crypto.randomBytes, the same mint as trusted_contact_tokens, so guessing is
 * not a realistic attack in the first place.
 *
 * Why the GET changes nothing, and the POST is what cancels.
 *
 * This file used to cancel on the GET, and justified it on the grounds that a
 * prefetch by a mail client or a security scanner was a cheap mistake: the row
 * went back to 'armed' and a fresh declaration could be made, so an accidental
 * cancellation cost the declarer a wait and nothing more. That reasoning was
 * true when it was written and stopped being true when cancelling was changed
 * to SUSPEND the arrangement rather than re-arm it (see cancelPendingRelease
 * in lib/releaseChallenge.js, which was changed to kill a
 * declare/cancel/declare loop). The code moved and the comment did not.
 *
 * Under suspend semantics a prefetch is not a cheap mistake, it is the exact
 * failure this whole feature exists to prevent. Once the owner has genuinely
 * died, the challenge email lands in a mailbox nobody is reading. A corporate
 * link scanner or a mail client prefetching the URL suspends the release, and
 * only the owner, signed in, can resume it (POST /resume is requireAuth, and
 * openReleaseWindow only moves a row out of 'armed'). Nobody alive can undo
 * it, and the vault is unreachable forever.
 *
 * So the GET renders a confirmation page carrying a button that POSTs back to
 * the same token, and only the POST writes. A prefetcher issues the GET and
 * never the POST.
 *
 * The obvious alternative, letting a GET land in 'armed' instead of
 * 'suspended', was considered and rejected. The owner reaches this link from
 * their own mail client, which is a GET, so a genuine objection would re-arm
 * the row and let the declarer immediately declare again: the loop the suspend
 * semantics exist to kill.
 *
 * Why a second press is not the risk it would have been. Signing in cancels
 * too (routes/auth.js, on every successful login), and the daily sweep cancels
 * on any owner activity since the declaration. The email says so, and so does
 * every page below. The link is the fastest path, not the only one, so costing
 * a living owner one button press does not cost them their vault.
 */

// Deliberately no detail in either message. A token that never existed, one
// already used, one whose window has since closed and one belonging to a row
// that was re-armed all produce the same page: there is nothing useful to
// learn from the difference, and somebody holding a guess should not be told
// which kind of wrong it is.
const OUTCOME = {
  confirm: {
    status: 200,
    heading: 'Please confirm you are there.',
    body: 'Someone reported to us that you had passed away. Nothing has happened to '
        + 'your vault, and opening this page has changed nothing. Press the button '
        + 'below and we will stop the handover.',
    note: 'Signing in to your account also stops it. If this page will not work for '
        + 'you, sign in as you normally would and that is enough.',
    action: 'I am here',
  },
  cancelled: {
    status: 200,
    heading: 'Thank you. Nothing further will happen.',
    body: 'We have stopped the handover of your vault. Your plan is untouched and '
        + 'nothing has been shared. You do not need to do anything else.',
    note: 'If you were not expecting this message, someone reported to us that you '
        + 'had passed away. It may be worth asking the people you have listed as '
        + 'trusted contacts about it. They were told the report had been made.',
  },
  not_found: {
    status: 404,
    heading: 'This link is no longer active.',
    body: 'Either it has already been used, or there is nothing pending on this '
        + 'account at the moment. Nothing has been handed over as a result of '
        + 'opening this link.',
    note: 'If you are concerned, signing in to your account also stops a handover, '
        + 'and you can check the current state of your vault release settings there.',
  },
  error: {
    status: 500,
    heading: 'Something went wrong.',
    body: 'We could not complete that just now. Please try the link again in a few '
        + 'minutes.',
    note: 'If it keeps failing, signing in to your account also stops a handover, '
        + 'and is the surest way to do it.',
  },
};

/**
 * A standalone HTML page, with no scripts, no fonts and no external requests.
 *
 * The link resolves against the API rather than the single-page app on
 * purpose (see PUBLIC_API_URL in lib/releaseChallenge.js), so this response
 * is the whole of what the owner sees and has to stand on its own. The button
 * is a plain form POST for the same reason: it has to work in whatever browser
 * a mail client happens to open, with no session, no cookie and no JavaScript.
 *
 * formAction is the only interpolated value that is not a constant from the
 * table above. It is built from req.baseUrl plus a token this route has
 * already checked against /^[0-9a-f]{64}$/, and it is escaped regardless.
 */
function page({ heading, body, note, action, formAction }) {
  const button = action && formAction ? `
        <form method="post" action="${escapeHtml(formAction)}" style="margin:0 0 20px;">
          <button type="submit" style="display:inline-block; background:#1A3D28; color:#ffffff; border:0; border-radius:8px; padding:14px 28px; font-family: Georgia, 'Times New Roman', serif; font-size:16px; cursor:pointer;">${escapeHtml(action)}</button>
        </form>` : '';
  return `<!DOCTYPE html>
<html lang="en">
<head>
  <meta charset="utf-8"/>
  <meta name="viewport" content="width=device-width, initial-scale=1"/>
  <meta name="robots" content="noindex, nofollow"/>
  <title>In Good Hands</title>
</head>
<body style="margin:0; padding:0; background:#F0F7F2; font-family: Georgia, 'Times New Roman', serif;">
  <div style="max-width:600px; margin:0 auto; padding:40px 20px;">
    <div style="background:#ffffff; border-radius:12px; overflow:hidden;">
      <div style="background:#1A3D28; padding:32px 40px; text-align:center;">
        <h1 style="margin:0; color:#ffffff; font-size:26px; font-weight:normal; letter-spacing:1px;">In Good Hands</h1>
        <p style="margin:6px 0 0; color:#A8C5B0; font-size:13px;">Everything in good hands</p>
      </div>
      <div style="padding:40px; color:#1F2937; font-size:16px; line-height:1.7;">
        <h2 style="margin:0 0 16px; font-size:21px; font-weight:normal; color:#1A3D28;">${escapeHtml(heading)}</h2>
        <p style="margin:0 0 16px;">${escapeHtml(body)}</p>${button}
        <p style="margin:0; color:#6B7280; font-size:14px;">${escapeHtml(note)}</p>
      </div>
    </div>
  </div>
</body>
</html>
`;
}

function respondHtml(res, key, extra = {}) {
  const outcome = OUTCOME[key];
  res.status(outcome.status);
  res.setHeader('Content-Type', 'text/html; charset=utf-8');
  // Nothing about this response may be cached or kept by an intermediary: it
  // is a one-shot answer about the state of a specific account, reached by a
  // secret in the URL.
  res.setHeader('Cache-Control', 'no-store, private');
  res.setHeader('Referrer-Policy', 'no-referrer');
  res.send(page({ ...outcome, ...extra }));
}

/**
 * The GET. Reads, and only reads.
 *
 * The read is there so that an owner whose link has already been used, or who
 * has signed in since (which cancels on its own), is told that plainly instead
 * of being handed a button that will fail. It touches one row, by token, and
 * returns one boolean.
 */
router.get('/cancel/:token', async (req, res) => {
  try {
    const { token } = req.params;
    const { pending } = await peekCancelToken(token);
    if (!pending) return respondHtml(res, 'not_found');
    // req.baseUrl, not a hardcoded prefix or anything from the request line,
    // so the form keeps working if the mount point in index.js ever moves.
    return respondHtml(res, 'confirm', { formAction: `${req.baseUrl}/cancel/${token}` });
  } catch (err) {
    // Swallowed rather than handed to the shared error handler, which answers
    // in JSON. Someone reading this in a browser needs a sentence they can
    // act on, and the honest action is "try again, or sign in".
    console.error('[vault-release] Cancel link failed:', err.message);
    respondHtml(res, 'error');
  }
});

/**
 * The POST. The only verb that cancels.
 *
 * Still unauthenticated, and that is the point: a dead-or-alive owner pressing
 * a button in a mail client has no session. Every protection the old GET had
 * is unchanged, because they all live in cancelByToken: single use (the token
 * is NULLed in the same statement that cancels), conditioned on
 * status = 'pending', and scoped to the one row the token matches. A second
 * press finds nothing and gets the same page as a token that never existed.
 *
 * No CSRF token, deliberately. There is no session to ride, nothing here is
 * authenticated by a cookie, and the only thing a forged cross-site POST could
 * achieve is to stop a vault being handed over, which is the fail-safe
 * direction. It would also need the 32 bytes of secret in the URL, which is
 * the same thing as having the email.
 *
 * Answers HTML to a browser and JSON to anything that asks for JSON, so the
 * confirmation button and a future in-app page can share one route.
 */
router.post('/cancel/:token', async (req, res) => {
  // No Accept header at all (a script, curl) takes the first entry, so
  // programmatic callers keep the JSON they had before this page existed.
  const wantsHtml = req.accepts(['json', 'html']) === 'html';
  try {
    const ip = req.headers['x-forwarded-for']?.split(',')[0].trim() || req.socket.remoteAddress || null;
    const result = await cancelByToken(req.params.token, { ip, userAgent: req.headers['user-agent'] || null });
    if (wantsHtml) return respondHtml(res, result.cancelled ? 'cancelled' : 'not_found');
    res.setHeader('Cache-Control', 'no-store, private');
    if (result.cancelled) return res.json({ success: true, cancelled: true });
    return res.status(404).json({ error: OUTCOME.not_found.heading, cancelled: false });
  } catch (err) {
    console.error('[vault-release] Cancel link failed:', err.message);
    if (wantsHtml) return respondHtml(res, 'error');
    return res.status(500).json({ error: OUTCOME.error.heading, cancelled: false });
  }
});

module.exports = router;
