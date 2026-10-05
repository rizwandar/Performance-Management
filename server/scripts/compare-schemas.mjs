#!/usr/bin/env node
//
// Compare the database schema of two or more environments against each other,
// and against what the checked-out code declares.
//
// Usage:
//   node server/scripts/compare-schemas.mjs dev.json staging.json prod.json
//
// Each input is the body of GET /api/admin/schema-audit from one environment,
// saved to a file. That endpoint exists because direct inbound access to the
// staging and production databases was closed in SEC-25, correctly, and is not
// being reopened.
//
// Why this exists at all: schema changes here are inline startup migrations,
// so every environment is supposed to converge on whatever the deployed code
// declares. What that argument misses is that the environments are not all
// running the same code at the same moment, one-time backfills are
// conditional, and nothing is ever dropped, so an object left behind by an
// abandoned branch stays forever. Those three gaps are invisible unless
// something looks.
//
// The reporting is deliberately directional. A column present in one
// environment and absent from another is not automatically a defect: that is
// the expected state while a change sits on staging awaiting promotion. The
// output names which side has it, so the reader can tell "not promoted yet"
// from "drifted".

import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { dirname, join } from 'node:path';

const files = process.argv.slice(2);
if (files.length < 1) {
  console.error('usage: compare-schemas.mjs <audit.json> [audit.json ...]');
  process.exit(1);
}

const envs = files.map((f) => {
  const j = JSON.parse(readFileSync(f, 'utf8'));
  if (!j.tables) throw new Error(`${f}: not a schema-audit payload (no "tables")`);
  return { label: j.environment || f, file: f, tables: j.tables };
});

// What the checked-out code declares. Parsed from the migration source rather
// than imported, because importing it would mean connecting to a database and
// running the migrations, which is the opposite of a read-only comparison.
function declaredFromCode() {
  const here = dirname(fileURLToPath(import.meta.url));
  const src = readFileSync(join(here, '..', 'db', 'database.js'), 'utf8');

  // Identifier characters include digits: several real columns have them
  // (card_expiry_14d_reminder_sent_at, audio_r2_key), and a pattern that stops
  // at the first digit reports those as missing from every environment.
  //
  // The trailing "(" matters too. Without it, a table name mentioned in a
  // prose comment matches and becomes a phantom table that is missing
  // everywhere, which is exactly the false alarm this script exists to avoid.
  const tables = new Set(
    [...src.matchAll(/CREATE TABLE IF NOT EXISTS\s+([a-z0-9_]+)\s*\(/g)].map((m) => m[1])
  );

  // Column names built by interpolation are skipped: the literal text before
  // the interpolation is not the name of anything.
  const columns = new Map();
  const addColumn = /ALTER TABLE\s+([a-z0-9_]+)\s+ADD COLUMN IF NOT EXISTS\s+([a-z0-9_]+)(\$\{)?/g;
  for (const m of src.matchAll(addColumn)) {
    if (m[3]) continue;
    if (!columns.has(m[1])) columns.set(m[1], new Set());
    columns.get(m[1]).add(m[2]);
  }
  return { tables, columns };
}

const code = declaredFromCode();
const colsOf = (env, t) => new Set((env.tables[t] || []).map((c) => c.column));
const sorted = (s) => [...s].sort();
let problems = 0;

console.log('environments compared:');
for (const e of envs) {
  const t = Object.keys(e.tables).length;
  const c = Object.values(e.tables).reduce((n, cols) => n + cols.length, 0);
  console.log(`  ${e.label.padEnd(34)} ${t} tables, ${c} columns   (${e.file})`);
}
console.log(`  ${'declared by checked-out code'.padEnd(34)} ${code.tables.size} tables`);

// 1. Declared but absent. A real defect in any environment: the migrations run
//    on every boot, so a declared table that is still missing means either the
//    service is running older code than this working tree, or a migration
//    threw partway through and left the rest of the file unapplied.
console.log('\n[1] declared by this code but missing from an environment');
let any1 = false;
for (const e of envs) {
  const missingTables = sorted(code.tables).filter((t) => !e.tables[t]);
  const missingCols = [];
  for (const [t, want] of code.columns) {
    if (!e.tables[t]) continue;
    const got = colsOf(e, t);
    for (const c of sorted(want)) if (!got.has(c)) missingCols.push(`${t}.${c}`);
  }
  if (missingTables.length || missingCols.length) {
    any1 = true;
    problems++;
    console.log(`  ${e.label}:`);
    if (missingTables.length) console.log(`    tables : ${missingTables.join(', ')}`);
    if (missingCols.length) console.log(`    columns: ${missingCols.join(', ')}`);
  }
}
if (!any1) console.log('  none');

// 2. Present but no longer declared. Not a defect by itself: this project
//    never drops a column, so anything deliberately retired lands here and
//    stays. Worth reading once to recognise the known entries, after which a
//    new arrival in this list is the interesting signal.
console.log('\n[2] present in an environment but not declared by this code');
let any2 = false;
for (const e of envs) {
  const extra = Object.keys(e.tables).filter((t) => !code.tables.has(t)).sort();
  if (extra.length) {
    any2 = true;
    console.log(`  ${e.label}: ${extra.join(', ')}`);
  }
}
if (!any2) console.log('  none');

// 3. Environment against environment. Expected to be non-empty whenever
//    something is sitting on staging awaiting promotion, which is why each
//    line says which side has the object instead of calling it a gap.
if (envs.length > 1) {
  console.log('\n[3] differences between environments');
  let any3 = false;
  for (let i = 0; i < envs.length; i++) {
    for (let j = i + 1; j < envs.length; j++) {
      const a = envs[i];
      const b = envs[j];
      const onlyA = Object.keys(a.tables).filter((t) => !b.tables[t]).sort();
      const onlyB = Object.keys(b.tables).filter((t) => !a.tables[t]).sort();
      const colDiff = [];
      for (const t of Object.keys(a.tables)) {
        if (!b.tables[t]) continue;
        const ca = colsOf(a, t);
        const cb = colsOf(b, t);
        for (const c of sorted(ca)) if (!cb.has(c)) colDiff.push(`${t}.${c} only in ${a.label}`);
        for (const c of sorted(cb)) if (!ca.has(c)) colDiff.push(`${t}.${c} only in ${b.label}`);
      }
      if (onlyA.length || onlyB.length || colDiff.length) {
        any3 = true;
        console.log(`  ${a.label} vs ${b.label}:`);
        if (onlyA.length) console.log(`    tables only in ${a.label}: ${onlyA.join(', ')}`);
        if (onlyB.length) console.log(`    tables only in ${b.label}: ${onlyB.join(', ')}`);
        for (const d of colDiff) console.log(`    ${d}`);
      }
    }
  }
  if (!any3) console.log('  none, the environments match');
}

console.log(
  problems
    ? `\n${problems} environment(s) with a real gap under [1].`
    : '\nNo environment is missing anything this code declares.'
);
