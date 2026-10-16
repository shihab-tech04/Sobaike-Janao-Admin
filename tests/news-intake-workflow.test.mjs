import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import test from 'node:test';
import {
  getManualNewsCandidates,
  getResumableNewsCandidates,
  isPublishableSourcedReportPreview,
  normalizeNewsSourcePreview,
  publishSelectedNewsCandidates,
} from '../src/services/newsIntakeWorkflow.mjs';

const candidate = (id = 'item-1', overrides = {}) => ({
  id,
  itemKind: 'article',
  action: 'created_draft',
  duplicateStatus: 'clear',
  reportId: null,
  canonicalUrl: `https://news.example/articles/${id}`,
  reviewPayload: {
    source: { canonicalUrl: `https://news.example/articles/${id}` },
    report: { titleBn: 'সিনথেটিক সংবাদ' },
  },
  ...overrides,
});

const readyPreview = {
  canCreateDraft: true,
  canPublishImmediately: true,
  schemaValidation: { ready: true },
  duplicate: { status: 'clear' },
};

test('manual selection excludes automatic runs, duplicate items, review items, and stored reports', () => {
  const manual = {
    triggerType: 'manual',
    items: [
      candidate('ready'),
      candidate('duplicate', { action: 'skip_duplicate', duplicateStatus: 'exact' }),
      candidate('review', { action: 'needs_review' }),
      candidate('stored', { reportId: 'SJ-2026-000001' }),
      candidate('bad-url', { canonicalUrl: 'https://other.example/article' }),
    ],
  };
  assert.deepEqual(getManualNewsCandidates(manual).map((item) => item.id), ['ready']);
  assert.deepEqual(getManualNewsCandidates({ ...manual, triggerType: 'automatic' }), []);
});

test('only a linked submitted draft becomes a resumable manual candidate', () => {
  const run = {
    triggerType: 'manual',
    items: [
      candidate('submitted', { reportId: 'synthetic-draft-1', reviewPayload: null }),
      candidate('published', { reportId: 'synthetic-published-1', reviewPayload: null }),
      candidate('unknown', { reportId: 'synthetic-unknown-1', reviewPayload: null }),
      candidate('duplicate', { reportId: 'synthetic-duplicate-1', duplicateStatus: 'exact', reviewPayload: null }),
    ],
  };

  assert.deepEqual(getResumableNewsCandidates(run, {
    submitted: 'submitted',
    published: 'published',
    unknown: 'unknown',
    duplicate: 'submitted',
  }).map((item) => item.id), ['submitted']);
  assert.deepEqual(getResumableNewsCandidates({ ...run, triggerType: 'automatic' }, { submitted: 'submitted' }), []);
});

test('news source preview requires approved standard HTTPS metadata', () => {
  const preview = normalizeNewsSourcePreview({
    approved: true,
    publisherName: 'Synthetic Publisher',
    sourceTitle: 'Synthetic article',
    canonicalUrl: 'https://news.example/article',
    sourcePublishedDate: '2026-10-15',
    descriptionPreview: 'A synthetic source description.',
    hostname: 'news.example',
  });
  assert.equal(preview.canonicalUrl, 'https://news.example/article');
  assert.equal(preview.descriptionPreview, 'A synthetic source description.');
  assert.equal(normalizeNewsSourcePreview({ ...preview, approved: false }), null);
  assert.equal(normalizeNewsSourcePreview({ ...preview, canonicalUrl: 'http://news.example/article' }), null);
  assert.equal(normalizeNewsSourcePreview({ ...preview, canonicalUrl: 'https://user:pass@news.example/article' }), null);
});

test('publication preflight requires source, duplicate, form, and privacy readiness', () => {
  assert.equal(isPublishableSourcedReportPreview(readyPreview), true);
  assert.equal(isPublishableSourcedReportPreview({ ...readyPreview, canPublishImmediately: false }), false);
  assert.equal(isPublishableSourcedReportPreview({ ...readyPreview, duplicate: { status: 'review' } }), false);
  assert.equal(isPublishableSourcedReportPreview({ ...readyPreview, schemaValidation: { ready: false } }), false);
  assert.equal(isPublishableSourcedReportPreview({ ...readyPreview, canCreateDraft: false }), false);
});

