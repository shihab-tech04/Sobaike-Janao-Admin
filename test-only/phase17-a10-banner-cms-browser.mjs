import assert from 'node:assert/strict';

// A10: actual Admin banner page with delegated Supabase email+TOTP/AAL2,
// protected RPC writes and anonymous Public RPC, never hosted data.
// All seven banners are fictional and seeded only in disposable local SQL.
export async function runPhase17A10({
  page, browserBaseUrl, publicClient, authorizedClient,
  seedBanners, readBanner, countBanners, countPublicBanners,
}) {
  assert.equal(new URL(browserBaseUrl).origin, 'http://127.0.0.1:4173');
  // The delegated session has no banners.manage until this explicit fixture grant.
  const denied = await authorizedClient.rpc('admin_get_site_banners');
  assert.ok(denied.error, 'AAL2 delegated moderator without banner permission must be denied');
  const anonymous = await publicClient.rpc('admin_get_site_banners');
  assert.ok(anonymous.error, 'Anonymous visitor must never read private banner drafts');
  await seedBanners();
  assert.equal(countBanners(), 7, 'Seven independent disposable category banners required');
  assert.equal(countPublicBanners(), 7, 'Published categories expose their seven read-only banners');
  const grant = await authorizedClient.rpc('has_permission', {p_permission_id:'banners.manage'});
  assert.ifError(grant.error);
  assert.equal(grant.data, true);

  const goto = route => page.goto(browserBaseUrl.replace(/\/$/,'') + '/#' + route,
    {waitUntil:'domcontentloaded'});
  await page.setViewportSize({width:1280,height:850});
  await goto('/banners');
  await page.getByRole('heading',{name:'Banner CMS',exact:true}).waitFor({state:'visible'});
  assert.equal(await page.getByRole('button',{name:/v1$/}).count(),7,'Seven banner selection buttons required');
  const read = () => readBanner('harassment');
  const publicRows = async () => {
    const result = await publicClient.rpc('get_public_site_banners');
    assert.ifError(result.error);
    assert.equal(result.data.length, 7);
    return result.data;
  };
  const publicBanner = async () => (await publicRows()).find(x => x.category_key==='harassment');
  const initial=read();
  const originalTitle=initial.published_content.titleEn;
  assert.equal((await publicBanner()).content.titleEn,originalTitle);
  assert.equal(await page.locator('#banner-titleEn').inputValue(),originalTitle);
  console.log('PHASE17_A10_AUTHORIZED_SEVEN_BANNERS_SQL_PUBLIC_READ_PASS');

  await page.locator('#banner-titleEn').fill('Discarded A10 fictional draft');
  await page.getByRole('button',{name:'Discard changes'}).click();
  assert.equal(await page.locator('#banner-titleEn').inputValue(),originalTitle);
  assert.equal(read().draft_content.titleEn,originalTitle);
  assert.equal((await publicBanner()).content.titleEn,originalTitle);
  console.log('PHASE17_A10_DISCARD_ZERO_SQL_OR_PUBLIC_MUTATION_PASS');

  // Local admin can save an incomplete *draft*, but may never publish it.
  await page.locator('#banner-titleEn').fill('A10 fiction draft changes');
  await page.locator('#banner-sort-order').fill('0');
  assert.equal(await page.getByRole('button',{name:'Save draft'}).isDisabled(),true);
  assert.equal(read().draft_content.titleEn,originalTitle);
  await page.locator('#banner-sort-order').fill('9');
  await page.locator('#banner-mobileDescriptionEn').fill('Incomplete length');
  await page.getByRole('button',{name:'Save draft'}).click();
  await page.getByText('Draft saved.',{exact:true}).waitFor({state:'visible'});
  const draft=read();
  assert.equal(draft.draft_content.titleEn,'A10 fiction draft changes');
  assert.equal(draft.draft_content.sortOrder,9);
  assert.equal(draft.published_content.titleEn,originalTitle);
  assert.equal((await publicBanner()).content.titleEn,originalTitle);
  assert.equal(await page.getByRole('button',{name:'Publish',exact:true}).isDisabled(),true);
  console.log('PHASE17_A10_INCOMPLETE_DRAFT_SAVE_AND_PUBLICATION_GUARD_PASS');

  // Complete the exact 62-character English description before publishing.
  await page.locator('#banner-mobileDescriptionEn').fill('A'.repeat(62));
  await page.getByRole('button',{name:'Save draft'}).click();
  await page.getByText('Draft saved.',{exact:true}).waitFor({state:'visible'});
  assert.equal(read().published_content.titleEn,originalTitle);
  const versionBefore=read().version;
  page.once('dialog',async d => d.dismiss());
  await page.getByRole('button',{name:'Publish',exact:true}).click();
  assert.equal(read().version,versionBefore);
  assert.equal((await publicBanner()).content.titleEn,originalTitle);
  console.log('PHASE17_A10_CANCEL_PUBLICATION_NO_MUTATION_PASS');

  page.once('dialog',async d => d.accept());
  await page.getByRole('button',{name:'Publish',exact:true}).click();
  await page.getByText('Banner published.',{exact:true}).waitFor({state:'visible'});
  const published=read();
  assert.equal(published.published_content.titleEn,'A10 fiction draft changes');
  assert.equal(published.version,versionBefore+1);
  assert.equal((await publicBanner()).content.titleEn,'A10 fiction draft changes');
  assert.equal((await publicRows()).at(-1).category_key,'harassment',
    'Updated sortOrder must propagate to anonymous Public ordering');
  console.log('PHASE17_A10_REAL_UI_PROTECTED_PUBLISH_PUBLIC_ORDER_AND_VERSION_PASS');

  // Public must receive inactive banner state; frontend decides visibility.
  await page.setViewportSize({width:390,height:844});
  await page.getByLabel('Active banner').uncheck();
  await page.getByRole('button',{name:'Save draft'}).click();
  await page.getByText('Draft saved.',{exact:true}).waitFor({state:'visible'});
  assert.equal((await publicBanner()).content.isActive,true,
    'Unpublished visibility edit may not reach Public');
  page.once('dialog',async d=>d.accept());
  await page.getByRole('button',{name:'Publish',exact:true}).click();
  await page.getByText('Banner published.',{exact:true}).waitFor({state:'visible'});
  assert.equal(read().published_content.isActive,false);
  assert.equal((await publicBanner()).content.isActive,false);
  const overflow=await page.evaluate(()=>document.documentElement.scrollWidth-document.documentElement.clientWidth);
  assert.ok(overflow<=1,'Mobile Banner CMS overflow: '+overflow);
  await page.reload({waitUntil:'domcontentloaded'});
  await page.getByRole('heading',{name:'Banner CMS',exact:true}).waitFor({state:'visible'});
  assert.equal(await page.getByLabel('Active banner').isChecked(),false);
  assert.equal((await publicBanner()).content.isActive,false);
  console.log('PHASE17_A10_MOBILE_WITHDRAWAL_RELOAD_AND_PUBLIC_STATE_PASS');
}
