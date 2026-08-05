// Authorization / IDOR regression probe.
//
// Registers two throwaway users against a running instance of the server,
// then tries the things a manual Burp Suite session would try: reading or
// modifying the other user's data by guessing an id, reaching an admin-only
// endpoint as a non-admin, and forging a JWT by tampering its payload
// (including an "alg: none" downgrade attempt) without the signing secret.
//
// Exits non-zero if anything that should be blocked isn't - wire this into
// CI (see .github/workflows/authz-probe.yml) so an authorization regression
// fails the build instead of waiting to be found in production.
//
// Usage: BASE_URL=http://localhost:3001/api node server/scripts/authz-probe.mjs
const BASE = process.env.BASE_URL || 'http://localhost:3001/api';
const ADMIN_EMAIL = process.env.SEED_ADMIN_EMAIL || 'admin@igh.local';
const ADMIN_PASSWORD = process.env.SEED_ADMIN_PASSWORD || 'Admin1234';

const results = [];
function record(name, pass, detail) {
  results.push({ name, pass, detail });
  console.log(`[${pass ? 'PASS (secure)' : 'FAIL (VULNERABLE)'}] ${name} — ${detail}`);
}

async function req(method, path, { token, body } = {}) {
  const res = await fetch(BASE + path, {
    method,
    headers: {
      'Content-Type': 'application/json',
      ...(token ? { Authorization: `Bearer ${token}` } : {}),
    },
    body: body ? JSON.stringify(body) : undefined,
  });
  let json = null;
  try { json = await res.json(); } catch { /* non-JSON response */ }
  return { status: res.status, json };
}

async function registerAndLogin(email, name) {
  const password = 'TestPass123';
  await req('POST', '/auth/register', { body: { name, email, password, privacy_consent: true } });
  const login = await req('POST', '/auth/login', { body: { email, password } });
  return login.json?.token;
}

(async () => {
  const stamp = Date.now();
  const tokenA = await registerAndLogin(`authz-probe-a-${stamp}@test.local`, 'Probe A');
  const tokenB = await registerAndLogin(`authz-probe-b-${stamp}@test.local`, 'Probe B');
  if (!tokenA || !tokenB) {
    console.error('Could not obtain test tokens - aborting probe.');
    process.exit(1);
  }

  const create = await req('POST', '/sections/people-to-notify', {
    token: tokenA,
    body: { name: 'Alice Contact', relationship: 'Sister', email: 'x@x.com', phone: '555', notified_by: 'phone', notes: 'secret note' },
  });
  const itemId = create.json?.id;
  record('Create as A', create.status === 201 && !!itemId, `status=${create.status} id=${itemId}`);

  const listB = await req('GET', '/sections/people-to-notify', { token: tokenB });
  const leaked = Array.isArray(listB.json) && listB.json.some(r => r.id === itemId);
  record("IDOR via list endpoint (B enumerates A's data)", !leaked, `B's list length=${listB.json?.length}, contains A's item=${leaked}`);

  const updateAsB = await req('PUT', `/sections/people-to-notify/${itemId}`, {
    token: tokenB, body: { name: 'HACKED', relationship: 'x', email: 'x', phone: 'x', notified_by: 'x', notes: 'x' },
  });
  record("IDOR via direct PUT (B edits A's record by id)", updateAsB.status === 404, `status=${updateAsB.status}`);

  const deleteAsB = await req('DELETE', `/sections/people-to-notify/${itemId}`, { token: tokenB });
  record("IDOR via direct DELETE (B deletes A's record by id)", deleteAsB.status === 404, `status=${deleteAsB.status}`);

  const listA = await req('GET', '/sections/people-to-notify', { token: tokenA });
  const stillThere = Array.isArray(listA.json) && listA.json.some(r => r.id === itemId && r.name === 'Alice Contact');
  record("A's record unmodified after B's attempts", stillThere, `still present unmodified=${stillThere}`);

  const adminAsB = await req('GET', '/admin/users', { token: tokenB });
  record('Non-admin B blocked from /api/admin/users', adminAsB.status === 403 || adminAsB.status === 401, `status=${adminAsB.status}`);

  const adminLogin = await req('POST', '/auth/login', { body: { email: ADMIN_EMAIL, password: ADMIN_PASSWORD } });
  const adminToken = adminLogin.json?.token;
  const adminAsAdmin = await req('GET', '/admin/users', { token: adminToken });
  record('Positive control: seeded admin CAN reach /api/admin/users', adminAsAdmin.status === 200, `status=${adminAsAdmin.status}`);

  const [h, p, s] = tokenB.split('.');
  const payload = JSON.parse(Buffer.from(p, 'base64url').toString());
  const forgedPayload = { ...payload, is_admin: 1, id: 1 };
  const forgedP = Buffer.from(JSON.stringify(forgedPayload)).toString('base64url');
  const forgedToken = `${h}.${forgedP}.${s}`;
  const forged = await req('GET', '/admin/users', { token: forgedToken });
  record('Forged JWT (role/id tampered, no valid signature) rejected', forged.status === 401, `status=${forged.status}`);

  const noneHeader = Buffer.from(JSON.stringify({ alg: 'none', typ: 'JWT' })).toString('base64url');
  const noneToken = `${noneHeader}.${forgedP}.`;
  const noneAttempt = await req('GET', '/admin/users', { token: noneToken });
  record('"alg: none" token rejected', noneAttempt.status === 401, `status=${noneAttempt.status}`);

  const failed = results.filter(r => !r.pass);
  console.log(`\n${results.length - failed.length}/${results.length} checks passed (secure).`);
  if (failed.length) {
    console.log('VULNERABLE findings:');
    failed.forEach(f => console.log(`  - ${f.name}: ${f.detail}`));
    process.exit(1);
  }
})();
