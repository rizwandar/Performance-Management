/**
 * Vault release escrow — handing the vault to a Legacy Contact after death,
 * without the server ever being able to open it.
 *
 * The problem this solves: the vault key is derived per request from the
 * user's vault password (see lib/vault.js), and that password is never
 * stored. So if nobody alive knows it, the six vault-protected sections die
 * with the user, which is the opposite of what this product is for.
 *
 * Design, and the one property that matters: we store a copy of the vault key
 * encrypted under a key derived from a RELEASE CODE that the server never
 * keeps. The user is shown the code once and gives it to their Legacy Contact
 * by hand. We hold a sealed envelope we cannot open; they hold a key with
 * nothing to open until a confirmed death and a challenge window have passed.
 * Neither half is any use alone, so "we cannot read your vault" stays true.
 *
 * This is deliberately the same shape as lib/vaultRecovery.js, which escrows
 * the vault key under security-question answers. Same primitives from
 * vault.js, same JSON {ciphertext, iv, tag} storage, same versioned salt
 * prefix convention. It is not new cryptography, and that is the point.
 *
 * Why a release code rather than simply telling the Legacy Contact the vault
 * password: a password works immediately. Hand it over today and they can
 * open the vault today by logging in as you. A release code does nothing
 * until the server hands over the envelope, so it is time-locked in a way a
 * password can never be.
 */

const crypto = require('crypto')
const { encrypt, decrypt, KEY_BYTES } = require('./vault')

// Bump if the derivation input or parameters change, exactly as vault.js and
// vaultRecovery.js do with their own prefixes.
const SALT_PREFIX = 'igh-vault-release-v1-'

// Crockford-style base32: no I, L, O or U. The code is meant to be written
// on paper, folded into a will, and typed back in by a grieving person years
// later, so the alphabet excludes the characters people misread, and
// normalizeCode below maps the mistakes they still make anyway.
const ALPHABET = '0123456789ABCDEFGHJKMNPQRSTVWXYZ'
const CODE_LENGTH = 20          // 20 chars over a 32-symbol alphabet = 100 bits
const GROUP_SIZE = 4            // displayed as 5 groups of 4

/**
 * A fresh release code, formatted for transcription: XXXX-XXXX-XXXX-XXXX-XXXX.
 *
 * randomInt is rejection-sampled by Node, so this is uniform over the
 * alphabet. A modulo over randomBytes would bias the first 24 symbols, which
 * would quietly cost entropy no one would ever notice.
 */
function generateReleaseCode() {
  let out = ''
  for (let i = 0; i < CODE_LENGTH; i++) out += ALPHABET[crypto.randomInt(ALPHABET.length)]
  return out.match(new RegExp(`.{1,${GROUP_SIZE}}`, 'g')).join('-')
}

/**
 * Accept what a human actually types: lower case, missing or extra hyphens,
 * stray spaces, and the three confusions the alphabet was chosen to avoid.
 * Returns the canonical bare code, or null if it is not the right shape.
 */
function normalizeCode(input) {
  if (typeof input !== 'string') return null
  const cleaned = input
    .toUpperCase()
    .replace(/[\s-]/g, '')
    .replace(/[IL]/g, '1')  // I and l are read as 1
    .replace(/O/g, '0')     // O is read as 0
    .replace(/U/g, 'V')     // U and V are confused in some hands
  if (cleaned.length !== CODE_LENGTH) return null
  if (![...cleaned].every(ch => ALPHABET.includes(ch))) return null
  return cleaned
}

/** Group a bare code for display. Never store the result; show it once. */
function formatCode(bare) {
  return bare.match(new RegExp(`.{1,${GROUP_SIZE}}`, 'g')).join('-')
}

/**
 * scrypt, same cost parameters as vault.js, so a stolen envelope costs an
 * attacker the same work per guess as a stolen vault does. The salt is
 * deterministic and per-vault, so two users with the same code (astronomically
 * unlikely, but) do not share a derived key.
 */
function deriveCodeKey(bareCode, digitalVaultId) {
  return crypto.scryptSync(
    bareCode,
    `${SALT_PREFIX}${digitalVaultId}`,
    KEY_BYTES,
    { N: 16384, r: 8, p: 1 }
  )
}

/**
 * Seal the vault key under a freshly generated code.
 *
 * Returns { code, keyEnc }. The code is returned ONCE, to be shown to the user
 * and then forgotten by everything: it must never be written to the database,
 * a log, an email or an API response beyond the single setup reply.
 */
function sealVaultKey(vaultKeyBuffer, digitalVaultId) {
  const code = generateReleaseCode()
  const bare = normalizeCode(code)
  const codeKey = deriveCodeKey(bare, digitalVaultId)
  const keyEnc = JSON.stringify(encrypt(vaultKeyBuffer.toString('hex'), codeKey))
  return { code, keyEnc }
}

/**
 * Open a sealed envelope with a candidate code.
 *
 * Returns the vault key Buffer, or null for any failure. Deliberately
 * returns null rather than throwing or distinguishing causes: a wrong code and
 * a corrupt envelope must look identical from outside, or the endpoint becomes
 * an oracle. The caller is responsible for rate limiting; see the attempts and
 * locked_until columns on vault_release.
 */
function openSealedKey(submittedCode, keyEnc, digitalVaultId) {
  const bare = normalizeCode(submittedCode)
  if (!bare) return null
  try {
    const { ciphertext, iv, tag } = JSON.parse(keyEnc)
    const codeKey = deriveCodeKey(bare, digitalVaultId)
    const hexKey = decrypt(ciphertext, iv, tag, codeKey)
    const buf = Buffer.from(hexKey, 'hex')
    return buf.length === KEY_BYTES ? buf : null
  } catch {
    // Wrong code (GCM tag mismatch), malformed envelope, or truncated hex.
    return null
  }
}

module.exports = {
  generateReleaseCode,
  normalizeCode,
  formatCode,
  deriveCodeKey,
  sealVaultKey,
  openSealedKey,
  CODE_LENGTH,
  ALPHABET,
}
