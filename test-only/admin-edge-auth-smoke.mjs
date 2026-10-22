import assert from 'node:assert/strict';

const api = process.env.RECOVERY_LOCAL_API_URL;
const anonKey = process.env.RECOVERY_LOCAL_ANON_KEY;
assert.equal(new URL(api).hostname, '127.0.0.1');
assert.equal(new URL(api).port, '54321');
assert.ok(anonKey);

for (const slug of ['admin-create-user', 'admin-delete-user']) {
  const url = `${api}/functions/v1/${slug}`;
  const preflight = await fetch(url, {
    method: 'OPTIONS', headers: { Origin: 'http://localhost:5173' },
    signal: AbortSignal.timeout(25_000),
  });
  assert.equal(preflight.status, 200, `${slug}: approved preflight must reach Edge`);
  assert.equal(await preflight.text(), 'ok');

  const wrongMethod = await fetch(url, {
    method: 'GET', headers: { Origin: 'http://localhost:5173', apikey: anonKey },
    signal: AbortSignal.timeout(25_000),
  });
  assert.equal(wrongMethod.status, 405, `${slug}: GET must not mutate Admin accounts`);

  const unauthorized = await fetch(url, {
    method: 'POST',
    headers: { Origin: 'http://localhost:5173', apikey: anonKey, 'content-type': 'application/json' },
    body: '{}', signal: AbortSignal.timeout(25_000),
  });
  assert.equal(unauthorized.status, 401, `${slug}: no session must be refused`);
  const response = await unauthorized.json();
  assert.equal(response.code, 'UNAUTHORIZED');
}

console.log('ISOLATED_ADMIN_EDGE_AUTH_DENIAL_PASS');
