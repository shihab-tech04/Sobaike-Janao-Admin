import assert from 'node:assert/strict';
import { execFileSync } from 'node:child_process';
import { createHmac, randomUUID } from 'node:crypto';
import { createClient } from '@supabase/supabase-js';

const api = process.env.RECOVERY_LOCAL_API_URL;
const db = process.env.RECOVERY_LOCAL_DB_URL;
const anon = process.env.RECOVERY_LOCAL_ANON_KEY;
const service = process.env.RECOVERY_LOCAL_SERVICE_ROLE_KEY;
const target = new URL(api || '');
const sqlTarget = new URL(db || '');
assert.equal(`${target.protocol}//${target.hostname}:${target.port}`, 'http://127.0.0.1:54321');
assert.equal(sqlTarget.hostname, '127.0.0.1');
assert.equal(sqlTarget.port, '54322');
assert.ok(['postgres:', 'postgresql:'].includes(sqlTarget.protocol));
assert.ok(anon && service);

const root = createClient(api, service, { auth: { persistSession: false, autoRefreshToken: false } });
const publicClient = createClient(api, anon, { auth: { persistSession: false, autoRefreshToken: false } });
const suffix = randomUUID().slice(0, 8);
const password = `Isolated-${randomUUID()}!Mfa`;
const reportA = `SYNTH-MOD-${suffix.toUpperCase()}`;
const reportB = `SYNTH-REJ-${suffix.toUpperCase()}`;
const responseA = `SYNTH-RSP-${suffix.toUpperCase()}`;
const responseB = `SYNTH-RRJ-${suffix.toUpperCase()}`;

function sql(statement, expectFailure = false) {
  try {
    const output = execFileSync('psql', [db, '--set', 'ON_ERROR_STOP=1', '--tuples-only', '--no-align', '--command', statement], {
      encoding: 'utf8', stdio: 'pipe', timeout: 20_000,
    }).trim();
    assert.equal(expectFailure, false, `Expected SQL denial: ${statement.slice(0, 60)}`);
    return output;
  } catch (error) {
    if (!expectFailure) throw error;
    return String(error.stderr || '');
  }
}

function totp(secret) {
  const alphabet = 'ABCDEFGHIJKLMNOPQRSTUVWXYZ234567';
  let bits = '';
  for (const ch of secret.toUpperCase().replace(/=|\s/g, '')) {
    const digit = alphabet.indexOf(ch);
    assert.ok(digit >= 0);
    bits += digit.toString(2).padStart(5, '0');
  }
  const key = Buffer.from(Array.from({ length: Math.floor(bits.length / 8) }, (_, i) => parseInt(bits.slice(i * 8, i * 8 + 8), 2)));
  const counter = Buffer.alloc(8);
  counter.writeBigUInt64BE(BigInt(Math.floor(Date.now() / 30_000)));
  const hmac = createHmac('sha1', key).update(counter).digest();
  const offset = hmac[hmac.length - 1] & 15;
  return String((hmac.readUInt32BE(offset) & 0x7fffffff) % 1_000_000).padStart(6, '0');
}

const email = `moderation-${suffix}@recovery.invalid`;
const created = await root.auth.admin.createUser({ email, password, email_confirm: true });
assert.ifError(created.error);
const userId = created.data.user?.id;
assert.match(userId || '', /^[0-9a-f-]{36}$/i);

// A metadata-only snapshot intentionally has zero permission definitions.
// Populate exclusively synthetic rows in this disposable localhost DB.
sql(`INSERT INTO public.permissions(id, module, action, name_en, name_bn) VALUES
('complaints.publish', 'complaints', 'publish', 'Synthetic Publish', 'প্রকাশ পরীক্ষা'),
('complaints.unpublish', 'complaints', 'unpublish', 'Synthetic Unpublish', 'অপ্রকাশ পরীক্ষা'),
('complaints.reject', 'complaints', 'reject', 'Synthetic Reject', 'বাতিল পরীক্ষা'),
('responses.publish', 'responses', 'publish', 'Synthetic Response Publish', 'প্রতিক্রিয়া প্রকাশ'),
('responses.reject', 'responses', 'reject', 'Synthetic Response Reject', 'প্রতিক্রিয়া বাতিল'),
('responses.unpublish', 'responses', 'unpublish', 'Synthetic Response Unpublish', 'প্রতিক্রিয়া অপ্রকাশ')`);
sql(`INSERT INTO public.admin_users(user_id, active, is_super_admin, display_name)
  VALUES ('${userId}', true, false, 'Synthetic Delegated Moderator')`);
