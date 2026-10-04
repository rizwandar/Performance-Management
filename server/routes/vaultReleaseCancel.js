const express = require('express');
const router  = express.Router();
const { cancelByToken } = require('../lib/releaseChallenge');

/**
 * The "I am here" link from the challenge email
 * (docs/VAULT_RELEASE_ON_DEATH_SPEC.md, sections 3.3 and 9.2).
 *
 * Unauthenticated on purpose, and this is the one route in the product where
 * that is the safer choice rather than a compromise. Someone who has just
 * been falsely declared dead may not be able to sign in quickly: a forgotten
 * password, a phone they are only reading mail on, a hospital bed. Cancelling
 * has to be the cheapest action in the whole system, because the asymmetry
 * this feature rests on is that cancelling errs toward not releasing and can
 * always be redone, while releasing cannot be undone at all.
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
 * Why GET cancels, rather than rendering a confirm button that POSTs. Mail
 * clients and security scanners do prefetch links, and a prefetch here would
 * cancel a pending release without the owner having read anything. That is
 * accepted deliberately: an accidental cancellation costs a declarer a wait
 * and is trivially repaired (the row returns to 'armed', and a fresh
 * declaration can be made), whereas an owner who cannot cancel because a
 * second click was needed and the page did not load loses their vault. A
 * confirm step would optimise the wrong failure. Spec 3.3 says it plainly:
 * "One press cancels everything".
 *
 * The POST form is for a future in-app page to call with the same token and
 * get JSON back. Both consume the token identically.
 */

// Deliberately no detail in either message. A token that never existed, one
// already used, one whose window has since closed and one belonging to a row
// that was re-armed all produce the same page: there is nothing useful to
// learn from the difference, and somebody holding a guess should not be told
// which kind of wrong it is.
const OUTCOME = {
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
 * is the whole of what the owner sees and has to stand on its own. It carries
 * no user-supplied content at all - every string is a constant from the table
 * above - so there is nothing here to escape.
 */
function page({ heading, body, note }) {
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
        <h2 style="margin:0 0 16px; font-size:21px; font-weight:normal; color:#1A3D28;">${heading}</h2>
        <p style="margin:0 0 16px;">${body}</p>
        <p style="margin:0; color:#6B7280; font-size:14px;">${note}</p>
      </div>
    </div>
  </div>
</body>
</html>
`;
}

function respondHtml(res, key) {
  const outcome = OUTCOME[key];
  res.status(outcome.status);
  res.setHeader('Content-Type', 'text/html; charset=utf-8');
  // Nothing about this response may be cached or kept by an intermediary: it
  // is a one-shot answer about the state of a specific account, reached by a
  // secret in the URL.
  res.setHeader('Cache-Control', 'no-store, private');
  res.setHeader('Referrer-Policy', 'no-referrer');
  res.send(page(outcome));
}

async function cancel(req) {
  const ip = req.headers['x-forwarded-for']?.split(',')[0].trim() || req.socket.remoteAddress || null;
  return cancelByToken(req.params.token, { ip, userAgent: req.headers['user-agent'] || null });
}

router.get('/cancel/:token', async (req, res) => {
  try {
    const result = await cancel(req);
    respondHtml(res, result.cancelled ? 'cancelled' : 'not_found');
  } catch (err) {
    // Swallowed rather than handed to the shared error handler, which answers
    // in JSON. Someone reading this in a browser needs a sentence they can
    // act on, and the honest action is "try again, or sign in".
    console.error('[vault-release] Cancel link failed:', err.message);
    respondHtml(res, 'error');
  }
});

router.post('/cancel/:token', async (req, res) => {
  try {
    const result = await cancel(req);
    res.setHeader('Cache-Control', 'no-store, private');
    if (result.cancelled) return res.json({ success: true, cancelled: true });
    return res.status(404).json({ error: OUTCOME.not_found.heading, cancelled: false });
  } catch (err) {
    console.error('[vault-release] Cancel link failed:', err.message);
    return res.status(500).json({ error: OUTCOME.error.heading, cancelled: false });
  }
});

module.exports = router;
