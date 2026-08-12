/**
 * Vault recovery via security questions — "any 3 of N" combinatorial escrow.
 *
 * Design: for every 3-question combination (i, j, k) among the configured
 * questions, the vault key is encrypted under a key derived from that
 * combination's three answers. Answering any 3 questions correctly
 * successfully decrypts exactly one stored combination (the AES-GCM auth
 * tag only validates for the right key) and recovers the vault key, without
 * ever storing the key, password, or answers themselves.
 *
 * This is deliberately not Shamir's Secret Sharing — with at most 5
 * questions there are at most C(5,3)=10 combinations, small enough that
 * plain combinatorial encryption is simpler and needs no new dependency,
 * reusing the exact AES-256-GCM/scrypt primitives already in vault.js.
 *
 * v2: originally "any 2 of N" (pairwise). Bumped to "any 3 of N" per final
 * spec (see project_ops_batch_2026_08_05_afternoon memory) - the salt
 * prefix version bumped alongside it since the derivation input changed
 * shape (three answers combined instead of two), following vault.js's own
 * convention of versioning the prefix whenever derivation params change.
 */

const crypto = require('crypto')
const { encrypt, decrypt, KEY_BYTES } = require('./vault')

const SALT_PREFIX = 'igh-vault-recovery-v2-'
const COMBO_SIZE = 3

function normalizeAnswer(answer) {
  return String(answer || '').trim().toLowerCase()
}

function deriveComboKey(answers, digitalVaultId, indices) {
  const combined = answers.map(normalizeAnswer).join('')
  const salt = `${SALT_PREFIX}${digitalVaultId}-${indices.join('-')}`
  return crypto.scryptSync(combined, salt, KEY_BYTES, { N: 16384, r: 8, p: 1 })
}

// Every 3-element combination of a sorted array, as index-triples into it.
function combinations3(n) {
  const result = []
  for (let a = 0; a < n; a++) {
    for (let b = a + 1; b < n; b++) {
      for (let c = b + 1; c < n; c++) {
        result.push([a, b, c])
      }
    }
  }
  return result
}

// questions: [{ index, answer }], indices assumed already sorted/unique.
// Returns rows ready to insert: [{ question_index_a, question_index_b, question_index_c, key_enc }]
function escrowAllTriples(vaultKeyBuffer, questions, digitalVaultId) {
  const sorted = [...questions].sort((x, y) => x.index - y.index)
  const hexKey = vaultKeyBuffer.toString('hex')
  return combinations3(sorted.length).map(([a, b, c]) => {
    const trio = [sorted[a], sorted[b], sorted[c]]
    const indices = trio.map(q => q.index)
    const answers = trio.map(q => q.answer)
    const comboKey = deriveComboKey(answers, digitalVaultId, indices)
    return {
      question_index_a: indices[0],
      question_index_b: indices[1],
      question_index_c: indices[2],
      key_enc: JSON.stringify(encrypt(hexKey, comboKey)),
    }
  })
}

// submittedAnswers: { [index]: answerString } — only non-blank entries considered.
// storedShareRows: rows from vault_recovery_shares for this vault.
// Returns the recovered vault key Buffer, or null if no combination matched.
function tryRecoverKey(submittedAnswers, storedShareRows, digitalVaultId) {
  const indices = Object.keys(submittedAnswers)
    .map(Number)
    .filter(i => normalizeAnswer(submittedAnswers[i]).length > 0)
    .sort((x, y) => x - y)

  for (const [a, b, c] of combinations3(indices.length)) {
    const idxs = [indices[a], indices[b], indices[c]]
    const share = storedShareRows.find(s =>
      s.question_index_a === idxs[0] && s.question_index_b === idxs[1] && s.question_index_c === idxs[2]
    )
    if (!share) continue
    try {
      const { ciphertext, iv, tag } = JSON.parse(share.key_enc)
      const answers = idxs.map(i => submittedAnswers[i])
      const comboKey = deriveComboKey(answers, digitalVaultId, idxs)
      const hexKey = decrypt(ciphertext, iv, tag, comboKey)
      return Buffer.from(hexKey, 'hex')
    } catch {
      // Wrong answers for this combination — GCM auth tag mismatch. Keep trying others.
    }
  }
  return null
}

module.exports = { normalizeAnswer, deriveComboKey, escrowAllTriples, tryRecoverKey, COMBO_SIZE }