// Preserve the one-protected-Super-Admin invariant from Phase09. Exercise a
// normal delegated Admin with only the six necessary moderation permissions.
const roleId = `synthetic_moderator_${suffix}`;
sql(`INSERT INTO public.roles(id, name_en, name_bn, active, is_system)
  VALUES ('${roleId}', 'Synthetic Moderation Role', 'পরীক্ষামূলক মডারেটর', true, false)`);
sql(`INSERT INTO public.role_permissions(role_id, permission_id)
  SELECT '${roleId}', id FROM public.permissions WHERE id IN (
    'complaints.publish','complaints.unpublish','complaints.reject',
    'responses.publish','responses.reject','responses.unpublish')`);
sql(`INSERT INTO public.user_roles(user_id, role_id) VALUES ('${userId}', '${roleId}')`);

// The production-derived fixture is deliberately metadata-only and contains
// no notification-catalogue rows. Recreate only the synthetic event definitions
// required by real moderation RPCs; never weaken or skip their audit producers.
sql(`INSERT INTO public.admin_notification_event_catalogue(
  event_key, category, default_layer, default_severity, description, active)
  VALUES
  ('complaint.submitted', 'complaint', 'workflow_activity', 'info', 'Synthetic submission event', true),
  ('complaint.published', 'complaint', 'workflow_activity', 'info', 'Synthetic publication event', true),
  ('complaint.unpublished', 'complaint', 'workflow_activity', 'info', 'Synthetic withdrawal event', true),
  ('complaint.rejected', 'complaint', 'workflow_activity', 'warning', 'Synthetic rejection event', true),
  ('response.published', 'complaint', 'workflow_activity', 'info', 'Synthetic response event', true),
  ('response.unpublished', 'complaint', 'workflow_activity', 'info', 'Synthetic response withdrawal', true),
  ('response.rejected', 'complaint', 'workflow_activity', 'warning', 'Synthetic response rejection', true)`);

// Existing synthetic taxonomy fixture defines public_safety. No real data is copied.
sql(`INSERT INTO public.subcategories(id, segment_id, name_en, name_bn, active, sort_order)
  VALUES ('synthetic-public-safety', 'public_safety', 'Controlled synthetic safety', 'পরীক্ষামূলক নিরাপত্তা', true, 1)`);
for (const id of [reportA, reportB]) {
  sql(`INSERT INTO public.complaints(
    id, segment_id, subcategory_id, title, title_en, description, description_en,
    incident_date, privacy_choice, division, district, status, origin_type,
    reporter_name, reporter_contact, publication_preferences)
  VALUES ('${id}', 'public_safety', 'synthetic-public-safety',
    'পরীক্ষামূলক অভিযোগ', 'Synthetic moderation contract report',
    'শুধু বিচ্ছিন্ন পরীক্ষার তথ্য', 'Isolated test report, no real incident',
    '2026-10-18', 'anonymous', 'Dhaka', 'Dhaka', 'submitted', 'citizen',
    'PRIVATE_SYNTHETIC_NAME', 'PRIVATE_SYNTHETIC_CONTACT',
    '{"showDescription":true,"showGeneralLocation":true,"showSubjectName":false,"showOrganization":false}'::jsonb)`);
}

const operator = createClient(api, anon, { auth: { persistSession: false, autoRefreshToken: false } });
const signIn = await operator.auth.signInWithPassword({ email, password });
assert.ifError(signIn.error);

// Verify the same moderation decision reaches BOTH anonymous Public list views.
 // These queries are against a disposable localhost database, never production.
async function assertPublicDiscovery(reportId, shouldBeVisible, stage) {
  for (const functionName of ['get_public_published_reports', 'get_public_home_feed']) {
    const result = await publicClient.rpc(functionName);
    assert.ifError(result.error);
    assert.ok(Array.isArray(result.data), `${functionName} must return a Public array (${stage})`);
    const matching = result.data.filter((item) => item?.id === reportId);
    assert.equal(matching.length, shouldBeVisible ? 1 : 0,
      `${functionName} visibility does not match ${stage} for ${reportId}`);
    assert.ok(!JSON.stringify(result.data).includes('PRIVATE_SYNTHETIC'),
      `${functionName} disclosed private synthetic reporter fields at ${stage}`);
  }
}

const beforePublic = await publicClient.rpc('get_public_published_report', { p_report_id: reportA });
assert.ifError(beforePublic.error);
assert.equal(beforePublic.data, null, 'Unreviewed synthetic complaint must be hidden from Public');
await assertPublicDiscovery(reportA, false, 'before moderation');

