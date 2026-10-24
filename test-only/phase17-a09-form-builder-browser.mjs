import assert from 'node:assert/strict';

// Phase 17 A09: the actual reporting Form Builder drawer, real delegated
// email+TOTP AAL2, protected local RPC, and anonymous public configuration.
// Uses A08's new *inactive* synthetic subcategory in disposable loopback SQL.
export async function runPhase17A09({
  page, browserBaseUrl, publicClient, syntheticId, readForm,
}) {
  assert.equal(new URL(browserBaseUrl).origin, 'http://127.0.0.1:4173');
  assert.match(syntheticId, /^a08_[a-f0-9]{8}$/);
  const origin = browserBaseUrl.replace(/\/$/, '');
  const goto = path => page.goto(origin + '/#' + path, {waitUntil:'domcontentloaded'});
  const form = async () => {
    const response = await readForm(syntheticId);
    assert.ok(response?.schema && Array.isArray(response.fields));
    return response;
  };
  const isPublic = async () => {
    const response = await publicClient.rpc('get_public_reporting_configuration');
    assert.ifError(response.error);
    return (response.data?.forms || []).some(f => f.subcategoryId === syntheticId);
  };

  await page.setViewportSize({width:1280, height:850});
  await goto('/categories');
  // A08 deliberately leaves a failed-publication dialog open to prove server denial.
  // A fresh isolated document removes that test-only overlay, preserving Auth state.
  await page.reload({waitUntil:'domcontentloaded'});
  await page.locator('#taxonomy-search-input').fill(syntheticId);
  const row = page.locator('tr').filter({hasText:syntheticId});
  await row.waitFor({state:'visible'});
  await row.getByRole('button',{name:'Details'}).click();
  await page.locator('#taxonomy-form-open').click();
  await page.getByText('Reporting Form Builder',{exact:true}).waitFor({state:'visible'});
  await page.locator('#form-status').waitFor({state:'visible'});
  assert.match(await page.locator('#form-status').innerText(),/DRAFT/);
  const original=await form();
  assert.equal(original.schema.status,'draft');
  assert.equal(original.fields.length,6);
  assert.equal(await isPublic(),false);
  assert.equal(await page.getByRole('button',{name:'Remove title'}).count(),0);
  assert.equal(await page.getByRole('button',{name:'Remove description'}).count(),0);
  console.log('PHASE17_A09_REAL_UI_CORE_FIELDS_LOCKED_DRAFT_PRIVATE_PASS');

  // Client must reject an incomplete bilingual field without SQL mutation.
  await page.locator('#form-add-field').click();
  const custom=page.locator('section[aria-label="custom_field_1 field"]');
  await custom.waitFor({state:'visible'});
  await custom.getByLabel('English label').fill('Synthetic witness');
  await page.locator('#form-draft-save').click();
  await page.getByRole('alert').last().waitFor({state:'visible'});
  assert.equal((await form()).fields.length,6);
  assert.equal(await isPublic(),false);
  console.log('PHASE17_A09_INCOMPLETE_BILINGUAL_DRAFT_DENIED_PASS');

  // The same real React drawer then saves an audited seven-field draft.
  await custom.getByLabel('বাংলা লেবেল').fill('পরীক্ষামূলক সাক্ষী');
  await custom.getByLabel('Field type').selectOption('select');
  await custom.getByRole('button',{name:'Add choice'}).click();
  await custom.getByRole('button',{name:'Add choice'}).click();
  for (const [i,value,en,bn] of [
    [1,'nearby','Nearby witness','নিকটবর্তী সাক্ষী'],
    [2,'traveller','Traveller','পথচারী'],
  ]) {
    await custom.getByLabel(`custom_field_1 option ${i} value`).fill(value);
    await custom.getByLabel(`custom_field_1 option ${i} labelEn`).fill(en);
    await custom.getByLabel(`custom_field_1 option ${i} labelBn`).fill(bn);
  }
  await page.getByLabel('Review notes').fill('Controlled local A09 draft, no citizen content');
  await page.locator('#form-draft-save').click();
  await page.getByText('Draft saved. It is not published.',{exact:true}).waitFor({state:'visible'});
  const saved=await form();
  assert.equal(saved.schema.status,'draft');
  assert.equal(saved.fields.length,7);
  const added=saved.fields.find(f=>f.fieldKey==='custom_field_1');
  assert.equal(added?.fieldType,'select');
  assert.equal(added?.labelBn,'পরীক্ষামূলক সাক্ষী');
  assert.equal(added?.options[1]?.labelBn,'পথচারী');
  assert.equal(await isPublic(),false);
  console.log('PHASE17_A09_REAL_UI_BILINGUAL_CHOICES_SAVED_SQL_DRAFT_HIDDEN_PASS');

  // Opening, then cancelling publication must preserve the stored draft.
  await page.locator('#form-publish-open').click();
  const confirm=page.getByRole('dialog').last();
  await confirm.getByText('Confirm form publication',{exact:true}).waitFor({state:'visible'});
  await confirm.getByRole('button',{name:'Cancel'}).click();
  assert.equal((await form()).schema.status,'draft');
  assert.equal(await isPublic(),false);
  await page.locator('#form-publish-open').click();
  await page.locator('#form-publish-confirm').click();
  await page.getByText(/Form published\./).waitFor({state:'visible'});
  assert.match(await page.locator('#form-status').innerText(),/PUBLISHED/);
  const published=await form();
  assert.equal(published.schema.status,'published');
  assert.equal(published.fields.length,7);
  assert.equal(await isPublic(),false,
    'Publishing a form for an inactive taxonomy must not expose a Public composer');
  console.log('PHASE17_A09_UI_PUBLISH_INACTIVE_TAXONOMY_REMAINS_PRIVATE_PASS');

  await page.setViewportSize({width:390,height:844});
  await page.locator('#form-status').waitFor({state:'visible'});
  assert.match(await page.locator('#form-status').innerText(),/PUBLISHED.*7/);
  assert.equal(await isPublic(),false);
  console.log('PHASE17_A09_MOBILE_STATUS_AND_PUBLIC_DENY_PASS');
}
