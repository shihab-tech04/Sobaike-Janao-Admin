import assert from 'node:assert/strict';
import { execFileSync } from 'node:child_process';
import { createHmac, randomUUID } from 'node:crypto';
import { createClient } from '@supabase/supabase-js';

const api = process.env.RECOVERY_LOCAL_API_URL;
const db = process.env.RECOVERY_LOCAL_DB_URL;
const anonKey = process.env.RECOVERY_LOCAL_ANON_KEY;
const serviceKey = process.env.RECOVERY_LOCAL_SERVICE_ROLE_KEY;
assert.equal(new URL(api || '').hostname, '127.0.0.1');
assert.equal(new URL(api || '').port, '54321');
assert.equal(new URL(db || '').hostname, '127.0.0.1');
assert.equal(new URL(db || '').port, '54322');
assert.ok(anonKey && serviceKey && anonKey !== serviceKey);

// The only external reads use controlled, noindex, explicitly fictional HTML
// already verified live on the public recovery preview. All writes stay local.
const fixtureRoot = 'https://shihab-tech04.github.io/sobaike-janao-public-recovery-preview/qa-news';
const fixtureHome = `${fixtureRoot}/index.html`;
const fixtureArticle = `${fixtureRoot}/articles/20261019-dhaka-road-collision.html`;
const suffix = randomUUID().slice(0, 8);
const email = `news-smoke-${suffix}@recovery.invalid`;
const password = `SyntheticNews-${randomUUID()}!`;
const opts = { auth: { persistSession: false, autoRefreshToken: false } };
const service = createClient(api, serviceKey, opts);
const admin = createClient(api, anonKey, opts);
const sql = (query) => execFileSync('psql', [db, '--set', 'ON_ERROR_STOP=1',
  '--tuples-only', '--no-align', '--command', query],
{ encoding: 'utf8', stdio: 'pipe', timeout: 30_000 }).trim();
const unwrap = (r, title) => { assert.equal(r.error, null, `${title}: ${r.error?.message}`); return r.data; };

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
  const digest = createHmac('sha1', key).update(counter).digest();
  const offset = digest.at(-1) & 15;
  return String((digest.readUInt32BE(offset) & 0x7fffffff) % 1_000_000).padStart(6, '0');
}

// Prove the fixtures really are controlled fictional HTML before any Edge run.
const homepageResponse = await fetch(fixtureHome, { signal: AbortSignal.timeout(20_000) });
assert.equal(homepageResponse.status, 200);
const homepage = await homepageResponse.text();
assert.match(homepage, /noindex,nofollow/);
assert.match(homepage, /entirely fictional/i);
assert.match(homepage, /20261019-dhaka-road-collision\.html/);
const articleResponse = await fetch(fixtureArticle, { signal: AbortSignal.timeout(20_000) });
assert.equal(articleResponse.status, 200);
const articleHtml = await articleResponse.text();
assert.match(articleHtml, /TEST FIXTURE/);
assert.match(articleHtml, /"@type":"NewsArticle"/);
assert.match(articleHtml, /datePublished/);

sql(`INSERT INTO public.news_source_domains(
  hostname,publisher_name,homepage_url,active,scan_enabled,scan_priority,language_hint)
  VALUES ('shihab-tech04.github.io','Sobaike QA Fictional Publisher','${fixtureHome}',true,true,1,'en')
  ON CONFLICT (hostname) DO UPDATE SET homepage_url=excluded.homepage_url,
    active=true,scan_enabled=true,scan_priority=1,language_hint='en'`);
// Reuse the synthetic-only taxonomy created in the disposable baseline. This
// never writes to the hosted Sobaike Janao Supabase project.
sql("UPDATE public.segments SET config_status='published',active=true WHERE id='road_transport'");
sql(`INSERT INTO public.subcategories(
  id,segment_id,name_en,name_bn,active,config_status,sort_order)
  VALUES ('road-accident','road_transport','Road accident','সড়ক দুর্ঘটনা',true,'published',9)
  ON CONFLICT(id) DO UPDATE SET active=true,config_status='published'`);
sql(`WITH form_schema AS (
  INSERT INTO public.reporting_form_schemas(
    scope_type,scope_id,version,status,engine_mode,notes)
  VALUES ('subcategory','road-accident',1,'published','schema','Synthetic controlled source QA')
  RETURNING id
)
INSERT INTO public.reporting_form_schema_fields(
  schema_id,field_key,field_type,storage_mode,storage_key,label_en,label_bn,
  required,active,sort_order,options,validation,config)
SELECT id,'title','text','core_column','title','Title','শিরোনাম',true,true,10,'[]','{"maxLength":100}','{}' FROM form_schema
UNION ALL
SELECT id,'description','textarea','core_column','description','Description','বিবরণ',true,true,20,'[]','{"maxLength":2000}','{}' FROM form_schema`);

