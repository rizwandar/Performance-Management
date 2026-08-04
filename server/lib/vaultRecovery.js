/**
 * Vault recovery via security questions — "any 2 of N" pairwise escrow.
 *
 * Design: for every pair of configured questions (i, j), the vault key is
 * encrypted under a key derived from that pair's two answers. Answering any
 * 2 questions correctly successfully decrypts exactly one stored pair (the
 * AES-GCM auth tag only validates for the right key) and recovers the vault
 * key, without ever storing the key, password, or answers themselves.
 *
 * This is deliberately not Shamir's Secret Sharing — with at most 5
 * questions there are at most C(5,2)=10 pairs, small enough that plain
 * pairwise encryption is simpler and needs no new dependency, reusing the
 * exact AES-256-GCM/scrypt primitives already in vault.js.
 */

const crypto = require('crypto')
const { encrypt, decrypt, KEY_BYTES } = require('./vault')

const SALT_PREFIX = 'igh-vault-recovery-v1-'

function normalizeAnswer(answer) {
  return String(answer || '').trim().toLowerCase()
}

function derivePairKey(answerA, answerB, digitalVaultId, indexA, indexB) {
  const combined = `${normalizeAnswer(answerA)}${normalizeAnswer(answerB)}`
  const salt = `${SALT_PREFIX}${digitalVaultId}-${indexA}-${indexB}`
  return crypto.scryptSync(combined, salt, KEY_BYTES, { N: 16384, r: 8, p: 1 })
}

// questions: [{ index, answer }], indices assumed already sorted/unique.
// Returns rows ready to insert: [{ question_index_a, question_index_b, key_enc }]
function escrowAllPairs(vaultKeyBuffer, questions, digitalVaultId) {
  const shares = []
  const hexKey = vaultKeyBuffer.toString('hex')
  for (let a = 0; a < questions.length; a++) {
    for (let b = a + 1; b < questions.length; b++) {
      const qa = questions[a]
      const qb = questions[b]
      const [indexA, indexB] = [qa.index, qb.index].sort((x, y) => x - y)
      const [answerA, answerB] = qa.index < qb.index ? [qa.answer, qb.answer] : [qb.answer, qa.answer]
      const pairKey = derivePairKey(answerA, answerB, digitalVaultId, indexA, indexB)
      shares.push({
        question_index_a: indexA,
        question_index_b: indexB,
        key_enc: JSON.stringify(encrypt(hexKey, pairKey)),
      })
    }
  }
  return shares
}

// submittedAnswers: { [index]: answerString } — only non-blank entries considered.
// storedShareRows: rows from vault_recovery_shares for this vault.
// Returns the recovered vault key Buffer, or null if no pair matched.
function tryRecoverKey(submittedAnswers, storedShareRows, digitalVaultId) {
  const indices = Object.keys(submittedAnswers)
    .map(Number)
    .filter(i => normalizeAnswer(submittedAnswers[i]).length > 0)
    .sort((x, y) => x - y)

  for (let a = 0; a < indices.length; a++) {
    for (let b = a + 1; b < indices.length; b++) {
      const indexA = indices[a]
      const indexB = indices[b]
      const share = storedShareRows.find(s => s.question_index_a === indexA && s.question_index_b === indexB)
      if (!share) continue
      try {
        const { ciphertext, iv, tag } = JSON.parse(share.key_enc)
        const pairKey = derivePairKey(submittedAnswers[indexA], submittedAnswers[indexB], digitalVaultId, indexA, indexB)
        const hexKey = decrypt(ciphertext, iv, tag, pairKey)
        return Buffer.from(hexKey, 'hex')
      } catch {
        // Wrong answers for this pair — GCM auth tag mismatch. Keep trying other pairs.
      }
    }
  }
  return null
}

module.exports = { normalizeAnswer, derivePairKey, escrowAllPairs, tryRecoverKey }