test('all selected items are preflighted before any report write starts', async () => {
  const events = [];
  const result = await publishSelectedNewsCandidates([candidate('one'), candidate('two')], {
    previewSourcedReport: async (payload) => { events.push(`preview:${payload.source.canonicalUrl}`); return readyPreview; },
    createSourcedReport: async (payload) => { events.push(`create:${payload.source.canonicalUrl}`); return { reportId: 'SJ-2026-000001' }; },
    completeItemReview: async (itemId) => { events.push(`review:${itemId}`); return { ready: true }; },
    publishComplaint: async (reportId) => { events.push(`publish:${reportId}`); },
  });

  assert.equal(result.published.length, 2);
  assert.equal(result.blocked.length, 0);
  assert.equal(result.writesStarted, true);
  assert.equal(events.slice(0, 2).every((event) => event.startsWith('preview:')), true);
  assert.deepEqual(events.slice(2), [
    'create:https://news.example/articles/one', 'review:one', 'publish:SJ-2026-000001',
    'create:https://news.example/articles/two', 'review:two', 'publish:SJ-2026-000001',
  ]);
});

test('a duplicate or schema hold blocks the whole selected batch before writes', async () => {
  const events = [];
  const result = await publishSelectedNewsCandidates([candidate('ready'), candidate('held')], {
    previewSourcedReport: async (payload) => {
      events.push(`preview:${payload.source.canonicalUrl}`);
      return payload.source.canonicalUrl.endsWith('/held')
        ? { ...readyPreview, duplicate: { status: 'review' } }
        : readyPreview;
    },
    createSourcedReport: async () => { events.push('create'); return { reportId: 'SJ-2026-000001' }; },
    completeItemReview: async () => { events.push('review'); return { ready: true }; },
    publishComplaint: async () => { events.push('publish'); },
  });

  assert.equal(result.writesStarted, false);
  assert.equal(result.published.length, 0);
  assert.equal(result.blocked.length, 1);
  assert.deepEqual(events.map((event) => event.startsWith('preview:') ? 'preview' : event), ['preview', 'preview']);
});

test('the report is not published when the server review result is no longer ready', async () => {
  const events = [];
  const result = await publishSelectedNewsCandidates([candidate()], {
    previewSourcedReport: async () => readyPreview,
    createSourcedReport: async () => { events.push('create'); return { reportId: 'SJ-2026-000001' }; },
    completeItemReview: async () => { events.push('review'); return { ready: false }; },
    publishComplaint: async () => { events.push('publish'); },
  });

  assert.deepEqual(events, ['create', 'review']);
  assert.equal(result.published.length, 0);
  assert.equal(result.blocked[0].reportId, 'SJ-2026-000001');
  assert.match(result.blocked[0].reason, /remains unpublished/);
});

test('report creation failure cannot proceed to review or publication', async () => {
  const events = [];
  const result = await publishSelectedNewsCandidates([candidate()], {
    previewSourcedReport: async () => readyPreview,
    createSourcedReport: async () => { events.push('create'); throw new Error('synthetic create failure'); },
    completeItemReview: async () => { events.push('review'); return { ready: true }; },
    publishComplaint: async () => { events.push('publish'); },
  });

  assert.deepEqual(events, ['create']);
  assert.equal(result.published.length, 0);
  assert.equal(result.blocked.length, 1);
  assert.equal(result.blocked[0].itemId, 'item-1');
});

test('review transport failure leaves the sourced report unpublished', async () => {
  const events = [];
  const result = await publishSelectedNewsCandidates([candidate()], {
    previewSourcedReport: async () => readyPreview,
    createSourcedReport: async () => { events.push('create'); return { reportId: 'synthetic-draft-1' }; },
    completeItemReview: async () => { events.push('review'); throw new Error('synthetic review failure'); },
    publishComplaint: async () => { events.push('publish'); },
  });

  assert.deepEqual(events, ['create', 'review']);
  assert.equal(result.published.length, 0);
  assert.equal(result.blocked.length, 1);
  assert.equal(result.blocked[0].itemId, 'item-1');
  assert.equal(events.includes('publish'), false);
});

test('publication transport failure is not counted as success and is marked uncertain', async () => {
  const events = [];
  const result = await publishSelectedNewsCandidates([candidate()], {
    previewSourcedReport: async () => readyPreview,
    createSourcedReport: async () => { events.push('create'); return { reportId: 'synthetic-draft-1' }; },
    completeItemReview: async () => { events.push('review'); return { ready: true }; },
    publishComplaint: async () => { events.push('publish'); throw new Error('synthetic publish failure'); },
  });

  assert.deepEqual(events, ['create', 'review', 'publish']);
  assert.deepEqual(result.published, []);
  assert.equal(result.blocked.length, 1);
  assert.equal(result.blocked[0].itemId, 'item-1');
  assert.equal(result.blocked[0].stage, 'publish');
  assert.equal(result.blocked[0].outcomeUnknown, true);
});

