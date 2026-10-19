import assert from 'node:assert/strict';
import { createHmac, randomUUID } from 'node:crypto';
import { createClient } from '@supabase/supabase-js';

const url = process.env.RECOVERY_LOCAL_API_URL;
const anonKey = process.env.RECOVERY_LOCAL_ANON_KEY;
const serviceKey = process.env.RECOVERY_LOCAL_SERVICE_ROLE_KEY;
const origin = new URL(url || '');
assert.equal(origin.protocol, 'http:');
assert.equal(origin.hostname, '127.0.0.1');
assert.equal(origin.port, '54321');
assert.ok(anonKey && serviceKey, 'Disposable API keys required');

const admin = createClient(url, serviceKey, { auth: { persistSession: false, autoRefreshToken: false } });
const nonce = randomUUID().slice(0, 8);
const password = `Synthetic-${randomUUID()}-Mfa4!`;

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
const membership = await admin.from('admin_users').insert({
  user_id: operator.id, active: true, is_super_admin: true, display_name: 'Isolated MFA Test Administrator',
});
assert.ifError(membership.error);

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

const blockedDemotion = await admin.from('admin_users').update({ is_super_admin: false }).eq('user_id', operator.id);
assert.ok(blockedDemotion.error, 'Protected Super Admin may not be demoted even by database service role');
const blockedDeactivation = await admin.from('admin_users').update({ active: false }).eq('user_id', operator.id);
assert.ok(blockedDeactivation.error, 'Protected Super Admin may not be deactivated even by database service role');
const blockedDeletion = await admin.from('admin_users').delete().eq('user_id', operator.id);
assert.ok(blockedDeletion.error, 'Protected Super Admin may not be deleted even by database service role');

const elevatedToken = (await session.auth.getSession()).data.session?.access_token;
assert.ok(elevatedToken, 'Elevated session token required before revocation test');
const signOut = await admin.auth.admin.signOut(elevatedToken, 'global');
assert.ifError(signOut.error);
const revoked = await session.rpc('has_permission', { p_permission_id: 'roles.manage' });
assert.ifError(revoked.error);
assert.equal(revoked.data, false, 'Revoked session must immediately lose database permission');

console.log('PHASE09_ISOLATED_AUTH_TOTP_RBAC_REVOCATION_PASS');