const user = unwrap(await service.auth.admin.createUser({ email, password, email_confirm: true }), 'local synthetic Auth user').user;
assert.ok(user.id);
const role = `news_smoke_${suffix}`;
sql(`INSERT INTO public.admin_users(user_id,active,is_super_admin,display_name)
  VALUES ('${user.id}',true,false,'Synthetic Source Reviewer')`);
sql(`INSERT INTO public.roles(id,name_en,name_bn,active,is_system)
  VALUES ('${role}','Synthetic News Reviewer','সংবাদ পরীক্ষক',true,false)`);
sql(`INSERT INTO public.role_permissions(role_id,permission_id)
  VALUES ('${role}','complaints.publish')`);
sql(`INSERT INTO public.user_roles(user_id,role_id) VALUES ('${user.id}','${role}')`);

unwrap(await admin.auth.signInWithPassword({ email, password }), 'local News Intake reviewer sign-in');
const factors = unwrap(await admin.auth.mfa.enroll({ factorType: 'totp' }), 'reviewer TOTP enrollment');
unwrap(await admin.auth.mfa.challengeAndVerify({ factorId: factors.id, code: totp(factors.totp.secret) }), 'reviewer AAL2');
assert.equal(unwrap(await admin.auth.mfa.getAuthenticatorAssuranceLevel(), 'assurance').currentLevel, 'aal2');
const session = unwrap(await admin.auth.getSession(), 'authorized session').session;
assert.ok(session.access_token);

const edgeCall = async (slug, body) => {
  const response = await fetch(`${api}/functions/v1/${slug}`, {
    method: 'POST',
    headers: { apikey: anonKey, Authorization: `Bearer ${session.access_token}`,
      'content-type': 'application/json', Origin: 'http://localhost:3000' },
    body: JSON.stringify(body), signal: AbortSignal.timeout(180_000),
  });
  const payload = await response.json();
  assert.equal(response.status, 200, `${slug} returned ${response.status}: ${JSON.stringify(payload).slice(0, 1000)}`);
  return payload;
};

const preview = await edgeCall('news-intake-fetch', { url: fixtureArticle });
assert.equal(preview.approved, true);
assert.equal(preview.sourcePublishedDate, '2026-10-19');
assert.equal(preview.canonicalUrl, fixtureArticle);
assert.match(preview.sourceTitle, /Dhaka road collision/i);

const first = await edgeCall('news-intake-scan', {});
assert.ok(first.runId, 'first manual scan must create a review run');
assert.notEqual(first.status, 'failed');
const firstRows = sql(`SELECT action||':'||coalesce(duplicate_status,'none')||':'||
  CASE WHEN review_payload IS NULL THEN 'no_payload' ELSE 'payload' END
  FROM public.news_intake_run_items WHERE run_id='${first.runId}' AND item_kind='article'
  ORDER BY created_at`);
assert.match(firstRows, /created_draft:clear:payload/,
  `controlled final article did not become a complete private review candidate: ${firstRows || 'no article rows'}`);
assert.equal(Number(sql("SELECT count(*) FROM public.complaints WHERE origin_type='sourced_report'")), 0,
  'automatic and manual scans must not create or publish sourced reports');

const second = await edgeCall('news-intake-scan', {});
assert.ok(second.runId && second.runId !== first.runId);
const secondRows = sql(`SELECT action||':'||coalesce(duplicate_status,'none')
  FROM public.news_intake_run_items WHERE run_id='${second.runId}' AND item_kind='article'`);
assert.match(secondRows, /skip_duplicate:exact/, 'repeat scan must deduplicate the existing review candidate');
assert.equal(Number(sql("SELECT count(*) FROM public.complaints WHERE origin_type='sourced_report'")), 0);
assert.ok(Number(sql(`SELECT count(*) FROM public.admin_audit_logs WHERE target_id IN ('${first.runId}','${second.runId}')`)) >= 4);

console.log('PHASE12_CONTROLLED_HTTPS_ARTICLE_EDGE_TO_PRIVATE_REVIEW_AND_CROSS_RUN_DEDUPE_PASS');
