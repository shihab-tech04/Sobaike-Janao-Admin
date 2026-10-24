import assert from 'node:assert/strict';
import { createHmac, randomUUID } from 'node:crypto';
import { writeFileSync } from 'node:fs';
import { resolve, sep } from 'node:path';
import { execFileSync } from 'node:child_process';
import { createClient } from '@supabase/supabase-js';

const url = process.env.RECOVERY_LOCAL_API_URL;
const anonKey = process.env.RECOVERY_LOCAL_ANON_KEY;
const serviceKey = process.env.RECOVERY_LOCAL_SERVICE_ROLE_KEY;
const dbUrl = process.env.RECOVERY_LOCAL_DB_URL;
const origin = new URL(url || '');
const dbOrigin = new URL(dbUrl || '');
assert.equal(origin.protocol, 'http:');
assert.equal(origin.hostname, '127.0.0.1');
assert.equal(origin.port, '54321');
assert.equal(dbOrigin.hostname, '127.0.0.1');
assert.equal(dbOrigin.port, '54322');
assert.ok(['postgres:', 'postgresql:'].includes(dbOrigin.protocol));
assert.ok(anonKey && serviceKey, 'Disposable API keys required');

const admin = createClient(url, serviceKey, { auth: { persistSession: false, autoRefreshToken: false } });
const nonce = randomUUID().slice(0, 8);
const password = `Synthetic-${randomUUID()}-Mfa4!`;

function isolatedSql(statement, expectedFailure = false) {
  try {
    execFileSync('psql', [dbUrl, '--set', 'ON_ERROR_STOP=1', '--command', statement], {
      encoding: 'utf8', stdio: 'pipe', timeout: 15_000,
    });
    assert.equal(expectedFailure, false, 'Invariant-breaking SQL unexpectedly succeeded');
  } catch (error) {
    if (!expectedFailure) throw error;
    assert.match(String(error.stderr || ''), /Super Administrator account cannot be/);
  }
}

function decodeBase32(secret) {
  const alphabet = 'ABCDEFGHIJKLMNOPQRSTUVWXYZ234567';
  let bits = '';
  for (const char of secret.toUpperCase().replace(/=|\s/g, '')) {
    const digit = alphabet.indexOf(char);
    assert.ok(digit >= 0, 'Invalid isolated TOTP secret');
    bits += digit.toString(2).padStart(5, '0');
  }
  const bytes = [];
  for (let index = 0; index + 8 <= bits.length; index += 8) {
    bytes.push(parseInt(bits.slice(index, index + 8), 2));
  }
  return Buffer.from(bytes);
}

function totp(secret, offset = 0) {
  const counter = Buffer.alloc(8);
  counter.writeBigUInt64BE(BigInt(Math.floor(Date.now() / 30_000) + offset));
  const digest = createHmac('sha1', decodeBase32(secret)).update(counter).digest();
  const start = digest[digest.length - 1] & 0x0f;
  const truncated = (digest.readUInt32BE(start) & 0x7fffffff) % 1_000_000;
  return String(truncated).padStart(6, '0');
}

async function createSyntheticUser(label) {
  const email = `${label}-${nonce}@recovery.invalid`;
  const result = await admin.auth.admin.createUser({ email, password, email_confirm: true });
  assert.ifError(result.error);
  assert.ok(result.data.user?.id);
  return { id: result.data.user.id, email };
}

async function loginAs(email) {
  const user = createClient(url, anonKey, { auth: { persistSession: false, autoRefreshToken: false } });
  const result = await user.auth.signInWithPassword({ email, password });
  assert.ifError(result.error);
  assert.ok(result.data.session?.access_token);
  return user;
}

async function contextFor(user) {
  const result = await user.rpc('admin_get_my_authorization_context');
  assert.ifError(result.error);
  return result.data;
}

const outsider = await createSyntheticUser('outsider');
const outsiderSession = await loginAs(outsider.email);
assert.equal((await contextFor(outsiderSession)).is_admin, false, 'A valid Auth user must not imply Admin membership');
const outsiderRole = await outsiderSession.rpc('has_permission', { p_permission_id: 'roles.manage' });
assert.ifError(outsiderRole.error);
assert.equal(outsiderRole.data, false);

