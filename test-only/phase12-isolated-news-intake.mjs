import assert from 'node:assert/strict';
import { execFileSync } from 'node:child_process';
import { randomUUID } from 'node:crypto';
import { createClient } from '@supabase/supabase-js';

const api = process.env.RECOVERY_LOCAL_API_URL;
const db = process.env.RECOVERY_LOCAL_DB_URL;
const anonKey = process.env.RECOVERY_LOCAL_ANON_KEY;
const serviceKey = process.env.RECOVERY_LOCAL_SERVICE_ROLE_KEY;
const apiTarget = new URL(api || '');
const dbTarget = new URL(db || '');
assert.equal(`${apiTarget.protocol}//${apiTarget.hostname}:${apiTarget.port}`, 'http://127.0.0.1:54321');
assert.equal(dbTarget.hostname, '127.0.0.1');
assert.equal(dbTarget.port, '54322');
assert.ok(['postgres:', 'postgresql:'].includes(dbTarget.protocol));
assert.ok(anonKey && serviceKey && anonKey !== serviceKey);

const opts = { auth: { persistSession: false, autoRefreshToken: false } };
const anon = createClient(api, anonKey, opts);
const service = createClient(api, serviceKey, opts);
const suffix = randomUUID().slice(0, 8);
const sourceHostname = `trusted-${suffix}.recovery.example`;
const articleUrl = `https://${sourceHostname}/article/synthetic-${suffix}`;
const sql = (statement) => execFileSync('psql', [db, '--set', 'ON_ERROR_STOP=1',
  '--tuples-only', '--no-align', '--command', statement],
{ encoding: 'utf8', stdio: 'pipe', timeout: 25_000 }).trim();
const unwrap = (r, title) => { assert.equal(r.error, null, `${title}: ${r.error?.message}`); return r.data; };

assert.ok((await anon.rpc('process_trusted_news_intake_candidate', { p_payload: {} })).error,
  'anonymous must not invoke legacy auto-publication');
const autoPublish = await service.rpc('process_trusted_news_intake_candidate', { p_payload: {} });
assert.ok(autoPublish.error, 'even service credentials cannot use the legacy auto-publication entry point');
assert.ok(['42501', 'PGRST202', 'PGRST301'].includes(autoPublish.error.code), autoPublish.error.message);
assert.ok((await anon.rpc('admin_check_news_intake_candidate_duplicate', { p_canonical_url: articleUrl })).error,
  'anonymous users must not inspect private source candidates');

// Only locally controlled registry metadata is inserted. No external domain
// is contacted and no complaint, report, or real source article is created.
sql(`INSERT INTO public.news_source_domains(
  hostname,publisher_name,active,scan_enabled,homepage_url,language_hint,scan_priority)
  VALUES ('${sourceHostname}','Synthetic verified publisher',true,true,
  'https://${sourceHostname}/index','en',10)`);
sql(`INSERT INTO public.news_intake_automation_settings(
  singleton,enabled,interval_hours,next_auto_due_at)
  VALUES (true,true,36,now()-interval '1 minute')
  ON CONFLICT (singleton) DO UPDATE SET enabled=true,interval_hours=36,next_auto_due_at=now()-interval '1 minute'`);

const domain = unwrap(await service.rpc('admin_check_news_source_domain', { p_url: articleUrl }), 'approved source registry');
assert.equal(domain.approved, true);
assert.equal(domain.publisherName, 'Synthetic verified publisher');
assert.equal(unwrap(await service.rpc('admin_check_news_source_domain', {
  p_url: 'https://unapproved.recovery.example/article/123',
}), 'unapproved source').approved, false);
assert.ok((await service.rpc('admin_check_news_intake_candidate_duplicate', {
  p_canonical_url: 'http://127.0.0.1/internal',
})).error, 'duplicate resolver only accepts final HTTPS article URLs');
assert.equal(unwrap(await service.rpc('admin_check_news_intake_candidate_duplicate', {
  p_canonical_url: articleUrl,
}), 'candidate check before scan').duplicate, false);

