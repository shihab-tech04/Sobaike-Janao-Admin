import assert from 'node:assert/strict';
import { createHmac } from 'node:crypto';
import { chromium } from 'playwright';
import { runPhase17A03 } from './phase17-a03-queue-detail-browser.mjs';
import { runPhase17A02 } from './phase17-a02-dashboard-browser.mjs';
import { runPhase17A06 } from './phase17-a06-news-reviewer-browser.mjs';
import { runPhase17A07 } from './phase17-a07-response-moderation-browser.mjs';
import { runPhase17A08 } from './phase17-a08-taxonomy-browser.mjs';
import { runPhase17A09 } from './phase17-a09-form-builder-browser.mjs';
import { runPhase17A10 } from './phase17-a10-banner-cms-browser.mjs';

// This fixture exercises actual Admin React components and production-derived
// local RPC/roles without any hosted account or citizen data.
export async function runPhase17A04({
  apiUrl, browserBaseUrl, email, password, totpSecret,
  publishId, rejectId, readStatus, publicClient, getSqlDashboardSnapshot, setRecentReadGrant, getSourcedCount,
  responseParent, responseUiPublish, responseUiReject, readResponseStatus, readResponseAuditCount,
  a08SubcategoryId, readA08TaxonomyRow, readA09Form,
  seedA10Banners, readA10Banner, countA10Banners, countPublicA10Banners, authorizedClient,
}) {
  assert.equal(new URL(apiUrl).origin, 'http://127.0.0.1:54321');
  assert.equal(new URL(browserBaseUrl).origin, 'http://127.0.0.1:4173');
  assert.ok([publishId, rejectId].every(x => /^SYNTH-UI(?:PUB|REJ)-[A-F0-9]{8}$/.test(x)));
  assert.match(email, /@recovery\.invalid$/);
  assert.ok(password?.length >= 16 && totpSecret?.length > 15);
  const totp = (secret) => {
    const alphabet = 'ABCDEFGHIJKLMNOPQRSTUVWXYZ234567';
    let bits = '';
    for (const char of secret.toUpperCase().replace(/=|\s/g, '')) {
      const n = alphabet.indexOf(char);
      assert.ok(n >= 0);
      bits += n.toString(2).padStart(5, '0');
    }
    const key = Buffer.from(Array.from({length:Math.floor(bits.length/8)},
      (_,i) => parseInt(bits.slice(i*8,i*8+8),2)));
    const counter=Buffer.alloc(8);
    counter.writeBigUInt64BE(BigInt(Math.floor(Date.now()/30000)));
    const mac=createHmac('sha1',key).update(counter).digest();
    const offset=mac[mac.length-1]&15;
    return String((mac.readUInt32BE(offset)&0x7fffffff)%1000000).padStart(6,'0');
  };

  const browser = await chromium.launch({ headless:true });
  const ctx = await browser.newContext({ viewport:{width:1280,height:850},reducedMotion:'reduce' });
  const page = await ctx.newPage();
  page.setDefaultTimeout(25000);
  const blockedExternal = new Set();
  const reporterRequests = [];
  await page.route('**/*',async route=>{
    const u=new URL(route.request().url());
    if(u.hostname && u.hostname!=='127.0.0.1'){
      blockedExternal.add(u.hostname);
      await route.abort('blockedbyclient');
      return;
    }
    if (u.pathname.includes('admin_get_complaint_reporter_location')) {
      reporterRequests.push(u.pathname);
    }
    await route.continue();
  });
  const origin=browserBaseUrl.replace(/\/$/,'');
  const goto = async route => page.goto(origin+'/#'+route,{waitUntil:'domcontentloaded'});
  const waitHash = async h=>page.waitForURL(url=>url.hash===h,{timeout:45000});
  const actionArea=page.getByText('Administrative Triage & Actions',{exact:true});
  try {
    // Genuine delegated admin login and AAL1 fail-closed moderation UI.
    await goto('/complaints/'+publishId);
    await page.locator('#login-email').waitFor({state:'visible'});
    await page.locator('#login-email').fill(email);
    await page.locator('#login-password').fill(password);
    await page.locator('form button[type="submit"]').click();
    await waitHash('#/complaints/'+publishId);
    await actionArea.waitFor({state:'visible'});
    assert.equal(await page.getByRole('button',{name:'Publish to Feed',exact:true}).count(),0,
      'Delegated AAL1 user must not see publish control');
    assert.equal(readStatus(publishId),'submitted');
    console.log('PHASE17_A04_DELEGATED_AAL1_UI_DENIES_PUBLISH_PASS');

    // Step up the same genuine browser session via TOTP.
    await goto('/security/mfa');
    await page.locator('#mfa-otp').waitFor({state:'visible'});
    await page.locator('#mfa-otp').fill(totp(totpSecret));
    await page.locator('form button[type="submit"]').click();
    await page.locator('#mfa-otp').waitFor({state:'detached'});
    await goto('/complaints/'+publishId);
    await actionArea.waitFor({state:'visible'});
    const publish=page.getByRole('button',{name:'Publish to Feed',exact:true});
    await publish.waitFor({state:'visible'});

    // Explicit cancellation may never silently publish.
    await publish.click();
    let modal=page.getByRole('dialog');
    await modal.getByRole('heading',{name:'Publish Complaint to Feed'}).waitFor({state:'visible'});
    await modal.getByRole('button',{name:'Cancel'}).click();
    assert.equal(readStatus(publishId),'submitted');
    await publish.click();
    modal=page.getByRole('dialog');
    await modal.getByRole('button',{name:'Publish Live'}).click();
    await page.getByRole('button',{name:'Unpublish',exact:true}).waitFor({state:'visible'});
    assert.equal(readStatus(publishId),'published');
    const live=await publicClient.rpc('get_public_published_report',{p_report_id:publishId});
    assert.ifError(live.error);
    assert.equal(live.data?.id,publishId);
    assert.ok(!JSON.stringify(live.data).includes('PRIVATE_SYNTHETIC'),
      'No private reporter data may leak after UI publication');
    console.log('PHASE17_A04_UI_PUBLISH_PUBLIC_SYNC_PASS');

    const unpublish=page.getByRole('button',{name:'Unpublish',exact:true});
    await unpublish.click();
    modal=page.getByRole('dialog');
    await modal.getByRole('heading',{name:'Unpublish Complaint?'}).waitFor({state:'visible'});
    await modal.getByRole('button',{name:'Unpublish',exact:true}).click();
    await page.getByRole('button',{name:'Publish to Feed',exact:true}).waitFor({state:'visible'});
    assert.equal(readStatus(publishId),'unpublished');
    const hidden=await publicClient.rpc('get_public_published_report',{p_report_id:publishId});
    assert.ifError(hidden.error);
    assert.equal(hidden.data,null);
    console.log('PHASE17_A04_UI_WITHDRAWAL_PUBLIC_HIDDEN_PASS');

    await goto('/complaints/'+rejectId);
    await actionArea.waitFor({state:'visible'});
    await page.getByRole('button',{name:'Reject Complaint',exact:true}).click();
    modal=page.getByRole('dialog');
    await modal.getByRole('button',{name:'Confirm Rejection'}).click();
    await modal.getByText('Please enter a clear explanation for rejecting this complaint.').waitFor({state:'visible'});
    assert.equal(readStatus(rejectId),'submitted','Blank rejection rationale must not mutate');
    await modal.getByLabel('Rejection Explanation *').fill('Synthetic review: independently verified duplicate evidence');
    await modal.getByRole('button',{name:'Confirm Rejection'}).click();
    await modal.getByText('Reject Complaint',{exact:true}).waitFor({state:'detached'});
    assert.equal(readStatus(rejectId),'rejected');
    const rejectedPublic=await publicClient.rpc('get_public_published_report',{p_report_id:rejectId});
    assert.ifError(rejectedPublic.error);
    assert.equal(rejectedPublic.data,null);
    console.log('PHASE17_A04_UI_REJECTION_REQUIRES_REASON_PASS');

    // The same genuine authorized AAL2 browser session now checks A03 queue,
    // desktop/mobile detail navigation and fail-closed private inspection.
    await runPhase17A03({
      page,
      browserBaseUrl,
      inspectionId: publishId.replace('UIPUB', 'MOD'),
      otherId: rejectId.replace('UIREJ', 'REJ'),
      readStatus,
    });

    await runPhase17A02({
      page, browserBaseUrl,
      getSqlSnapshot: getSqlDashboardSnapshot,
      setRecentReadGrant,
    });

    // A06 exercises the real React reviewer, but intercepts only synthetic
    // news preview/read and failure responses; no live news or SQL writes.
    await runPhase17A06({ page, browserBaseUrl, readSourcedReportCount: getSourcedCount });

    await runPhase17A07({
      page, browserBaseUrl, publicClient,
      responseParent, publishId: responseUiPublish, rejectId: responseUiReject,
      readResponseStatus, readResponseAuditCount,
    });

    await runPhase17A08({
      page, browserBaseUrl, publicClient,
      syntheticId: a08SubcategoryId, readTaxonomyRow: readA08TaxonomyRow,
    });

    await runPhase17A09({
      page, browserBaseUrl, publicClient,
      syntheticId: a08SubcategoryId, readForm: readA09Form,
    });
    await runPhase17A10({
      page, browserBaseUrl, publicClient, authorizedClient,
      seedBanners: seedA10Banners, readBanner: readA10Banner,
      countBanners: countA10Banners, countPublicBanners: countPublicA10Banners,
    });

    assert.deepEqual(reporterRequests,[],'Delegated Admin UI must never request protected reporter GPS');
    const external=[...blockedExternal].filter(h=>!['fonts.googleapis.com','fonts.gstatic.com'].includes(h));
    assert.deepEqual(external,[],'Isolated moderation test attempted unexpected external host');
    assert.ok(![...blockedExternal].some(h=>h.endsWith('.supabase.co')),
      'No hosted Supabase server may be contacted');
    console.log('PHASE17_A04_REAL_LOCAL_UI_MODERATION_PUBLIC_SYNC_PASS');
  } finally {
    await ctx.close();
    await browser.close();
  }
}
