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
assert.ok(anon && service && anon !== service);

const options = { auth: { persistSession: false, autoRefreshToken: false } };
const root = createClient(api, service, options);
const visitor = createClient(api, anon, options);
const admin = createClient(api, anon, options);
const suffix = randomUUID().slice(0, 8);
const subId = `synthetic_form_${suffix}`;
const roleId = `synthetic_form_role_${suffix}`;
const email = `form-${suffix}@recovery.invalid`;
const password = `Synthetic-Form-${randomUUID()}!`;

const sql = (statement) => execFileSync('psql', [db, '--set', 'ON_ERROR_STOP=1',
  '--tuples-only', '--no-align', '--command', statement],
{ encoding: 'utf8', stdio: 'pipe', timeout: 20_000 }).trim();
const unwrap = (r, context) => { assert.ifError(r.error, `${context}: ${r.error?.message}`); return r.data; };

function totp(secret) {
  const alphabet = 'ABCDEFGHIJKLMNOPQRSTUVWXYZ234567';
  let bits = '';
  for (const c of secret.toUpperCase().replace(/=|\s/g, '')) {
    const digit = alphabet.indexOf(c);
    assert.ok(digit >= 0);
    bits += digit.toString(2).padStart(5, '0');
  }
  const key = Buffer.from(Array.from({ length: Math.floor(bits.length / 8) }, (_, i) => parseInt(bits.slice(i * 8, i * 8 + 8), 2)));
  const count = Buffer.alloc(8);
  count.writeBigUInt64BE(BigInt(Math.floor(Date.now() / 30_000)));
  const digest = createHmac('sha1', key).update(count).digest();
  const offset = digest.at(-1) & 15;
  return String((digest.readUInt32BE(offset) & 0x7fffffff) % 1_000_000).padStart(6, '0');
}

const user = unwrap(await root.auth.admin.createUser({ email, password, email_confirm: true }), 'synthetic user').user;
assert.ok(user.id);
sql(`INSERT INTO public.permissions(id,module,action,name_en,name_bn) VALUES
('categories.view','categories','view','Synthetic category read','বিভাগ দেখা'),
('categories.manage','categories','manage','Synthetic category edit','বিভাগ সম্পাদনা')`);
sql(`INSERT INTO public.admin_users(user_id,active,is_super_admin,display_name)
  VALUES ('${user.id}',true,false,'Synthetic form reviewer')`);
sql(`INSERT INTO public.roles(id,name_en,name_bn,active,is_system)
  VALUES ('${roleId}','Synthetic Form Reviewer','পরীক্ষামূলক ফর্ম',true,false)`);
sql(`INSERT INTO public.role_permissions(role_id,permission_id)
  SELECT '${roleId}',id FROM public.permissions WHERE id IN ('categories.view','categories.manage','complaints.publish')`);
sql(`INSERT INTO public.user_roles(user_id,role_id) VALUES ('${user.id}','${roleId}')`);

unwrap(await admin.auth.signInWithPassword({ email, password }), 'synthetic local Auth login');
assert.ok((await visitor.rpc('admin_create_taxonomy_item', {
  p_item_type: 'subcategory', p_item_id: subId, p_parent_segment_id: 'public_safety',
  p_name_en: 'Synthetic audit', p_name_bn: 'পরীক্ষামূলক নিরীক্ষা', p_sort_order: 58,
})).error, 'anonymous must not create taxonomy');
assert.ok((await admin.rpc('admin_create_taxonomy_item', {
  p_item_type: 'subcategory', p_item_id: subId, p_parent_segment_id: 'public_safety',
  p_name_en: 'Synthetic audit', p_name_bn: 'পরীক্ষামূলক নিরীক্ষা', p_sort_order: 58,
})).error, 'AAL1 may not mutate taxonomy');

