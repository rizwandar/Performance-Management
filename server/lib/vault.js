/**
 * Vault encryption helpers — AES-256-GCM with scrypt key derivation
 *
 * Design:
 *  - The vault password is NEVER stored on the server (not even hashed)
 *  - The encryption key is derived on the fly from the vault password + userId using scrypt
 *  - Each encrypted value carries its own IV and GCM auth tag
 *  - A "check" ciphertext lets us verify a vault password without storing it:
 *    we encrypt a known constant; correct password → correct decryption
 *
 * Threat model:
 *  - Database breach: encrypted blobs are unreadable without the vault password
 *  - HTTPS in transit: vault password never travels in plaintext
 *  - Server memory: vault password is present only for the duration of one request
 */

const crypto = require('crypto')

const ALGORITHM  = 'aes-256-gcm'
const KEY_BYTES  = 32   // 256 bits
const IV_BYTES   = 12   // 96 bits — recommended for GCM
const SALT_PREFIX = 'igh-vault-v1-'   // bump version prefix if key derivation params ever change

// The plaintext we encrypt to prove vault password correctness
const CHECK_CONSTANT = 'in-good-hands-vault-verified'

// ---------------------------------------------------------------------------
// Key derivation
// scryptSync is intentionally slow to resist brute-force attacks.
// N=16384 (2^14): ~50-100ms on modern hardware — acceptable for a vault unlock.
// Salt is deterministic (userId-based) so we don't need to store it separately.
// ---------------------------------------------------------------------------
function deriveKey(vaultPassword, userId) {
  return crypto.scryptSync(
    vaultPassword,
    `${SALT_PREFIX}${userId}`,
    KEY_BYTES,
    { N: 16384, r: 8, p: 1 }
  )
}

// ---------------------------------------------------------------------------
// Encrypt a UTF-8 string → { ciphertext, iv, tag } all hex-encoded
// ---------------------------------------------------------------------------
function encrypt(plaintext, key) {
  const iv     = crypto.randomBytes(IV_BYTES)
  const cipher = crypto.createCipheriv(ALGORITHM, key, iv)
  let ciphertext = cipher.update(plaintext, 'utf8', 'hex')
  ciphertext += cipher.final('hex')
  const tag = cipher.getAuthTag()
  return {
    ciphertext,
    iv:  iv.toString('hex'),
    tag: tag.toString('hex'),
  }
}

// ---------------------------------------------------------------------------
// Decrypt → UTF-8 string
// Throws if the key is wrong (GCM auth tag mismatch) — caller must catch.
// ---------------------------------------------------------------------------
function decrypt(ciphertext, iv, tag, key) {
  const decipher = crypto.createDecipheriv(ALGORITHM, key, Buffer.from(iv, 'hex'))
  decipher.setAuthTag(Buffer.from(tag, 'hex'))
  let plaintext = decipher.update(ciphertext, 'hex', 'utf8')
  plaintext += decipher.final('utf8')
  return plaintext
}

// ---------------------------------------------------------------------------
// Convenience: encrypt / decrypt a stored JSON blob { ciphertext, iv, tag }
// ---------------------------------------------------------------------------
function encryptField(plaintext, key) {
  if (!plaintext) return null
  return JSON.stringify(encrypt(String(plaintext), key))
}

function decryptField(storedJson, key) {
  if (!storedJson) return null
  try {
    const { ciphertext, iv, tag } = JSON.parse(storedJson)
    return decrypt(ciphertext, iv, tag, key)
  } catch {
    return null // wrong key or corrupted — return null rather than throw
  }
}

// ---------------------------------------------------------------------------
// Vault check — used to verify a vault password without storing it
// ---------------------------------------------------------------------------
function createVaultCheck(key) {
  return JSON.stringify(encrypt(CHECK_CONSTANT, key))
}

function verifyVaultPassword(checkJson, key) {
  try {
    const { ciphertext, iv, tag } = JSON.parse(checkJson)
    const plaintext = decrypt(ciphertext, iv, tag, key)
    return plaintext === CHECK_CONSTANT
  } catch {
    return false // decryption failed → wrong password
  }
}

module.exports = { deriveKey, encryptField, decryptField, createVaultCheck, verifyVaultPassword }
