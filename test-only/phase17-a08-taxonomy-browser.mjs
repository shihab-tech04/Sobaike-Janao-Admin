import assert from 'node:assert/strict';

// Phase17 A08: real Admin React taxonomy lifecycle, real protected localhost
// SQL RPC, and real anonymous Public reporting configuration. The sole new
// taxonomy row is a synthetic inactive draft in disposable local Supabase.
export async function runPhase17A08({
  page, browserBaseUrl, publicClient, syntheticId, readTaxonomyRow,
}) {
  assert.equal(new URL(browserBaseUrl).origin, 'http://127.0.0.1:4173');
  assert.match(syntheticId, /^a08_[a-f0-9]{8}$/);
  assert.equal(readTaxonomyRow(syntheticId), null, 'A08 fixture must not pre-exist');

  const origin = browserBaseUrl.replace(/\/$/, '');
  const goto = path => page.goto(origin + '/#' + path, { waitUntil: 'domcontentloaded' });
  const publicVisible = async () => {
    const p = await publicClient.rpc('get_public_reporting_configuration');
    assert.ifError(p.error);
    return (p.data?.subcategories || []).some(s => s.id === syntheticId);
  };
  const newDraft = page.locator('#taxonomy-create-open');
  const draftRow = page.locator('tr').filter({ hasText: syntheticId });

  await page.setViewportSize({ width: 1280, height: 850 });
  await goto('/categories');
  await newDraft.waitFor({ state: 'visible' });
  await newDraft.click();

  const modal = page.getByRole('dialog').last();
  await modal.getByText('Create Taxonomy Draft', { exact: true }).waitFor({ state: 'visible' });
  await page.locator('#taxonomy-create-id').fill('Not Valid ID');
  await page.locator('#taxonomy-create-name-en').fill('A08 fictional review subcategory');
  await page.locator('#taxonomy-create-name-bn').fill('পরীক্ষামূলক পর্যালোচনা বিভাগ');
  await page.locator('#taxonomy-create-parent').selectOption('public_safety');
  await page.locator('#taxonomy-create-order').fill('89');
  await page.locator('#taxonomy-create-confirm').click();
  await modal.getByRole('alert').waitFor({ state: 'visible' });
  assert.equal(readTaxonomyRow(syntheticId), null, 'Invalid identifier must never reach SQL');

  await page.locator('#taxonomy-create-id').fill(syntheticId);
  await page.locator('#taxonomy-create-confirm').click();
  await draftRow.waitFor({ state: 'visible' });
  const created = readTaxonomyRow(syntheticId);
  assert.ok(created && created.active === false);
  assert.equal(created.segment_id, 'public_safety');
  assert.equal(created.name_en, 'A08 fictional review subcategory');
  assert.equal(await publicVisible(), false, 'Inactive draft cannot appear in Public reporting');
  console.log('PHASE17_A08_REAL_UI_CREATE_VALIDATION_DRAFT_HIDDEN_PASS');

  await page.locator('#taxonomy-search-input').fill(syntheticId);
  await page.locator('#taxonomy-status-select').selectOption('inactive');
  await draftRow.waitFor({ state: 'visible' });
  await draftRow.getByRole('button', { name: 'Details' }).click();
  await page.getByRole('button', { name: 'Edit', exact: true }).click();
  await page.locator('#taxonomy-name-en').fill('A08 reviewed bilingual taxonomy');
  await page.locator('#taxonomy-name-bn').fill('যাচাইকৃত পরীক্ষামূলক শ্রেণি');
  await page.locator('#taxonomy-sort-order').fill('91');
  await page.getByRole('button', { name: 'Save Changes', exact: true }).click();
  await page.locator('#refresh-taxonomy-btn').waitFor({ state: 'visible' });
  const edited = readTaxonomyRow(syntheticId);
  assert.equal(edited.name_en, 'A08 reviewed bilingual taxonomy');
  assert.equal(edited.name_bn, 'যাচাইকৃত পরীক্ষামূলক শ্রেণি');
  assert.equal(Number(edited.sort_order), 91);
  assert.equal(edited.active, false);
  assert.equal(await publicVisible(), false);
  console.log('PHASE17_A08_REAL_UI_BILINGUAL_EDIT_SQL_AND_PUBLIC_PRIVACY_PASS');

  await draftRow.waitFor({ state: 'visible' });
  await draftRow.getByRole('button', { name: 'Details' }).click();
  await page.locator('#taxonomy-publish-open').click();
  await page.getByText('Confirm taxonomy publication', { exact: true }).waitFor({ state: 'visible' });
  await page.locator('#taxonomy-publish-confirm').click();
  await page.getByText(/Could not publish taxonomy item|form|parent|banner/i).last()
    .waitFor({ state: 'visible' });
  assert.equal(readTaxonomyRow(syntheticId)?.active, false,
    'Missing publication prerequisites must fail on actual server');
  assert.equal(await publicVisible(), false, 'Failed publication must never leak to Public');
  console.log('PHASE17_A08_REAL_UI_INCOMPLETE_FORM_PUBLISH_FAIL_CLOSED_PASS');

  await page.setViewportSize({ width: 390, height: 844 });
  await goto('/categories');
  await page.locator('#taxonomy-search-input').waitFor({ state: 'visible' });
  await page.locator('#taxonomy-search-input').fill(syntheticId);
  await draftRow.waitFor({ state: 'visible' });
  assert.equal((await draftRow.getByText(syntheticId, { exact: true }).count()) > 0, true);
  assert.equal(readTaxonomyRow(syntheticId)?.active, false);
  assert.equal(await publicVisible(), false);
  console.log('PHASE17_A08_MOBILE_FILTER_AND_DRAFT_REMAINS_PRIVATE_PASS');
}