const operator = await createSyntheticUser('operator');
assert.match(operator.id, /^[0-9a-f-]{36}$/i);
// The captured production grants correctly prohibit service_role table inserts.
// The metadata-only recovery snapshot deliberately contains no application data:
// seed only synthetic permission catalog rows in this disposable localhost test.
isolatedSql(`INSERT INTO public.permissions(id, module, action, name_en, name_bn) VALUES
  ('roles.manage', 'roles', 'manage', 'Manage Roles (synthetic)', 'ভূমিকা (পরীক্ষা)'),
  ('admin_users.manage', 'admin_users', 'manage', 'Manage Users (synthetic)', 'ব্যবহারকারী (পরীক্ষা)'),
  ('complaints.evidence_view', 'complaints', 'evidence_view', 'View Evidence (synthetic)', 'প্রমাণ (পরীক্ষা)')`);
// Seed only the test subject membership as the disposable database owner.
isolatedSql(`INSERT INTO public.admin_users(user_id, active, is_super_admin, display_name) VALUES ('${operator.id}', true, true, 'Isolated MFA Test Administrator')`);

const session = await loginAs(operator.email);
const before = await contextFor(session);
assert.equal(before.is_admin, true);
assert.equal(before.is_super_admin, true);
assert.ok(before.permission_ids.includes('roles.manage'));

for (const permission of ['roles.manage', 'admin_users.manage', 'complaints.evidence_view']) {
  const result = await session.rpc('has_permission', { p_permission_id: permission });
  assert.ifError(result.error);
  assert.equal(result.data, false, `AAL1 must deny ${permission}`);
}

const enroll = await session.auth.mfa.enroll({ factorType: 'totp' });
assert.ifError(enroll.error);
assert.ok(enroll.data.totp?.secret);
let verified = false;
for (const offset of [0, -1, 1]) {
  const challenge = await session.auth.mfa.challengeAndVerify({
    factorId: enroll.data.id,
    code: totp(enroll.data.totp.secret, offset),
  });
  if (!challenge.error) {
    verified = true;
    break;
  }
}
assert.ok(verified, 'Synthetic authenticator code could not be verified');
const aal = await session.auth.mfa.getAuthenticatorAssuranceLevel();
assert.ifError(aal.error);
assert.equal(aal.data.currentLevel, 'aal2');

for (const permission of ['roles.manage', 'admin_users.manage', 'complaints.evidence_view']) {
  const result = await session.rpc('has_permission', { p_permission_id: permission });
  assert.ifError(result.error);
  assert.equal(result.data, true, `verified AAL2 Super Admin should hold ${permission}`);
}

isolatedSql(`UPDATE public.admin_users SET is_super_admin = false WHERE user_id = '${operator.id}'`, true);
isolatedSql(`UPDATE public.admin_users SET active = false WHERE user_id = '${operator.id}'`, true);
isolatedSql(`DELETE FROM public.admin_users WHERE user_id = '${operator.id}'`, true);

const elevatedToken = (await session.auth.getSession()).data.session?.access_token;
assert.ok(elevatedToken, 'Elevated session token required before revocation test');
const signOut = await admin.auth.admin.signOut(elevatedToken, 'global');
assert.ifError(signOut.error);
const revoked = await session.rpc('has_permission', { p_permission_id: 'roles.manage' });
assert.ifError(revoked.error);
assert.equal(revoked.data, false, 'Revoked session must immediately lose database permission');

// Carry only disposable synthetic credentials to the *same ephemeral job's*
// A01 Chromium test. Never upload the file, echo the values or use hosted Auth.
if (process.env.RECOVERY_A01_FIXTURE_PATH) {
  const runner = resolve(process.env.RUNNER_TEMP || '');
  const file = resolve(process.env.RECOVERY_A01_FIXTURE_PATH);
  assert.ok(file.startsWith(runner + sep), 'A01 fixture must remain in runner temp');
  writeFileSync(file, JSON.stringify({
    outsiderEmail: outsider.email,
    adminEmail: operator.email,
    password,
    totpSecret: enroll.data.totp.secret,
  }), { mode: 0o600 });
}
console.log('PHASE09_ISOLATED_AUTH_TOTP_RBAC_REVOCATION_PASS');