test('a database publication rejection is fail-closed and known to remain unpublished', async () => {
  const events = [];
  const result = await publishSelectedNewsCandidates([candidate()], {
    previewSourcedReport: async () => readyPreview,
    createSourcedReport: async () => { events.push('create'); return { reportId: 'synthetic-draft-1' }; },
    completeItemReview: async () => { events.push('review'); return { ready: true }; },
    publishComplaint: async () => {
      events.push('publish');
      throw Object.assign(new Error('synthetic server rejection'), { outcome: 'rejected' });
    },
  });

  assert.deepEqual(events, ['create', 'review', 'publish']);
  assert.equal(result.published.length, 0);
  assert.equal(result.blocked[0].stage, 'publish');
  assert.equal(result.blocked[0].outcomeUnknown, false);
});

test('a partially failed batch keeps confirmed publication separate from rejected publication', async () => {
  const publishedIds = [];
  let publicationAttempt = 0;
  const result = await publishSelectedNewsCandidates([candidate('published'), candidate('rejected')], {
    previewSourcedReport: async () => readyPreview,
    createSourcedReport: async (payload) => ({ reportId: `synthetic-${payload.source.canonicalUrl.split('/').at(-1)}` }),
    completeItemReview: async () => ({ ready: true }),
    publishComplaint: async (reportId) => {
      publicationAttempt += 1;
      if (publicationAttempt === 1) {
        publishedIds.push(reportId);
        return;
      }
      throw Object.assign(new Error('synthetic publication rejected'), { outcome: 'rejected' });
    },
  });

  assert.deepEqual(publishedIds, ['synthetic-published']);
  assert.deepEqual(result.published, [{ itemId: 'published', reportId: 'synthetic-published' }]);
  assert.deepEqual(result.blocked, [{
    itemId: 'rejected',
    reportId: 'synthetic-rejected',
    stage: 'publish',
    outcomeUnknown: false,
    reason: 'synthetic publication rejected',
  }]);
});

test('repeated item identifiers cannot create or publish the same selected candidate twice', async () => {
  const events = [];
  const repeated = candidate('same-item');
  const result = await publishSelectedNewsCandidates([repeated, repeated], {
    previewSourcedReport: async () => { events.push('preview'); return readyPreview; },
    createSourcedReport: async () => { events.push('create'); return { reportId: 'synthetic-report' }; },
    completeItemReview: async () => { events.push('review'); return { ready: true }; },
    publishComplaint: async () => { events.push('publish'); },
  });

  assert.deepEqual(events, ['preview', 'create', 'review', 'publish']);
  assert.equal(result.published.length, 1);
  assert.deepEqual(result.blocked, []);
});

test('a retried request is stopped by the source duplicate preflight contract', async () => {
  const sourceUrl = 'https://news.example/articles/retry';
  const events = [];
  let reportCreated = false;
  const actions = {
    previewSourcedReport: async () => {
      events.push('preview');
      return reportCreated ? { ...readyPreview, duplicate: { status: 'exact' } } : readyPreview;
    },
    createSourcedReport: async () => {
      events.push('create');
      reportCreated = true;
      return { reportId: 'synthetic-retry-report' };
    },
    completeItemReview: async () => { events.push('review'); return { ready: true }; },
    publishComplaint: async () => {
      events.push('publish');
      throw new Error('synthetic response lost after request');
    },
  };
  const item = candidate('retry-item', {
    canonicalUrl: sourceUrl,
    reviewPayload: { source: { canonicalUrl: sourceUrl }, report: { titleBn: 'সিনথেটিক সংবাদ' } },
  });

  const first = await publishSelectedNewsCandidates([item], actions);
  const second = await publishSelectedNewsCandidates([item], actions);

  assert.equal(first.blocked[0].outcomeUnknown, true);
  assert.equal(second.writesStarted, false);
  assert.equal(second.blocked.length, 1);
  assert.equal(events.filter((event) => event === 'create').length, 1);
  assert.equal(events.filter((event) => event === 'publish').length, 1);
});

