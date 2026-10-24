import assert from 'node:assert/strict';
import { createHmac } from 'node:crypto';
import { chromium } from 'playwright';

// Phase17 A03: genuine React queue/detail UI backed by disposable localhost SQL.
// No hosted DB, private evidence, citizen profiles or production mutations.
export async function runPhase17A03({
  apiUrl, browserBaseUrl, email, password, totpSecret,
  inspectionId, otherId, readStatus,
}) {
  assert.equal(new URL(apiUrl).origin, 'http://127.0.0.1:54321');
  assert.equal(new URL(browserBaseUrl).origin, 'http://127.0.0.1:4173');
  assert.match(email, /@recovery\.invalid$/);
  assert.ok(password?.length >= 16 && totpSecret?.length > 15);
  for (const id of [inspectionId, otherId]) {
    assert.match(id, /^SYNTH-(?:MOD|REJ|UIPUB|UIREJ)-[A-F0-9]{8}$/);
  }

  function otp(secret) {
    const alphabet = 'ABCDEFGHIJKLMNOPQRSTUVWXYZ234567';
    let bits = '';
    for (const char of secret.toUpperCase().replace(/=|\s/g, '')) {
      const index = alphabet.indexOf(char);
      assert.ok(index >= 0);
      bits += index.toString(2).padStart(5, '0');
    }
    const key = Buffer.from(Array.from(
      { length: Math.floor(bits.length / 8) },
      (_, i) => parseInt(bits.slice(i * 8, i * 8 + 8), 2),
    ));
    const counter = Buffer.alloc(8);
    counter.writeBigUInt64BE(BigInt(Math.floor(Date.now() / 30000)));
    const mac = createHmac('sha1', key).update(counter).digest();
    const offset = mac[mac.length - 1] & 15;
    return String((mac.readUInt32BE(offset) & 0x7fffffff) % 1_000_000).padStart(6, '0');
  }

  const browser = await chromium.launch({ headless: true });
  const ctx = await browser.newContext({ viewport: { width: 1280, height: 850 }, reducedMotion: 'reduce' });
  const page = await ctx.newPage();
  page.setDefaultTimeout(30_000);
  const blockedHosts = new Set();
  const reporterGpsRequests = [];
  const evidenceRequests = [];
  const mutationRequests = [];
  await page.route('**/*', async route => {
    const u = new URL(route.request().url());
    if (u.hostname && u.hostname !== '127.0.0.1') {
      blockedHosts.add(u.hostname);
      await route.abort('blockedbyclient');
      return;
    }
    if (u.pathname.includes('admin_get_complaint_reporter_location')) reporterGpsRequests.push(u.pathname);
    if (u.pathname.includes('admin_get_complaint_evidence')) evidenceRequests.push(u.pathname);
    if (/\/rpc\/admin_(publish|unpublish|reject|edit)_complaint/.test(u.pathname)) {
      mutationRequests.push(u.pathname);
    }
    await route.continue();
  });
  const origin = browserBaseUrl.replace(/\/$/, '');
  const goto = path => page.goto(origin + '/#' + path, { waitUntil: 'domcontentloaded' });
  const waitHash = hash => page.waitForURL(url => url.hash === hash, { timeout: 45_000 });
  const search = page.getByRole('textbox', { name: 'Search Complaints' });
  const before = [readStatus(inspectionId), readStatus(otherId)];
  assert.deepEqual(before, ['submitted', 'submitted']);

  try {
    await goto('/complaints');
    await page.locator('#login-email').waitFor({ state: 'visible' });
    await page.locator('#login-email').fill(email);
    await page.locator('#login-password').fill(password);
    await page.locator('form button[type="submit"]').click();
    await waitHash('#/complaints');
    await search.waitFor({ state: 'visible' });

    await goto('/security/mfa');
    await page.locator('#mfa-otp').waitFor({ state: 'visible' });
    await page.locator('#mfa-otp').fill(otp(totpSecret));
    await page.locator('form button[type="submit"]').click();
    await page.locator('#mfa-otp').waitFor({ state: 'detached' });
    await goto('/complaints');
    await search.waitFor({ state: 'visible' });

    const submitted = page.getByRole('tab', { name: /Submitted/ });
    await submitted.click();
    assert.equal(await submitted.getAttribute('aria-selected'), 'true');
    await search.fill(inspectionId);
    const tableRow = page.locator('[aria-label="Open complaint overview ' + inspectionId + '"]');
    await tableRow.waitFor({ state: 'visible' });
    assert.equal(await page.locator('[aria-label="Open complaint overview ' + otherId + '"]').count(), 0,
      'Search-by-ID should not mix unrelated reports');
    await tableRow.click();
    let drawer = page.getByRole('dialog');
    await drawer.getByText('Complaint Overview').waitFor({ state: 'visible' });
    await drawer.getByRole('button', { name: 'Detail & Moderation' }).click();
    await waitHash('#/complaints/' + inspectionId);
    await page.getByText('Complaint Inspection: ' + inspectionId).waitFor({ state: 'visible' });
    console.log('PHASE17_A03_DESKTOP_SEARCH_STATUS_ROW_DRAWER_DETAIL_PASS');

    // Synthetic reporter telemetry exists for this complaint, but a delegated
    // AAL2 moderator may see neither private GPS nor evidence without grants.
    await page.getByText('complaints.evidence_view', { exact: true }).waitFor({ state: 'visible' });
    await page.getByText(/You do not have permission to view private reporter device location/).waitFor({ state: 'visible' });
    assert.equal(reporterGpsRequests.length, 0);
    assert.equal(evidenceRequests.length, 0);
    console.log('PHASE17_A03_DELEGATED_EVIDENCE_AND_REPORTER_GPS_FAIL_CLOSED_PASS');

    await goto('/complaints');
    await search.waitFor({ state: 'visible' });
    await search.fill('PHASE17-A03-UNMATCHED-8D724F');
    await page.getByText('No Matching Complaints Found').first().waitFor({ state: 'visible' });
    await search.fill('');
    await page.getByRole('button', { name: 'Filter Options' }).click();
    await page.getByLabel('Category', { exact: true }).selectOption('public_safety');
    await page.getByLabel('Location', { exact: true }).selectOption('Dhaka');
    await search.fill(inspectionId);
    await tableRow.waitFor({ state: 'visible' });
    await page.getByRole('button', { name: 'Reset Filters' }).click();
    assert.equal(await page.getByLabel('Category', { exact: true }).inputValue(), 'all');
    assert.equal(await page.getByLabel('Location', { exact: true }).inputValue(), 'all');
    assert.equal(await search.inputValue(), '');
    assert.equal(await submitted.getAttribute('aria-selected'), 'true',
      'Resetting advanced filters must preserve selected lifecycle tab');
    console.log('PHASE17_A03_EMPTY_FILTER_CATEGORY_LOCATION_RESET_PASS');

    await page.setViewportSize({ width: 390, height: 844 });
    await goto('/complaints');
    await search.waitFor({ state: 'visible' });
    await search.fill(inspectionId);
    const mobileId = page.getByText(inspectionId, { exact: true }).last();
    await mobileId.waitFor({ state: 'visible' });
    await mobileId.click();
    drawer = page.getByRole('dialog');
    await drawer.getByText('Complaint: ' + inspectionId).waitFor({ state: 'visible' });
    await drawer.getByRole('button', { name: 'Full Detail & Actions' }).click();
    await waitHash('#/complaints/' + inspectionId);
    await page.getByText('Complaint Inspection: ' + inspectionId).waitFor({ state: 'visible' });
    console.log('PHASE17_A03_MOBILE_CARD_SHEET_FULL_DETAIL_PASS');

    assert.deepEqual([readStatus(inspectionId), readStatus(otherId)], before,
      'Queue/detail inspection must never mutate any synthetic complaint');
    assert.deepEqual(reporterGpsRequests, []);
    assert.deepEqual(evidenceRequests, []);
    assert.deepEqual(mutationRequests, []);
    const unexpected = [...blockedHosts].filter(h => !['fonts.googleapis.com', 'fonts.gstatic.com'].includes(h));
    assert.deepEqual(unexpected, [], 'A03 test attempted an unexpected external host');
    assert.ok(![...blockedHosts].some(h => h.endsWith('.supabase.co')));
    console.log('PHASE17_A03_REAL_LOCAL_QUEUE_DETAIL_PRIVATE_ACCESS_PASS');
  } finally {
    await ctx.close();
    await browser.close();
  }
}