const enrolled = unwrap(await admin.auth.mfa.enroll({ factorType: 'totp' }), 'local TOTP enrollment');
unwrap(await admin.auth.mfa.challengeAndVerify({ factorId: enrolled.id, code: totp(enrolled.totp.secret) }), 'TOTP verification');
assert.equal(unwrap(await admin.auth.mfa.getAuthenticatorAssuranceLevel(), 'AAL2 assurance').currentLevel, 'aal2');

const created = unwrap(await admin.rpc('admin_create_taxonomy_item', {
  p_item_type: 'subcategory', p_item_id: subId, p_parent_segment_id: 'public_safety',
  p_name_en: 'Synthetic audit', p_name_bn: 'পরীক্ষামূলক নিরীক্ষা', p_sort_order: 58,
}), 'create inactive form-bearing subcategory');
assert.equal(created.item.active, false);
assert.equal(created.item.config_status, 'draft');
const original = unwrap(await admin.rpc('admin_get_reporting_form', { p_subcategory_id: subId }), 'read six default fields');
assert.equal(original.schema.status, 'draft');
assert.equal(original.fields.length, 6);
assert.ok(original.fields.some((field) => field.storageKey === 'title' && field.required));
assert.ok(original.fields.some((field) => field.storageKey === 'description' && field.required));

const formFields = [...original.fields, {
  fieldKey: 'witness_type', fieldType: 'select', storageMode: 'custom_json', storageKey: 'witness_type',
  labelEn: 'Witness type', labelBn: 'সাক্ষীর ধরন', helperEn: 'Choose the type of witness',
  helperBn: 'সাক্ষীর ধরন বাছুন', required: false, active: true, sortOrder: 60,
  options: [
    { value: 'nearby', labelEn: 'Nearby witness', labelBn: 'নিকটবর্তী সাক্ষী' },
    { value: 'traveller', labelEn: 'Traveller', labelBn: 'পথচারী' },
  ], validation: {}, config: {},
}];
const noDescription = formFields.filter((field) => field.storageKey !== 'description');
assert.ok((await admin.rpc('admin_save_reporting_form_draft', {
  p_subcategory_id: subId, p_fields: noDescription, p_notes: 'Synthetic invalid draft',
})).error, 'backend must prohibit removing description');
const badOption = formFields.map((field) => field.fieldKey === 'witness_type'
  ? { ...field, options: [{ value: 'nearby', labelEn: 'Nearby' }] } : field);
assert.ok((await admin.rpc('admin_save_reporting_form_draft', {
  p_subcategory_id: subId, p_fields: badOption, p_notes: 'Synthetic invalid choices',
})).error, 'backend must prohibit incomplete bilingual choices');

const draft = unwrap(await admin.rpc('admin_save_reporting_form_draft', {
  p_subcategory_id: subId, p_fields: formFields, p_notes: 'Synthetic seven-field form',
}), 'save bilingual form draft');
assert.equal(draft.success, true);
assert.equal(draft.fieldCount, 7);
const afterSave = unwrap(await admin.rpc('admin_get_reporting_form', { p_subcategory_id: subId }), 'read saved draft');
assert.equal(afterSave.fields.length, 7);
assert.equal(afterSave.fields.find((field) => field.fieldKey === 'witness_type')?.options[1].labelBn, 'পথচারী');
const publicConfig = async () => unwrap(await visitor.rpc('get_public_reporting_configuration'), 'public published-only taxonomy');
const newsTaxonomy = async () => unwrap(await admin.rpc('admin_get_news_intake_taxonomy'), 'News Intake taxonomy');
const visible = (config) => config.subcategories.some((row) => row.id === subId);
const formVisible = (config) => config.forms.some((row) => row.subcategoryId === subId);
assert.equal(visible(await publicConfig()), false, 'draft taxonomy hidden from Public');
assert.equal((await newsTaxonomy()).subcategories.some((row) => row.id === subId), false, 'draft hidden from News Intake');

