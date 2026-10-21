import assert from 'node:assert/strict';
import { mkdir } from 'node:fs/promises';
import { join } from 'node:path';
import { chromium } from 'playwright';

const base = process.env.RECOVERY_WAVE_B_BASE_URL;
assert.equal(base, 'http://127.0.0.1:4174', 'Harness must never leave isolated loopback');
const screenshotDir = join(process.env.RUNNER_TEMP || '/tmp', 'sobaike-wave-b');
await mkdir(screenshotDir, {recursive:true});
const png = Buffer.from('iVBORw0KGgoAAAANSUhEUgAAAAIAAAACCAIAAAD91JpzAAAAFklEQVR4nGP8z8DAwMDAxMDAwMDAAAANHQEDasKb6QAAAABJRU5ErkJggg==','base64');
const browser=await chromium.launch({headless:true});
const createPage = async (width=390) => {
  const context=await browser.newContext({viewport:{width,height:900},reducedMotion:'reduce'});
  const page=await context.newPage();
  const external=[];
  await page.route('**/*', route=>{
    const url=new URL(route.request().url());
    if(url.hostname==='public.synthetic.invalid') {
      if(url.pathname.startsWith('/illustrations/services/') && url.pathname.endsWith('.jpg')) {
        return route.fulfill({status:200,contentType:'image/png',body:png});
      }
      return route.abort('blockedbyclient');
    }
    if(url.hostname==='127.0.0.1') return route.continue();
    external.push(url.hostname);
    return route.abort('blockedbyclient');
  });
  await page.goto(base,{waitUntil:'domcontentloaded'});
  await page.getByRole('heading',{name:'News Intake',exact:true}).waitFor();
  return {page,context,external};
};
const events=page=>page.evaluate(()=>[...window.__recoveryFixture.events]);
const noExternal=external=>assert.deepEqual(external,[],'No hosted/external API can be contacted by the fixture');
try {
  // B1-01 real reviewer component: partial HTTP 403 errors cannot hide valid candidates.
  {
    const {page,context,external}=await createPage(390);
    const panel=page.getByRole('region',{name:'Source scan errors'});
    await panel.waitFor();
    assert.match(await panel.innerText(),/www\.tbsnews\.net/);
    assert.match(await panel.innerText(),/www\.thedailystar\.net/);
    assert.equal((await panel.innerText().match(/HTTP 403/g)||[]).length,2);
    await page.getByRole('button',{name:'Select All'}).click();
    await page.getByText('2 selected').waitFor();
    assert.equal(await page.getByRole('checkbox',{name:'Select Synthetic article held'}).isDisabled(),true);
    assert.equal(await page.getByRole('checkbox',{name:'Select Synthetic article needs-review'}).isDisabled(),true);
    await page.getByRole('button',{name:'Clear',exact:true}).click();
    await page.getByText('0 selected').waitFor();
    await page.getByRole('button',{name:'Check sources and duplicates'}).click();
    assert.ok((await events(page)).includes('scan:manual'),'Manual scan invoked only synthetic backend');
    await panel.waitFor();
    await page.getByRole('button',{name:/Synthetic article ready/}).click();
    await page.getByText('Synthetic approved source').waitFor();
    await page.getByText('No duplicate found').waitFor();
    await page.screenshot({path:join(screenshotDir,'B1-390-partial-403-select-clear-preview.png'),fullPage:true});
    const overflow=await page.evaluate(()=>document.documentElement.scrollWidth-document.documentElement.clientWidth);
    assert.ok(overflow<=1,'News reviewer responsive overflow: '+overflow);
    noExternal(external);
    await context.close();
  }
  // B1-02 duplicate preflight holds the entire synthetic selection before any write.
  {
    const {page,context,external}=await createPage();
    await page.evaluate(()=>{window.__recoveryFixture.setMode('duplicate');window.__recoveryFixture.clearEvents()});
    await page.getByRole('checkbox',{name:'Select Synthetic article ready'}).check();
    await page.getByRole('button',{name:'Publish selected'}).click();
    await page.getByText(/No reports were published/).waitFor();
    const history=await events(page);
    assert.ok(history.includes('preflight'));
    assert.equal(history.includes('create'),false);
    assert.equal(history.includes('publish'),false);
    noExternal(external);
    await context.close();
  }
  // B1-03 linked draft persists across reload and resumes without duplicate creation.
  {
    const {page,context,external}=await createPage();
    await page.reload({waitUntil:'domcontentloaded'});
    await page.getByRole('checkbox',{name:'Select Synthetic article resumable'}).check();
    await page.getByRole('button',{name:'Publish selected'}).click();
    await page.getByText('1 selected reports were published.').waitFor();
    const history=await events(page);
    assert.ok(history.includes('duplicate:check'));
    assert.ok(history.includes('review'));
    assert.ok(history.includes('publish'));
    assert.equal(history.includes('create'),false,'resumed draft must not create a second report');
    noExternal(external);
    await context.close();
  }
  // B1-04 publication transport ambiguity never reports success or attempts a retry.
  {
    const {page,context,external}=await createPage();
    await page.evaluate(()=>{window.__recoveryFixture.setMode('uncertain');window.__recoveryFixture.clearEvents()});
    await page.getByRole('checkbox',{name:'Select Synthetic article ready'}).check();
    await page.getByRole('button',{name:'Publish selected'}).click();
    await page.getByText(/could not be confirmed/).waitFor();
    const history=await events(page);
    assert.equal(history.filter(x=>x==='create').length,1);
    assert.equal(history.filter(x=>x==='review').length,1);
    assert.equal(history.filter(x=>x==='publish').length,1);
    await page.screenshot({path:join(screenshotDir,'B1-390-publication-unknown.png'),fullPage:true});
    noExternal(external);
    await context.close();
  }
  // B2-01/B2-02 seven synthetic banners, responsive preview and explicit Save/Cancel.
  for(const width of [390,1280]) {
    const {page,context,external}=await createPage(width);
    await page.getByTestId('harness-banners').click();
    await page.getByRole('heading',{name:'Banner CMS',exact:true}).waitFor();
    await page.locator('img[src^="https://public.synthetic.invalid/illustrations/services/"]').waitFor();
    const original=await page.locator('#banner-titleEn').inputValue();
    await page.locator('#banner-titleEn').fill('Unsaved edit');
    await page.getByRole('button',{name:'Discard changes'}).click();
    assert.equal(await page.locator('#banner-titleEn').inputValue(),original);
    assert.equal((await events(page)).some(x=>x.startsWith('banner:save:')),false);
    const img=page.locator('img[src^="https://public.synthetic.invalid/illustrations/services/"]');
    await img.waitFor();
    await page.waitForFunction(()=>Array.from(document.images).some(x=>x.src.includes('public.synthetic.invalid')&&x.complete&&x.naturalWidth>0));
    const overflow=await page.evaluate(()=>document.documentElement.scrollWidth-document.documentElement.clientWidth);
    assert.ok(overflow<=1,'Banner CMS responsive overflow at '+width+': '+overflow);
    await page.screenshot({path:join(screenshotDir,'B2-'+width+'-banner-preview.png'),fullPage:true});
    if(width===390){
      await page.locator('#banner-titleEn').fill('Saved synthetic edit');
      await page.locator('#banner-sort-order').fill('9');
      await page.getByRole('button',{name:'Save draft'}).click();
      await page.getByText('Draft saved.').waitFor();
      assert.ok((await events(page)).includes('banner:save:harassment'));
      assert.equal((await page.evaluate(()=>window.__recoveryFixture.getBanners())).find(x=>x.category_key==='harassment').draft_content.sortOrder,9);
      page.once('dialog',async dialog=>dialog.dismiss());
      await page.getByRole('button',{name:'Publish',exact:true}).click();
      assert.equal((await events(page)).includes('banner:publish:harassment'),false,'cancel confirm must not publish');
      page.once('dialog',async dialog=>dialog.accept());
      await page.getByRole('button',{name:'Publish',exact:true}).click();
      await page.getByText('Banner published.').waitFor();
      assert.ok((await events(page)).includes('banner:publish:harassment'));
      await page.getByLabel('Active banner').uncheck();
      await page.getByRole('button',{name:'Save draft'}).click();
      await page.getByText('Draft saved.').waitFor();
      page.once('dialog',async dialog=>dialog.accept());
      await page.getByRole('button',{name:'Publish',exact:true}).click();
      await page.getByText('Banner published.').waitFor();
      assert.equal((await page.evaluate(()=>window.__recoveryFixture.getBanners())).find(x=>x.category_key==='harassment').published_content.isActive,false);
      await page.getByTestId('harness-language').click();
      await page.getByRole('heading',{name:'ব্যানার ব্যবস্থাপনা'}).waitFor();
      await page.locator('#banner-titleBn').waitFor();
      await page.screenshot({path:join(screenshotDir,'B2-390-bangla-unpublished.png'),fullPage:true});
    }
    noExternal(external);
    await context.close();
  }
  console.log('B1_B2_CHROMIUM_SYNTHETIC_PASS: real source page components, seven fixtures, HTTP 403 partial source errors, select/clear, duplicate hold, resumable draft, publication uncertainty, CMS draft/publish/unpublish EN/BN and 390/1280 image rendering; no production auth or writes.');
} finally { await browser.close(); }
