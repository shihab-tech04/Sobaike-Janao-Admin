import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import test from 'node:test';
import {
  normalizeBannerRows,
  normalizeNewsIntakeDashboard,
  normalizeNewsIntakeTaxonomy,
  normalizeSystemHealthPayload,
  summarizeNewsRun,
} from '../src/services/recoveryContracts.mjs';

const [api, routes, newsPage, supabaseConfig] = await Promise.all([
  readFile(new URL('../src/services/api/recoveryApi.ts', import.meta.url), 'utf8'),
  readFile(new URL('../src/routes/AppRoutes.tsx', import.meta.url), 'utf8'),
  readFile(new URL('../src/pages/NewsIntake/NewsIntakePage.tsx', import.meta.url), 'utf8'),
  readFile(new URL('../src/lib/supabase.ts', import.meta.url), 'utf8'),
]);

test('News Intake contract normalizer keeps source, run, item, and automation payloads separated', () => {
  const normalized = normalizeNewsIntakeDashboard({
    sources: [{ hostname: 'news.example' }, null],
    runs: [{ runId: 'run-1', items: [{ id: 'item-1' }, null] }, 7],
    automation: { enabled: false, intervalHours: 36 },
  });
  assert.equal(normalized.sources.length, 1);
  assert.equal(normalized.runs.length, 1);
  assert.equal(normalized.runs[0].items.length, 1);
  assert.equal(normalized.automation.enabled, false);
  assert.deepEqual(normalizeNewsIntakeTaxonomy({ segments: [{ id: 'harassment' }], subcategories: 'invalid' }), {
    segments: [{ id: 'harassment' }], subcategories: [],
  });
});

test('News Intake run summary coerces server counters and item counts safely', () => {
  assert.deepEqual(summarizeNewsRun({ items: [{}, {}], reviewCount: '2', errorCount: null, createdCount: 1, mergedCount: '3' }), {
    itemCount: 2, reviewCount: 2, errorCount: 0, createdCount: 1, mergedCount: 3,
  });
});

test('Banner CMS payload accepts only keyed rows and normalizes metadata', () => {
  const rows = normalizeBannerRows([
    { category_key: 'public_safety', draft_content: { titleEn: 'Draft' }, published_content: null, version: '8', draft_updated_at: '2026-10-15T00:00:00Z' },
    { category_key: '', draft_content: {} },
    null,
  ]);
  assert.equal(rows.length, 1);
  assert.equal(rows[0].category_key, 'public_safety');
  assert.equal(rows[0].version, 8);
  assert.deepEqual(rows[0].published_content, {});
  assert.equal(rows[0].draft_updated_at, '2026-10-15T00:00:00Z');
});

test('System Health requires a live payload before the page treats it as a successful response', () => {
  assert.equal(normalizeSystemHealthPayload({ live: { overallStatus: 'healthy' } }).live.overallStatus, 'healthy');
  assert.throws(() => normalizeSystemHealthPayload({ database: { status: 'healthy' } }), /live probe data/);
});

test('Admin recovery pages use the existing permission and server contracts', () => {
  assert.match(routes, /requiredPermission="complaints\.publish"[\s\S]*<NewsIntakePage/);
  assert.match(routes, /requiredPermission="banners\.manage"[\s\S]*<BannerCmsPage/);
  assert.match(routes, /requiredPermission="system_health\.view"[\s\S]*<SystemHealthPage/);
  assert.match(api, /admin_get_news_intake_automation_dashboard/);
  assert.match(api, /admin_get_news_intake_scan_sources/);
  assert.match(api, /admin_get_news_intake_taxonomy/);
  assert.match(api, /admin_get_site_banners/);
  assert.match(api, /p_category_key: categoryKey[\s\S]*p_content: content/);
  assert.match(api, /body: \{ mode: 'read' \}/);
  assert.doesNotMatch(newsPage, /admin_begin_news_intake_run|admin_record_news_intake_item|news-intake-scan/);
});

test('an unconfigured Admin build cannot fall back to the production Supabase project', () => {
  assert.match(supabaseConfig, /sobaike-backend-not-configured\.invalid/);
  assert.match(supabaseConfig, /recovery-preview-backend-disabled/);
  assert.doesNotMatch(supabaseConfig, /ahiaymyqfmyyrjkwgvhi\.supabase\.co|sb_publishable_/);
  assert.match(supabaseConfig, /metaEnv\?\.VITE_SUPABASE_URL\?\.trim\(\)/);
});