const publishedForm = unwrap(await admin.rpc('admin_publish_reporting_form', { p_subcategory_id: subId }), 'publish staged form');
assert.equal(publishedForm.status, 'published');
assert.equal(formVisible(await publicConfig()), false, 'published form on inactive taxonomy must remain invisible');
assert.equal((await newsTaxonomy()).subcategories.some((row) => row.id === subId), false);
assert.ok((await admin.rpc('admin_publish_taxonomy_item', {
  p_item_type: 'subcategory', p_item_id: subId,
})).error, 'unpublished parent must block subcategory activation');

// Establish a published parent only in this isolated synthetic fixture.
sql("UPDATE public.segments SET config_status='published', active=true WHERE id IN ('public_safety','road_transport')");
const renamed = unwrap(await admin.rpc('admin_update_taxonomy_item', {
  p_item_type: 'subcategory', p_item_id: subId, p_name_en: 'Reviewed witness report',
  p_name_bn: 'যাচাইকৃত সাক্ষী প্রতিবেদন', p_active: false, p_sort_order: 67,
}), 'rename/reorder draft');
assert.equal(renamed.item.sort_order, 67);
const released = unwrap(await admin.rpc('admin_publish_taxonomy_item', {
  p_item_type: 'subcategory', p_item_id: subId,
}), 'publish ready subcategory');
assert.equal(released.active, true);
const activeConfig = await publicConfig();
assert.equal(visible(activeConfig), true);
assert.equal(formVisible(activeConfig), true);
const publishedFields = activeConfig.forms.find((row) => row.subcategoryId === subId)?.fields;
assert.equal(publishedFields.length, 7);
assert.deepEqual(publishedFields.find((field) => field.fieldKey === 'witness_type')?.options, formFields.at(-1).options);
assert.equal(activeConfig.subcategories.find((row) => row.id === subId)?.nameBn, 'যাচাইকৃত সাক্ষী প্রতিবেদন');
assert.equal((await newsTaxonomy()).subcategories.some((row) => row.id === subId), true);

const disabled = unwrap(await admin.rpc('admin_update_taxonomy_item', {
  p_item_type: 'subcategory', p_item_id: subId, p_name_en: 'Reviewed witness report',
  p_name_bn: 'যাচাইকৃত সাক্ষী প্রতিবেদন', p_active: false, p_sort_order: 67,
}), 'deactivate subcategory');
assert.equal(disabled.item.active, false);
assert.equal(visible(await publicConfig()), false);
assert.equal(formVisible(await publicConfig()), false);
assert.equal((await newsTaxonomy()).subcategories.some((row) => row.id === subId), false);
const restored = unwrap(await admin.rpc('admin_update_taxonomy_item', {
  p_item_type: 'subcategory', p_item_id: subId, p_name_en: 'Reviewed witness report',
  p_name_bn: 'যাচাইকৃত সাক্ষী প্রতিবেদন', p_active: true, p_sort_order: 66,
}), 'restore active category');
assert.equal(restored.item.active, true);
assert.equal(visible(await publicConfig()), true);

const moved = unwrap(await admin.rpc('admin_move_subcategory', {
  p_subcategory_id: subId, p_target_segment_id: 'road_transport', p_sort_order: 70,
}), 'move subcategory without losing form');
assert.equal(moved.moved, true);
assert.equal(visible(await publicConfig()), false, 'move must pause public reporting until reviewed');
assert.equal((await newsTaxonomy()).subcategories.some((row) => row.id === subId), false);
unwrap(await admin.rpc('admin_publish_taxonomy_item', {
  p_item_type: 'subcategory', p_item_id: subId,
}), 'republish after approved move');
assert.equal(activeConfig.forms.find((row) => row.subcategoryId === subId)?.fields.length, 7);
assert.equal((await publicConfig()).subcategories.find((row) => row.id === subId)?.segmentId, 'road_transport');
assert.equal((await newsTaxonomy()).subcategories.some((row) => row.id === subId && row.segmentId === 'road_transport'), true);

assert.ok(Number(sql(`SELECT count(*) FROM public.admin_audit_logs WHERE target_id='${subId}'`)) >= 6);
console.log('PHASE11_ISOLATED_TAXONOMY_FORM_PUBLIC_NEWS_PARITY_PASS');
