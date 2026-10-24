import assert from 'node:assert/strict';

// Phase 17 A06: browser exercises the *actual* Admin reviewer under a real
// disposable AAL2 moderator. Synthetic News Intake RPC reads, source-fetch,
// and failure responses are intercepted only in this loopback browser.
// Never fetch news sites, create real reports or publish citizen content.
export async function runPhase17A06({ page, browserBaseUrl, readSourcedReportCount }) {
  assert.equal(new URL(browserBaseUrl).origin, 'http://127.0.0.1:4173');
  assert.equal(typeof readSourcedReportCount, 'function');
  const before = readSourcedReportCount();
  let scanComplete = false;
  let scanRequests = 0;
  const preventedWrites = [];
  const observedReads = [];

  const candidate = (id, name, opts = {}) => {
    const canonicalUrl = 'https://approved-fictional-news.example/article/' + id;
    return {
      id, itemKind: 'article',
      publisherName: 'Synthetic Reviewed Publisher',
      sourceHostname: 'approved-fictional-news.example',
      canonicalUrl,
      sourceTitle: name, sourcePublishedDate: '2026-10-24',
      contentLanguage: 'en', action: 'created_draft',
      duplicateStatus: 'clear', reportId: null,
      reviewPayload: {
        source: { canonicalUrl, publisherName: 'Synthetic Reviewed Publisher', sourceType: 'news' },
        report: {
          segmentId: 'public_safety', subcategoryId: 'synthetic-public-safety',
          titleEn: name, titleBn: 'পরীক্ষামূলক সংবাদ',
          descriptionEn: 'A fictional, isolated QA article. Not a real incident.',
          descriptionBn: 'শুধুমাত্র পরীক্ষার জন্য।',
          district: 'Dhaka', incidentDate: '2026-10-24',
        },
      }, ...opts,
    };
  };
  const ready = candidate('ready', 'A06 ready synthetic article');
  const held = candidate('held', 'A06 held synthetic article');
  const duplicate = candidate('duplicate', 'A06 duplicate synthetic article', {
    action: 'skip_duplicate', duplicateStatus: 'exact', reviewPayload: null,
    reason: 'Duplicate canonical source URL; blocked for publication',
  });
  const resumable = candidate('resumable', 'A06 resumable draft synthetic article', {
    reportId: 'SYNTH-RESUMABLE-DRAFT', reviewPayload: null,
  });
  const alreadyPublished = candidate('published', 'A06 already published synthetic article', {
    reportId: 'SYNTH-ALREADY-PUBLISHED', reviewPayload: null,
  });
  const failures = [
    { id: 'source-tbs403', itemKind: 'source', action: 'error', sourceHostname: 'www.tbsnews.net',
      reason: 'HTTP 403: synthetic access-denied source response' },
    { id: 'source-dailystar403', itemKind: 'source', action: 'error', sourceHostname: 'www.thedailystar.net',
      reason: 'HTTP 403: synthetic access-denied source response' },
  ];
  const dashboard = {
    sources: [], automation: { enabled: false, intervalHours: 36, running: false },
    runs: scanComplete ? [{
      runId: 'A06-SYNTH-MANUAL-RUN', triggerType: 'manual', status: 'completed',
      startedAt: '2026-10-24T02:00:00.000Z', sourceCount: 4,
      errorCount: 2, reviewCount: 3,
      items: [ready, held, duplicate, resumable, alreadyPublished, ...failures],
    }] : [],
  };

  const respond = (route, data, status = 200) => route.fulfill({
    status, contentType: 'application/json', body: JSON.stringify(data),
    headers: { 'Access-Control-Allow-Origin': '*', 'Content-Type': 'application/json' },
  });
  const interceptor = async route => {
    const req = route.request();
    const u = new URL(req.url());
    if (u.hostname !== '127.0.0.1') {
      await route.continue(); // the existing outer browser guard blocks external traffic
      return;
    }
    const p = u.pathname;
    if (p.endsWith('/rpc/admin_get_news_intake_automation_dashboard')) {
      observedReads.push('dashboard'); await respond(route, dashboard); return;
    }
    if (p.endsWith('/rpc/admin_get_news_intake_scan_sources')) {
      observedReads.push('sources'); await respond(route, []); return;
    }
    if (p.endsWith('/rpc/admin_get_news_intake_taxonomy')) {
      observedReads.push('taxonomy'); await respond(route, {
        segments: [{ id: 'public_safety', nameEn: 'Public Safety', nameBn: 'জননিরাপত্তা', order: 1 }],
        subcategories: [{
          id: 'synthetic-public-safety', segmentId: 'public_safety',
          nameEn: 'Synthetic Safety', nameBn: 'পরীক্ষামূলক নিরাপত্তা', order: 1,
        }],
      }); return;
    }
    if (p.endsWith('/functions/v1/news-intake-scan')) {
      scanRequests++;
      scanComplete = true;
      await respond(route, { runId: 'A06-SYNTH-MANUAL-RUN', alreadyRunning: false }); return;
    }
    if (p.endsWith('/functions/v1/news-intake-fetch')) {
      const body = JSON.parse(req.postData() || '{}');
      const source = [ready, held, duplicate, resumable, alreadyPublished]
        .find(x => x.canonicalUrl === body.url);
      assert.ok(source, 'only invented approved HTTPS article previews are supported');
      await respond(route, {
        approved: true, canonicalUrl: source.canonicalUrl,
        publisherName: source.publisherName, sourceTitle: source.sourceTitle,
        sourcePublishedDate: source.sourcePublishedDate,
        descriptionPreview: 'Isolated synthetic source preview, never a real article.',
      }); return;
    }
    if (p.endsWith('/rpc/admin_check_source_duplicate')) {
      const body = JSON.parse(req.postData() || '{}');
      const url = body.p_canonical_url;
      const link = [resumable, alreadyPublished].find(x => x.canonicalUrl === url);
      await respond(route, link
        ? { duplicate: true, complaintId: link.reportId,
          complaintStatus: link === resumable ? 'submitted' : 'published' }
        : { duplicate: false }); return;
    }
    if (p.endsWith('/rpc/admin_preview_sourced_report_intake')) {
      const body = JSON.parse(req.postData() || '{}');
      const url = body?.p_payload?.source?.canonicalUrl || '';
      const isHeld = url === held.canonicalUrl;
      await respond(route, {
        canCreateDraft: true, canPublishImmediately: !isHeld,
        duplicate: { status: 'clear' },
        schemaValidation: { ready: !isHeld },
      }); return;
    }
    if (/\/rpc\/admin_(?:create_sourced_report_from_intake|complete_news_intake_item_review|publish_complaint)$/.test(p)) {
      preventedWrites.push(p);
      // Known synthetic failed publication path. The request never reaches SQL.
      if (p.endsWith('/admin_complete_news_intake_item_review')) {
        await respond(route, { ready: true }); return;
      }
      await respond(route, { code: 'PGRST500', message: 'Synthetic uncertain transport outcome' }, 503);
      return;
    }
    await route.continue();
  };

  await page.route('**/*', interceptor);
  try {
    await page.setViewportSize({ width: 1280, height: 850 });
    const origin = browserBaseUrl.replace(/\/$/, '');
    const goto = path => page.goto(origin + '/#' + path, { waitUntil: 'domcontentloaded' });
    await goto('/news-intake');
    await page.getByText('No manual source check has been run yet.').waitFor({ state: 'visible' });
    assert.equal(await page.getByRole('checkbox').count(), 0);
    await page.getByRole('button', { name: 'Check sources and duplicates' }).click();
    await page.getByRole('region', { name: 'Source scan errors' }).waitFor({ state: 'visible' });
    assert.equal(scanRequests, 1);
    await page.getByText('www.tbsnews.net', { exact: true }).waitFor({ state: 'visible' });
    await page.getByText('www.thedailystar.net', { exact: true }).waitFor({ state: 'visible' });
    assert.ok(observedReads.includes('dashboard') && observedReads.includes('sources') && observedReads.includes('taxonomy'));
    assert.equal(readSourcedReportCount(), before);
    console.log('PHASE17_A06_MANUAL_SCAN_PARTIAL_HTTP403_REVIEWABLE_PASS');

    const checkReady = page.getByRole('checkbox', { name: 'Select ' + ready.sourceTitle });
    const checkHeld = page.getByRole('checkbox', { name: 'Select ' + held.sourceTitle });
    const checkDuplicate = page.getByRole('checkbox', { name: 'Select ' + duplicate.sourceTitle });
    const checkResume = page.getByRole('checkbox', { name: 'Select ' + resumable.sourceTitle });
    const checkPublished = page.getByRole('checkbox', { name: 'Select ' + alreadyPublished.sourceTitle });
    assert.equal(await checkDuplicate.isDisabled(), true);
    assert.equal(await checkPublished.isDisabled(), true);
    assert.equal(await checkReady.isDisabled(), false);
    assert.equal(await checkHeld.isDisabled(), false);
    assert.equal(await checkResume.isDisabled(), false);
    await page.getByRole('button', { name: 'Select All' }).click();
    assert.equal(await checkReady.isChecked(), true);
    assert.equal(await checkHeld.isChecked(), true);
    assert.equal(await checkResume.isChecked(), true);
    assert.equal(await checkDuplicate.isChecked(), false);
    assert.equal(await checkPublished.isChecked(), false);
    await page.getByText('Ready to publish', { exact: true }).first().waitFor({ state: 'visible' });
    await page.getByText('Isolated synthetic source preview, never a real article.').waitFor({ state: 'visible' });
    console.log('PHASE17_A06_SELECT_ALL_EXCLUDES_DUPLICATES_AND_SOURCE_PREVIEW_PASS');

    await page.getByRole('button', { name: 'Clear', exact: true }).click();
    assert.equal(await checkReady.isChecked(), false);
    assert.equal(await checkHeld.isChecked(), false);
    assert.equal(await checkResume.isChecked(), false);
    await page.getByRole('button', { name: held.sourceTitle }).click();
    await page.getByText('Form review needed').waitFor({ state: 'visible' });
    await page.getByRole('button', { name: resumable.sourceTitle }).click();
    await page.getByText(/A submitted draft is linked to this source/).waitFor({ state: 'visible' });
    console.log('PHASE17_A06_CLEAR_HOLD_PREVIEW_RESUMABLE_DRAFT_PASS');

    await page.getByRole('button', { name: 'Select All' }).click();
    await page.getByRole('button', { name: 'Publish selected' }).click();
    await page.getByRole('status').filter({ hasText: /No reports were published/ }).waitFor({ state: 'visible' });
    assert.equal(preventedWrites.length, 0, 'Batch preflight hold must start zero write RPCs');
    assert.equal(readSourcedReportCount(), before);
    console.log('PHASE17_A06_BATCH_PREFLIGHT_HOLD_ZERO_WRITES_PASS');

    await page.getByRole('button', { name: 'Clear', exact: true }).click();
    await checkResume.check();
    await page.getByRole('button', { name: 'Publish selected' }).click();
    await page.getByRole('status').filter({ hasText: /could not be confirmed/ }).waitFor({ state: 'visible' });
    assert.deepEqual(preventedWrites, [
      '/rest/v1/rpc/admin_complete_news_intake_item_review',
      '/rest/v1/rpc/admin_publish_complaint',
    ], 'Resumable draft must reuse the existing report; publish failure must not create another');
    assert.equal(readSourcedReportCount(), before, 'All synthetic failure writes must be intercepted');
    console.log('PHASE17_A06_RESUMABLE_PUBLISH_FAILURE_UNCERTAIN_NO_DUPLICATE_PASS');

    await page.getByRole('button', { name: 'Refresh', exact: true }).click();
    await page.getByRole('checkbox', { name: 'Select ' + resumable.sourceTitle }).waitFor({ state: 'visible' });
    assert.equal(await checkResume.isDisabled(), false);
    assert.equal(readSourcedReportCount(), before);
    console.log('PHASE17_A06_REVIEW_DRAFT_RECOVERY_AFTER_REFRESH_PASS');
    console.log('PHASE17_A06_REAL_REVIEWER_UI_SYNTHETIC_FAILURE_CONTRACT_PASS');
  } finally {
    await page.unroute('**/*', interceptor);
  }
}
