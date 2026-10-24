import assert from 'node:assert/strict';

// Actual response queue/drawer/modals + real Auth AAL2 and SQL RPCs.
// All records are fictional and exist only in disposable 127.0.0.1 Supabase.
export async function runPhase17A07({
  page, browserBaseUrl, publicClient, responseParent, publishId, rejectId,
  readResponseStatus, readResponseAuditCount,
}) {
  assert.equal(new URL(browserBaseUrl).origin, 'http://127.0.0.1:4173');
  for (const id of [responseParent, publishId, rejectId]) {
    assert.match(id, /^SYNTH-(?:RSPPAR|UIRSPPUB|UIRSPREJ)-[A-F0-9]{8}$/);
  }
  assert.equal(readResponseStatus(publishId), 'pending_review');
  assert.equal(readResponseStatus(rejectId), 'pending_review');
  const origin = browserBaseUrl.replace(/\/$/, '');
  const goto = path => page.goto(origin + '/#' + path, { waitUntil: 'domcontentloaded' });
  const drawer = () => page.getByRole('dialog').first();
  const confirm = () => page.getByRole('dialog').last();
  const view = async (id, mobile = false) => {
    await goto('/responses');
    const name = mobile ? 'View response ' + id : 'View #' + id;
    const button = page.getByRole('button', { name, exact: true });
    await button.waitFor({ state: 'visible' });
    await button.click();
    await drawer().getByText('ID: #' + id).waitFor({ state: 'visible' });
    await page.getByText('Response Content', { exact: true }).waitFor({ state: 'visible' });
  };
  const checkPublic = async (present, visibleText, stage) => {
    const result = await publicClient.rpc('get_public_published_responses', { p_report_id: responseParent });
    assert.ifError(result.error);
    const serialized = JSON.stringify(result.data);
    assert.equal(serialized.includes(visibleText), present, stage);
    assert.ok(!serialized.includes('PRIVATE_SYNTHETIC_RESPONSE_CONTACT'),
      'Private response contact must never leak into public feed');
  };
  const auditBefore = readResponseAuditCount();

  await page.setViewportSize({ width: 1280, height: 850 });
  await view(publishId);
  await drawer().getByRole('button', { name: 'Publish', exact: true }).click();
  await confirm().getByText('Publish Response', { exact: true }).first().waitFor({ state: 'visible' });
  // Cancellation cannot publish.
  await confirm().getByRole('button', { name: 'Cancel', exact: true }).click();
  assert.equal(readResponseStatus(publishId), 'pending_review');
  await checkPublic(false, 'A07 fictional publication response', 'cancelled publish stays private');

  await drawer().getByRole('button', { name: 'Publish', exact: true }).click();
  await confirm().getByRole('button', { name: 'Publish Response', exact: true }).click();
  await page.getByText('Response published successfully.', { exact: true }).waitFor({ state: 'visible' });
  assert.equal(readResponseStatus(publishId), 'published');
  await checkPublic(true, 'A07 fictional publication response', 'authorized publication visible to Public');
  console.log('PHASE17_A07_REAL_UI_PUBLISH_PUBLIC_SYNC_PASS');

  await drawer().getByRole('button', { name: 'Unpublish', exact: true }).click();
  await confirm().getByRole('button', { name: 'Cancel', exact: true }).click();
  assert.equal(readResponseStatus(publishId), 'published', 'cancelled withdrawal must preserve publication');
  await drawer().getByRole('button', { name: 'Unpublish', exact: true }).click();
  await confirm().locator('#response-moderation-note').fill('Synthetic withdrawal: privacy check');
  await confirm().getByRole('button', { name: 'Unpublish Response', exact: true }).click();
  await page.getByText('Response unpublished successfully.', { exact: true }).waitFor({ state: 'visible' });
  assert.equal(readResponseStatus(publishId), 'unpublished');
  await checkPublic(false, 'A07 fictional publication response', 'withdrawn response hidden on Public');
  console.log('PHASE17_A07_REAL_UI_WITHDRAW_PUBLIC_HIDDEN_PASS');

  await view(rejectId);
  await drawer().getByRole('button', { name: 'Reject', exact: true }).click();
  await confirm().getByRole('button', { name: 'Cancel', exact: true }).click();
  assert.equal(readResponseStatus(rejectId), 'pending_review');
  await drawer().getByRole('button', { name: 'Reject', exact: true }).click();
  await confirm().locator('#response-moderation-note').fill('Synthetic rejection: reviewer verification failed');
  await confirm().getByRole('button', { name: 'Reject Response', exact: true }).click();
  await page.getByText('Response rejected successfully.', { exact: true }).waitFor({ state: 'visible' });
  assert.equal(readResponseStatus(rejectId), 'rejected');
  await checkPublic(false, 'A07 fictional rejected response', 'rejected response private');
  console.log('PHASE17_A07_REAL_UI_REJECTION_PUBLIC_DENY_PASS');

  // A genuine resubmission stays pending, never publishes automatically.
  await drawer().getByRole('button', { name: 'Resubmit', exact: true }).click();
  await confirm().getByRole('button', { name: 'Resubmit Response', exact: true }).click();
  await page.getByText('Response resubmitted for review successfully.', { exact: true }).waitFor({ state: 'visible' });
  assert.equal(readResponseStatus(rejectId), 'pending_review');
  await checkPublic(false, 'A07 fictional rejected response', 'resubmitted response remains unpublished');
  console.log('PHASE17_A07_REAL_UI_RESUBMIT_PENDING_NO_AUTOPUBLICATION_PASS');

  await page.setViewportSize({ width: 390, height: 844 });
  await view(rejectId, true);
  await drawer().getByRole('button', { name: 'Reject', exact: true }).waitFor({ state: 'visible' });
  assert.equal(readResponseStatus(rejectId), 'pending_review');
  assert.ok(readResponseAuditCount() >= auditBefore + 4,
    'Pub/unpub/reject/resubmit must each emit Admin audit events');
  console.log('PHASE17_A07_MOBILE_SHEET_AUDIT_AND_PRIVATE_CONTACT_PASS');
  console.log('PHASE17_A07_REAL_LOCAL_RESPONSE_MODERATION_PUBLIC_PARITY_PASS');
}
