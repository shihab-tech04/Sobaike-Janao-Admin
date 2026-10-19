import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import 'tsx/esm';

const core = await import('../supabase/functions/_shared/newsIntakeAutomationCore.ts');
const read = (p) => readFileSync(new URL(`../${p}`, import.meta.url), 'utf8');
const scan = read('supabase/functions/news-intake-scan/index.ts');
const fetcher = read('supabase/functions/news-intake-fetch/index.ts');
const migration = read('supabase/migrations/20261019000200_news_intake_explicit_review_only.sql');
const sql = read('test-only/current_contract_baseline.sql');

test('manual AND scheduled News Intake stay review-only at both Edge and SQL layers', () => {
  assert.doesNotMatch(scan, /supabase\.rpc\(\s*['"]process_trusted_news_intake_candidate['"]/);
  assert.match(scan, /Both manual and ~36h scheduled scans stop at a review candidate/);
  assert.match(scan, /action:'created_draft'/);
  assert.match(scan, /reviewPayload:payload/);
  assert.match(scan, /admin_check_news_intake_candidate_duplicate/);
  assert.match(migration, /Automatic sourced-report publication is disabled/);
  assert.match(migration, /REVOKE ALL ON FUNCTION public\.process_trusted_news_intake_candidate/);
  assert.match(migration, /admin_check_news_intake_candidate_duplicate/);
  assert.match(migration, /interval '7 days'/);
  assert.match(sql, /next_auto_due_at=v_slot\+interval '36 hours'/);
  assert.match(sql, /interval_hours = 36/);
});

test('controlled synthetic article classifies without inventing extra facts', () => {
  const article = 'Two buses collided on a road in Dhaka on Monday, injuring three passengers in a road accident near a local market. Witnesses described the crash after a bus lost control and struck another vehicle. Emergency responders carried the injured people to a hospital for treatment.';
  assert.deepEqual(core.classifyArticle(article), {
    segmentId: 'road_transport', subcategoryId: 'road-accident', confidence: 0.91,
  });
  assert.equal(core.isSubstantiveIncidentContext('Dhaka road accident injures three', article), true);
  assert.equal(core.isLegalFollowUpOnly('Court hearing for a robbery case in Dhaka'), true);
  assert.equal(core.isMultiIncidentArticle('Three separate road accidents reported in different districts'), true);
  assert.equal(core.isFactCheckOrMisinformationStory('Fact-check: viral image makes a misleading claim'), true);
  assert.equal(core.isUnsupportedArticleType('https://trusted.example/opinion/editorial', 'Opinion'), true);
  assert.equal(core.detectLanguage('ঢাকায় সড়ক দুর্ঘটনায় তিনজন আহত হয়েছেন এবং তাঁদের চিকিৎসা চলছে।'), 'bn');
});

test('safe fetching validates approved HTTPS host, DNS public addresses, redirects and article content', () => {
  for (const handler of [scan, fetcher]) {
    assert.match(handler, /Deno\.resolveDns/);
    assert.match(handler, /isPrivateOrReservedIp/);
    assert.match(handler, /redirect:'manual'|redirect: "manual"/);
    assert.match(handler, /\.protocol\s*!==\s*['"]https:/);
    assert.match(handler, /\.approved/);
    assert.match(handler, /content-type/);
    assert.match(handler, /AbortSignal\.timeout/);
  }
  assert.match(scan, /extractArticleLinks\(fetched\.html,fetched\.finalUrl\)/);
  assert.match(scan, /extractArticle\(fetched\.html,fetched\.finalUrl/);
  assert.match(scan, /sourceTextLength\(context\)<400/);
  assert.match(scan, /articleDocumentSignal/);
  assert.match(scan, /MAX_TOTAL_ARTICLES/);
});
