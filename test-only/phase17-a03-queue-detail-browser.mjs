import assert from 'node:assert/strict';

// Reuse the A04 Chromium session AFTER real delegated AAL2 MFA.
// No second TOTP challenge (which can correctly deny OTP replay), no mocks,
// no hosted Auth, no citizen data writes and no new production permissions.
export async function runPhase17A03({ page, browserBaseUrl, inspectionId, otherId, readStatus }) {
  assert.equal(new URL(browserBaseUrl).origin, 'http://127.0.0.1:4173');
  for (const id of [inspectionId, otherId]) {
    assert.match(id, /^SYNTH-(?:MOD|REJ|UIPUB|UIREJ)-[A-F0-9]{8}$/);
  }
  const before = [readStatus(inspectionId), readStatus(otherId)];
  assert.deepEqual(before, ['submitted', 'submitted']);

  const origin = browserBaseUrl.replace(/\/$/, '');
  const goto = path => page.goto(origin + '/#' + path, { waitUntil: 'domcontentloaded' });
  const waitHash = hash => page.waitForURL(url => url.hash === hash, { timeout: 45_000 });
  const search = page.getByRole('textbox', { name: 'Search Complaints', exact: true });

  await goto('/complaints');
  await search.waitFor({ state: 'visible' });
  const submitted = page.getByRole('tab', { name: /Submitted/ });
  await submitted.click();
  assert.equal(await submitted.getAttribute('aria-selected'), 'true');

  await search.fill(inspectionId);
  const tableRow = page.locator('[aria-label="Open complaint overview ' + inspectionId + '"]');
  await tableRow.waitFor({ state: 'visible' });
  assert.equal(await page.locator('[aria-label="Open complaint overview ' + otherId + '"]').count(), 0,
    'Complaint ID filtering must not mix unrelated reports');
  await tableRow.click();
  let drawer = page.getByRole('dialog');
  await drawer.getByText('Complaint Overview').waitFor({ state: 'visible' });
  await drawer.getByRole('button', { name: 'Detail & Moderation' }).click();
  await waitHash('#/complaints/' + inspectionId);
  await page.getByText('Complaint Inspection: ' + inspectionId).waitFor({ state: 'visible' });
  console.log('PHASE17_A03_DESKTOP_SEARCH_STATUS_ROW_DRAWER_DETAIL_PASS');

  // The private synthetic reporter GPS is present in the DB fixture, but
  // the real delegated moderator has neither evidence-view nor telemetry right.
  await page.getByText('complaints.evidence_view', { exact: true }).waitFor({ state: 'visible' });
  await page.getByText(/You do not have permission to view private reporter device location/).waitFor({ state: 'visible' });
  console.log('PHASE17_A03_DELEGATED_EVIDENCE_AND_REPORTER_GPS_FAIL_CLOSED_PASS');

  await goto('/complaints');
  await search.waitFor({ state: 'visible' });
  // Returning from the detail route mounts a fresh queue with default All.
  // Select Submitted again to test that Reset Filters preserves a *current*
  // active status selection within this queue instance.
  await submitted.click();
  assert.equal(await submitted.getAttribute('aria-selected'), 'true');
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
    'Reset filters must preserve current lifecycle tab');
  console.log('PHASE17_A03_EMPTY_CATEGORY_LOCATION_FILTER_RESET_PASS');

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
  console.log('PHASE17_A03_MOBILE_CARD_BOTTOM_SHEET_DETAIL_PASS');

  assert.deepEqual([readStatus(inspectionId), readStatus(otherId)], before,
    'Queue and evidence inspection must never change complaint lifecycle');
  console.log('PHASE17_A03_REAL_LOCAL_QUEUE_DETAIL_READ_ONLY_PASS');
}