test('a submitted linked draft can resume after refresh without creating a second report', async () => {
  const events = [];
  const result = await publishSelectedNewsCandidates([
    candidate('linked', { reportId: 'synthetic-draft-1', reviewPayload: null }),
  ], {
    checkExistingReport: async (url) => {
      events.push(`check:${url}`);
      return { duplicate: true, complaintId: 'synthetic-draft-1', complaintStatus: 'submitted' };
    },
    previewSourcedReport: async () => { events.push('preview'); return readyPreview; },
    createSourcedReport: async () => { events.push('create'); throw new Error('must not create a second report'); },
    completeItemReview: async (itemId, reportId) => {
      events.push(`review:${itemId}:${reportId}`);
      return { ready: true };
    },
    publishComplaint: async (reportId) => { events.push(`publish:${reportId}`); },
  });

  assert.deepEqual(events, [
    'check:https://news.example/articles/linked',
    'review:linked:synthetic-draft-1',
    'publish:synthetic-draft-1',
  ]);
  assert.deepEqual(result.published, [{ itemId: 'linked', reportId: 'synthetic-draft-1' }]);
  assert.deepEqual(result.blocked, []);
});

test('a published linked report is blocked before any retry write', async () => {
  const events = [];
  const result = await publishSelectedNewsCandidates([
    candidate('linked', { reportId: 'synthetic-report-1', reviewPayload: null }),
  ], {
    checkExistingReport: async () => {
      events.push('check');
      return { duplicate: true, complaintId: 'synthetic-report-1', complaintStatus: 'published' };
    },
    previewSourcedReport: async () => { events.push('preview'); return readyPreview; },
    createSourcedReport: async () => { events.push('create'); return { reportId: 'second-report' }; },
    completeItemReview: async () => { events.push('review'); return { ready: true }; },
    publishComplaint: async () => { events.push('publish'); },
  });

  assert.deepEqual(events, ['check']);
  assert.equal(result.writesStarted, false);
  assert.equal(result.published.length, 0);
  assert.match(result.blocked[0].reason, /no repeat publication/);
});

test('canonical URL variants rejected by the database normalization block the selected batch before writes', async () => {
  let previewCalls = 0;
  const result = await publishSelectedNewsCandidates([
    candidate('fragment', {
      canonicalUrl: 'https://news.example/articles/shared#preview',
      reviewPayload: { source: { canonicalUrl: 'https://news.example/articles/shared#preview' }, report: { titleBn: 'সিনথেটিক সংবাদ' } },
    }),
    candidate('slash', {
      canonicalUrl: 'https://news.example/articles/shared/',
      reviewPayload: { source: { canonicalUrl: 'https://news.example/articles/shared/' }, report: { titleBn: 'সিনথেটিক সংবাদ' } },
    }),
  ], {
    checkExistingReport: async () => { throw new Error('unexpected linked check'); },
    previewSourcedReport: async () => { previewCalls += 1; return readyPreview; },
    createSourcedReport: async () => ({ reportId: 'should-not-create' }),
    completeItemReview: async () => ({ ready: true }),
    publishComplaint: async () => {},
  });

  assert.equal(previewCalls, 0);
  assert.equal(result.writesStarted, false);
  assert.deepEqual(result.blocked.map((item) => item.itemId), ['fragment', 'slash']);
});

test('an ambiguous publish is not retried after refresh when the linked report is already published', async () => {
  const events = [];
  const original = candidate('ambiguous');
  const first = await publishSelectedNewsCandidates([original], {
    checkExistingReport: async () => { events.push('check'); return { duplicate: false }; },
    previewSourcedReport: async () => { events.push('preview'); return readyPreview; },
    createSourcedReport: async () => { events.push('create'); return { reportId: 'synthetic-ambiguous-1' }; },
    completeItemReview: async () => { events.push('review'); return { ready: true }; },
    publishComplaint: async () => { events.push('publish'); throw new Error('response lost after commit'); },
  });

  const linkedAfterRefresh = candidate('ambiguous', { reportId: 'synthetic-ambiguous-1', reviewPayload: null });
  assert.equal(first.blocked[0].stage, 'publish');
  assert.equal(first.blocked[0].outcomeUnknown, true);
  assert.deepEqual(getResumableNewsCandidates({ triggerType: 'manual', items: [linkedAfterRefresh] }, { ambiguous: 'published' }), []);

  const retry = await publishSelectedNewsCandidates([linkedAfterRefresh], {
    checkExistingReport: async () => {
      events.push('refresh-check');
      return { duplicate: true, complaintId: 'synthetic-ambiguous-1', complaintStatus: 'published' };
    },
    previewSourcedReport: async () => { events.push('retry-preview'); return readyPreview; },
    createSourcedReport: async () => { events.push('retry-create'); return { reportId: 'duplicate' }; },
    completeItemReview: async () => { events.push('retry-review'); return { ready: true }; },
    publishComplaint: async () => { events.push('retry-publish'); },
  });

  assert.equal(retry.writesStarted, false);
  assert.equal(retry.published.length, 0);
  assert.equal(events.includes('retry-create'), false);
  assert.equal(events.includes('retry-publish'), false);
});

