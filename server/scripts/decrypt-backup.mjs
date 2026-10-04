// Decrypts a nightly database backup written by server/lib/backup.js.
//
// This script is the restore path. There is no in-app restore: routes/admin.js
// can run and list backups, nothing reads one back, so recovering from a
// backup means a human downloading the file from R2 and opening it. Encryption
// without this script would have quietly turned working backups into useless
// ones, discovered only during an actual disaster.
//
// Usage:
//   BACKUP_ENCRYPTION_KEY=<64 hex chars> node server/scripts/decrypt-backup.mjs <file> [-o out.json]
//
// With no -o the JSON goes to stdout, so it pipes:
//   ... decrypt-backup.mjs backup.json.gz.enc | jq '.tables | keys'
//
// The key must be the one belonging to the environment that produced the file.
// Keys are per environment (see CLAUDE.md, Secrets management): a production
// backup will not open with the staging key.
//
// Exit codes: 0 ok, 1 usage or file problem, 2 key problem, 3 decrypt failed.

import fs from 'node:fs';
import path from 'node:path';
import zlib from 'node:zlib';
import { createRequire } from 'node:module';
import { fileURLToPath } from 'node:url';

// The format lives in lib/backupCrypto.js (CommonJS, shared with the writer)
// rather than being re-implemented here. Two copies of a container format is
// exactly how a restore tool ends up unable to read real files.
const require = createRequire(import.meta.url);
const here = path.dirname(fileURLToPath(import.meta.url));
const {
  parseBackupKey,
  decryptBackup,
  KEY_GENERATION_HINT,
  ERR_LEGACY_PLAINTEXT,
  ERR_UNRECOGNIZED,
  ERR_TRUNCATED,
  ERR_AUTH_FAILED,
  ERR_BAD_KEY_FORMAT,
} = require(path.join(here, '..', 'lib', 'backupCrypto.js'));

const USAGE = `Usage:
  BACKUP_ENCRYPTION_KEY=<64 hex chars> node server/scripts/decrypt-backup.mjs <backup file> [-o <output file>]

Options:
  -o, --out <file>   Write the decrypted JSON here instead of stdout.
  -h, --help         Show this message.`;

function die(code, message) {
  console.error(message);
  process.exit(code);
}

function parseArgs(argv) {
  const opts = { file: null, out: null };
  for (let i = 0; i < argv.length; i += 1) {
    const arg = argv[i];
    if (arg === '-h' || arg === '--help') {
      console.log(USAGE);
      process.exit(0);
    } else if (arg === '-o' || arg === '--out') {
      opts.out = argv[i + 1];
      i += 1;
      if (!opts.out) die(1, `Missing a filename after ${arg}.\n\n${USAGE}`);
    } else if (arg.startsWith('-')) {
      die(1, `Unknown option ${arg}.\n\n${USAGE}`);
    } else if (opts.file === null) {
      opts.file = arg;
    } else {
      die(1, `Unexpected extra argument ${arg}.\n\n${USAGE}`);
    }
  }
  if (!opts.file) die(1, `No backup file given.\n\n${USAGE}`);
  return opts;
}

const { file, out } = parseArgs(process.argv.slice(2));

// Key first. Failing before reading a multi-megabyte file is friendlier, and
// it keeps the two failure classes (key vs file) clearly separated.
let key;
try {
  key = parseBackupKey(process.env.BACKUP_ENCRYPTION_KEY);
} catch (err) {
  if (err.code === ERR_BAD_KEY_FORMAT) {
    die(
      2,
      `BACKUP_ENCRYPTION_KEY problem: ${err.message}\n\n` +
      'Set it to the key for the environment this backup came from. It is stored\n' +
      'in Infisical per environment. If no copy of that key survives, the backup\n' +
      'cannot be recovered by any means, including by us.\n' +
      `\nTo generate a NEW key (for a new environment, not to open an old file):\n  ${KEY_GENERATION_HINT}`
    );
  }
  throw err;
}

let fileBuffer;
try {
  fileBuffer = fs.readFileSync(file);
} catch (err) {
  die(1, `Could not read ${file}: ${err.message}`);
}
if (fileBuffer.length === 0) {
  die(1, `${file} is empty, so the download did not complete.`);
}

let gzipped;
try {
  gzipped = decryptBackup(fileBuffer, key);
} catch (err) {
  switch (err.code) {
    case ERR_LEGACY_PLAINTEXT:
      die(
        1,
        `${err.message}\n\n` +
        'Backups written before encryption shipped need no key:\n' +
        `  node -e "process.stdout.write(require('zlib').gunzipSync(require('fs').readFileSync('${file.replace(/\\/g, '\\\\')}')))" > backup.json`
      );
      break;
    case ERR_UNRECOGNIZED:
    case ERR_TRUNCATED:
      die(1, `${file}: ${err.message}`);
      break;
    case ERR_AUTH_FAILED:
      // The tag lives in the header, so a ciphertext that is short by even one
      // byte fails exactly as a wrong key does. GCM cannot tell them apart,
      // so point at both rather than pretending to know which it was.
      die(
        3,
        `${file}: ${err.message}\n\n` +
        `Also worth checking: this file is ${fileBuffer.length} bytes. A partially ` +
        'downloaded backup fails in exactly this way, so compare that against the ' +
        'object size shown in R2 before concluding the key is wrong.'
      );
      break;
    default:
      die(3, `${file}: ${err.message}`);
  }
}

let json;
try {
  json = zlib.gunzipSync(gzipped);
} catch (err) {
  // Should be unreachable: GCM authenticated the ciphertext, so the plaintext
  // is exactly what was written. If this ever fires, the writer is at fault,
  // not the file in transit.
  die(3, `Decryption succeeded but the payload did not decompress: ${err.message}`);
}

if (out) {
  try {
    fs.writeFileSync(out, json);
  } catch (err) {
    die(1, `Could not write ${out}: ${err.message}`);
  }
  // Note on stderr, so the file path never pollutes a piped stdout.
  console.error(`Wrote ${json.length} bytes of decrypted JSON to ${out}`);
} else {
  process.stdout.write(json);
}