const premature = await operator.rpc('admin_publish_complaint', { p_complaint_id: reportA });
assert.ok(premature.error, 'AAL1 must not publish a complaint');
assert.equal(premature.error.code, '42501');

const enroll = await operator.auth.mfa.enroll({ factorType: 'totp' });
assert.ifError(enroll.error);
const verified = await operator.auth.mfa.challengeAndVerify({ factorId: enroll.data.id, code: totp(enroll.data.totp.secret) });
assert.ifError(verified.error);
const aal = await operator.auth.mfa.getAuthenticatorAssuranceLevel();
assert.equal(aal.data?.currentLevel, 'aal2');

const published = await operator.rpc('admin_publish_complaint', { p_complaint_id: reportA });
assert.ifError(published.error);
assert.equal(sql(`SELECT status FROM public.complaints WHERE id = '${reportA}'`), 'published');
const publicReport = await publicClient.rpc('get_public_published_report', { p_report_id: reportA });
assert.ifError(publicReport.error);
assert.equal(publicReport.data?.id, reportA);
assert.equal(publicReport.data?.postOrigin, 'user');
assert.equal(publicReport.data?.reporterName, null);
assert.ok(!JSON.stringify(publicReport.data).includes('PRIVATE_SYNTHETIC'));
await assertPublicDiscovery(reportA, true, 'after AAL2 publication');

const responseInsert = `INSERT INTO public.complaint_responses(id, complaint_id, response_type, status, content)
  VALUES ('${responseA}', '${reportA}', 'citizen_information', 'pending_review', 'Synthetic additional information'),
         ('${responseB}', '${reportA}', 'citizen_information', 'pending_review', 'Synthetic rejected information')`;
sql(responseInsert);

const publishResponse = await operator.rpc('admin_publish_response', { p_response_id: responseA });
assert.ifError(publishResponse.error);
const publicResponses = await publicClient.rpc('get_public_published_responses', { p_report_id: reportA });
assert.ifError(publicResponses.error);
assert.ok(JSON.stringify(publicResponses.data).includes('Synthetic additional information'));
assert.ok(!JSON.stringify(publicResponses.data).includes('Synthetic rejected information'));

const rejectResponse = await operator.rpc('admin_reject_response', { p_response_id: responseB, p_note: 'Synthetic review failed' });
assert.ifError(rejectResponse.error);
assert.equal(sql(`SELECT status FROM public.complaint_responses WHERE id = '${responseB}'`), 'rejected');

const unpublishResponse = await operator.rpc('admin_unpublish_response', { p_response_id: responseA, p_reason: 'Synthetic withdrawal' });
assert.ifError(unpublishResponse.error);
assert.equal(sql(`SELECT status FROM public.complaint_responses WHERE id = '${responseA}'`), 'unpublished');

const unpublish = await operator.rpc('admin_unpublish_complaint', { p_complaint_id: reportA, p_reason: 'Synthetic withdrawal' });
assert.ifError(unpublish.error);
assert.equal(sql(`SELECT status FROM public.complaints WHERE id = '${reportA}'`), 'unpublished');
const gone = await publicClient.rpc('get_public_published_report', { p_report_id: reportA });
assert.ifError(gone.error);
assert.equal(gone.data, null, 'Unpublished complaint must disappear from Public');
await assertPublicDiscovery(reportA, false, 'after withdrawal');

const noReason = await operator.rpc('admin_reject_complaint', { p_complaint_id: reportB, p_reason_code: '' });
assert.ok(noReason.error, 'Reasonless rejection must fail');
const rejected = await operator.rpc('admin_reject_complaint', {
  p_complaint_id: reportB, p_reason_code: 'synthetic_controlled_reason', p_note: 'Synthetic moderation test',
});
assert.ifError(rejected.error);
assert.equal(sql(`SELECT status FROM public.complaints WHERE id = '${reportB}'`), 'rejected');
const hidden = await publicClient.rpc('get_public_published_report', { p_report_id: reportB });
assert.ifError(hidden.error);
assert.equal(hidden.data, null);
await assertPublicDiscovery(reportB, false, 'after rejection');

const auditCount = Number(sql(`SELECT count(*) FROM public.admin_audit_logs WHERE target_id IN ('${reportA}', '${reportB}', '${responseA}', '${responseB}')`));
assert.ok(auditCount >= 5, `Expected audited complaint and response transitions; found ${auditCount}`);
console.log('PHASE10_ISOLATED_MODERATION_AND_PUBLIC_SYNC_PASS');