test('Admin UI uses the manual scan, protected report contracts, bilingual copy, and responsive grid', async () => {
  const [api, page, routes] = await Promise.all([
    readFile(new URL('../src/services/api/recoveryApi.ts', import.meta.url), 'utf8'),
    readFile(new URL('../src/pages/NewsIntake/NewsIntakePage.tsx', import.meta.url), 'utf8'),
    readFile(new URL('../src/routes/AppRoutes.tsx', import.meta.url), 'utf8'),
  ]);
  assert.match(api, /functions\.invoke\('news-intake-scan'/);
  assert.match(api, /functions\.invoke\('news-intake-fetch'/);
  assert.match(api, /admin_preview_sourced_report_intake/);
  assert.match(api, /admin_create_sourced_report_from_intake/);
  assert.match(api, /admin_complete_news_intake_item_review/);
  assert.match(api, /async publishSourcedReport[\s\S]*supabase\.rpc\('admin_publish_complaint'/);
  assert.match(page, /recoveryApi\.publishSourcedReport/);
  assert.doesNotMatch(page, /complaintApi\.publishComplaint/);
  assert.doesNotMatch(api + page, /process_trusted_news_intake_candidate/);
  assert.match(page, /Check sources and duplicates/);
  assert.match(page, /উৎস ও ডুপ্লিকেট পরীক্ষা/);
  assert.match(page, /Raw source/);
  assert.match(page, /মূল উৎস/);
  assert.match(page, /Feed-ready preview/);
  assert.match(page, /ফিডে প্রকাশের পূর্বরূপ/);
  assert.match(page, /Report linked/);
  assert.match(page, /প্রতিবেদন যুক্ত/);
  assert.match(page, /text\(activeItem\.reportId\)/);
  assert.match(page, /grid-cols-1 gap-4 xl:grid-cols-2/);
  assert.match(page, /state === 'partial'/);
  assert.match(page, /Held reports remain unpublished/);
  assert.match(page, /state === 'unknown'/);
  assert.match(page, /could not be confirmed/);
  assert.match(page, /ফল নিশ্চিত করা যায়নি/);
  assert.match(routes, /requiredPermission="complaints\.publish"[\s\S]*<NewsIntakePage/);
});

test('recovered Admin pages localize status and error copy for Bengali mode', async () => {
  const [bannerPage, healthPage, newsPage, themeTokens] = await Promise.all([
    readFile(new URL('../src/pages/Banners/BannerCmsPage.tsx', import.meta.url), 'utf8'),
    readFile(new URL('../src/pages/SystemHealth/SystemHealthPage.tsx', import.meta.url), 'utf8'),
    readFile(new URL('../src/pages/NewsIntake/NewsIntakePage.tsx', import.meta.url), 'utf8'),
    readFile(new URL('../src/themes/tokens.ts', import.meta.url), 'utf8'),
  ]);
  assert.match(bannerPage, /bannerErrorText\(error, isBn\)/);
  assert.match(bannerPage, /হয়রানি ও নির্যাতন/);
  assert.match(healthPage, /localizedStatus\(probe\.status, language === 'bn'\)/);
  assert.match(healthPage, /স্বাভাবিক/);
  assert.match(healthPage, /অজানা/);
  assert.match(healthPage, /localizedTimestamp\(live\.collectedAt, isBn\)/);
  for (const page of [bannerPage, healthPage, newsPage]) {
    assert.match(page, /fontFamily: baseTokens\.typography\.fontFamily\.bengali/);
    assert.doesNotMatch(page, /fontFamily: '"Hind Siliguri"/);
  }
  assert.match(themeTokens, /bengali: '"Hind Siliguri"/);
});