const slot = new Date().toISOString();
assert.ok((await anon.rpc('service_begin_scheduled_news_intake_run', { p_scheduled_slot: slot })).error,
  'anonymous users must not start the scheduler');
const run = unwrap(await service.rpc('service_begin_scheduled_news_intake_run', {
  p_scheduled_slot: slot,
}), '36h scheduler dispatch');
assert.equal(run.accepted, true);
assert.equal(run.triggerType, 'automatic');
assert.equal(run.sourceCount, 1);
assert.ok(run.runId);
const nextDue = new Date(run.nextAutoDueAt);
const nextIntervalHours = (nextDue.getTime() - new Date(run.scheduledSlot).getTime()) / 3600000;
assert.equal(nextIntervalHours, 36, 'scheduled scan may recur only after 36h');
const secondDispatch = unwrap(await service.rpc('service_begin_scheduled_news_intake_run', {
  p_scheduled_slot: slot,
}), 'duplicate scheduled slot');
assert.equal(secondDispatch.accepted, false);
assert.equal(secondDispatch.notDue, true);

const candidate = {
  itemKind: 'article', sourceHostname, publisherName: 'Synthetic verified publisher',
  canonicalUrl: articleUrl, sourceTitle: 'Synthetic safety event',
  sourcePublishedDate: '2026-10-19', contentLanguage: 'en',
  action: 'created_draft', duplicateStatus: 'clear', reportId: null,
  reason: 'Synthetic controlled source; explicit review required.',
  reviewPayload: {
    source: { canonicalUrl: articleUrl, publisherName: 'Synthetic verified publisher', sourceType: 'news' },
    report: { segmentId: 'public_safety', subcategoryId: 'synthetic-only', titleEn: 'Synthetic', descriptionEn: 'Not a real event' },
  },
};
const stored = unwrap(await service.rpc('admin_record_news_intake_item', {
  p_run_id: run.runId, p_item: candidate,
}), 'create draft-only synthetic review candidate');
assert.ok(stored.id);
const duplicate = unwrap(await service.rpc('admin_check_news_intake_candidate_duplicate', {
  p_canonical_url: `${articleUrl}/#section`,
}), 'normalized URL dedupe across runs');
assert.equal(duplicate.duplicate, true);
assert.equal(duplicate.runItemId, stored.id);
assert.equal(duplicate.linkedReportId, null);

const finished = unwrap(await service.rpc('admin_finish_news_intake_run', {
  p_run_id: run.runId, p_status: 'completed', p_error: null,
}), 'finish background draft-only run');
assert.ok(finished);
const saved = sql(`SELECT action||':'||coalesce(report_id,'null')||':'||
  CASE WHEN review_payload IS NULL THEN 'missing' ELSE 'review' END
  FROM public.news_intake_run_items WHERE id='${stored.id}'`);
assert.equal(saved, 'created_draft:null:review');
assert.equal(Number(sql(`SELECT count(*) FROM public.complaints WHERE origin_type='sourced_report'`)), 0,
  'no sourced complaint may be created or published by the scheduler');
assert.equal(unwrap(await service.rpc('admin_check_news_intake_candidate_duplicate', {
  p_canonical_url: articleUrl,
}), 'candidate dedupe after run completion').duplicate, true);
sql("UPDATE public.news_intake_automation_settings SET enabled=false,next_auto_due_at=now()-interval '1 minute' WHERE singleton=true");
const disabled = unwrap(await service.rpc('service_begin_scheduled_news_intake_run', {
  p_scheduled_slot: new Date().toISOString(),
}), 'disabled scheduling');
assert.equal(disabled.accepted, false);
assert.equal(disabled.disabled, true);
// Keep the wholly fictional .example registry entry for audit evidence but do
// not let the subsequent real HTTPS smoke attempt to fetch it.
sql(`UPDATE public.news_source_domains SET scan_enabled=false WHERE hostname='${sourceHostname}'`);

console.log('PHASE12_REVIEW_ONLY_SCHEDULER_DOMAIN_DEDUPE_AND_NO_PUBLICATION_PASS');
