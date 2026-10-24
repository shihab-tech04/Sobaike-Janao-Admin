import assert from 'node:assert/strict';

// Phase17 A02: reuses the real delegated AAL2 Admin Chromium session.
// SQL fixture is exclusively disposable localhost; no production DB interaction.
export async function runPhase17A02({
  page, browserBaseUrl, getSqlSnapshot, setRecentReadGrant,
}) {
  assert.equal(new URL(browserBaseUrl).origin, 'http://127.0.0.1:4173');
  assert.equal(typeof getSqlSnapshot, 'function');
  assert.equal(typeof setRecentReadGrant, 'function');
  const origin = browserBaseUrl.replace(/\/$/, '');
  const goto = path => page.goto(origin + '/#' + path, { waitUntil: 'domcontentloaded' });
  const waitHash = hash => page.waitForURL(url => url.hash === hash, { timeout: 45_000 });
  const metrics = page.locator('section[aria-label="Operational Key Metrics"]');
  const recent = page.locator('section[aria-label="Recent Citizen Reports"]');
  const expected = () => {
    const v = getSqlSnapshot();
    return ['total','submitted','published','unpublished','rejected'].map(k => Number(v[k]));
  };
  const values = async () => {
    await metrics.locator('.font-mono').first().waitFor({ state: 'visible' });
    return (await metrics.locator('.font-mono').allTextContents())
      .map(x => Number(x.trim().replaceAll(',', '')));
  };
  const requestEvents = [];
  const listener = req => {
    if (req.url().includes('/rpc/admin_get_dashboard_aggregates')) {
      requestEvents.push(req.url());
    }
  };
  page.on('request', listener);

  try {
    await page.setViewportSize({ width: 1280, height: 850 });
    await goto('/dashboard');
    await waitHash('#/dashboard');
    assert.deepEqual(await values(), expected(), 'Dashboard KPI cards must match actual isolated SQL status totals');
    assert.equal(await metrics.locator('.font-mono').count(), 5);
    await page.locator('section[aria-label="Distribution Breakdown"]').waitFor({ state: 'visible' });
    await recent.waitFor({ state: 'visible' });
    await recent.getByText('Recent Reports', { exact: true }).waitFor({ state: 'visible' });
    await recent.getByRole('button', { name: 'Review', exact: true }).first().waitFor({ state: 'visible' });
    assert.ok(requestEvents.length > 0, 'Dashboard aggregates must originate from guarded RPC, not mock KPI values');
    console.log('PHASE17_A02_SQL_AGGREGATE_KPI_STATUS_AND_RECENT_REPORT_PARITY_PASS');

    const beforeRefresh = requestEvents.length;
    const refresh = page.getByRole('button', { name: 'Refresh', exact: true });
    await refresh.click();
    await page.waitForFunction(n => performance.getEntriesByType('resource')
      .filter(e => e.name.includes('/rpc/admin_get_dashboard_aggregates')).length >= n,
      beforeRefresh + 1, { timeout: 30000 });
    assert.deepEqual(await values(), expected(), 'Manual dashboard refresh must preserve SQL-authoritative KPI values');
    assert.ok(requestEvents.length > beforeRefresh, 'Refresh must trigger a new aggregate RPC');
    console.log('PHASE17_A02_MANUAL_REFRESH_AGGREGATE_RPC_PASS');

    await recent.getByRole('button', { name: 'View All Complaints' }).click();
    await waitHash('#/complaints');
    await page.getByRole('textbox', { name: 'Search Complaints', exact: true }).waitFor({ state: 'visible' });
    await goto('/dashboard');
    await recent.waitFor({ state: 'visible' });
    await recent.getByRole('button', { name: 'Review', exact: true }).first().click();
    await page.waitForURL(url => /^#\/complaints\/SYNTH-/.test(url.hash), { timeout: 45000 });
    await page.getByText(/Complaint Inspection:/).first().waitFor({ state: 'visible' });
    console.log('PHASE17_A02_ALL_COMPLAINTS_AND_RECENT_REVIEW_DRILLDOWN_PASS');

    await page.setViewportSize({ width: 390, height: 844 });
    await goto('/dashboard');
    assert.deepEqual(await values(), expected());
    await recent.waitFor({ state: 'visible' });
    const measure = await page.evaluate(() => ({
      total: document.documentElement.scrollWidth,
      viewport: window.innerWidth,
    }));
    assert.ok(measure.total <= measure.viewport + 2,
      'Mobile Dashboard must not cause document-level horizontal overflow');
    console.log('PHASE17_A02_MOBILE_DASHBOARD_METRICS_NO_OVERFLOW_PASS');

    // Negative isolation case: a delegated AAL2 identity with only
    // dashboard.view must receive aggregates but not direct complaint rows.
    setRecentReadGrant(false);
    try {
      await page.reload({ waitUntil: 'domcontentloaded' });
      await metrics.locator('.font-mono').first().waitFor({ state: 'visible' });
      assert.deepEqual(await values(), expected(), 'Dashboard-only role must retain aggregate access');
      assert.equal(await recent.count(), 0,
        'Dashboard-only role must not render private recent complaint rows');
      console.log('PHASE17_A02_DASHBOARD_ONLY_ROLE_NO_PRIVATE_ROWS_PASS');
    } finally {
      setRecentReadGrant(true);
    }
  } finally {
    page.off('request', listener);
  }
}
