import assert from 'node:assert/strict';

// Phase17 A11: inspect the real Admin Map Monitoring UI with a delegated AAL2
// session, protected local Map RPC, three fictional SQL rows and no hosted traffic.
// No live Supabase credentials, citizen reports, or private GPS are used.
export async function runPhase17A11({
  page, browserBaseUrl, publicClient, authorizedClient,
  grantMapPermission, seedMapReports, removeMapReports, mapIds,
  readMapRows,
}) {
  assert.equal(new URL(browserBaseUrl).origin, 'http://127.0.0.1:4173');
  assert.equal(mapIds.length, 3);
  assert.ok(mapIds.every(id => /^SYNTH-A11-(?:PUB|SUB|NOGEO)-[A-F0-9]{8}$/.test(id)));

  // A valid authenticated AAL2 login is not itself sufficient for map access.
  const anonymous = await publicClient.rpc('admin_get_map_dataset');
  assert.ok(anonymous.error, 'Anonymous users must not call the protected Map RPC');
  const ungranted = await authorizedClient.rpc('admin_get_map_dataset');
  assert.ok(ungranted.error, 'Delegated AAL2 moderator without map.view must be denied');
  assert.equal(ungranted.error.code, '42501');
  console.log('PHASE17_A11_ANON_AND_UNGRANTED_ADMIN_MAP_DENIED_PASS');

  // Deterministic transparent tile prevents the isolated browser from contacting
  // the external map tile service. The real Leaflet markers still render.
  const tilePattern = /^https:\/\/[abc]\.tile\.openstreetmap\.org\/.*\.png(?:\?.*)?$/;
  const transparentPng = Buffer.from(
    'iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mP8/x8AAwMCAO+/B0kAAAAASUVORK5CYII=',
    'base64'
  );
  const tileHandler = route => route.fulfill({
    status: 200, contentType: 'image/png', body: transparentPng,
  });
  await page.route(tilePattern, tileHandler);

  const origin = browserBaseUrl.replace(/\/$/, '');
  const goto = path => page.goto(origin + '/#' + path, {waitUntil:'domcontentloaded'});
  const rpcPattern = '**/rest/v1/rpc/admin_get_map_dataset';
  let seeded = false;
  try {
    grantMapPermission(true);
    seedMapReports();
    seeded = true;
    assert.equal(readMapRows(), 3, 'Three synthetic map reports should exist only in local SQL');

    const allowed = await authorizedClient.rpc('has_permission', {p_permission_id:'map.view'});
    assert.ifError(allowed.error);
    assert.equal(allowed.data, true);
    const rpc = await authorizedClient.rpc('admin_get_map_dataset');
    assert.ifError(rpc.error);
    const rows = rpc.data?.complaints;
    assert.ok(Array.isArray(rows));
    for (const mapId of mapIds) {
      assert.equal(rows.filter(row => row.id === mapId).length, 1, 'Map RPC omitted synthetic SQL report ' + mapId);
    }
    assert.ok(!JSON.stringify(rpc.data).includes('PRIVATE_SYNTHETIC'),
      'Controlled Map RPC must never disclose private reporter data');
    assert.ok(!rows.some(row => 'reporter_contact' in row || 'reporter_name' in row),
      'Map dataset must not return reporter identity/contact');
    console.log('PHASE17_A11_REAL_AAL2_MAP_RPC_SQL_AND_PRIVACY_PASS');

    await page.setViewportSize({width:1280,height:850});
    await goto('/map');
    const pageTitle=page.getByRole('heading',{name:'Map Monitoring',exact:true,level:1});
    try {
      await pageTitle.waitFor({state:'visible',timeout:9000});
    } catch {
      console.log('PHASE17_A11_MAP_ROUTE_INITIAL_AUTH_DIAGNOSTIC',JSON.stringify({
        url:page.url(),body:(await page.locator('body').innerText()).slice(-900),
      }));
      // New AAL2 session / delegated permission refresh can race the first
      // protected-route request. Retry the *actual* route once rather than
      // mocking authorization, injecting credentials or bypassing a guard.
      // A SPA hash navigation does not remount AuthContext. Reloading the
      // already authenticated page re-reads the updated SQL permission set.
      await page.reload({waitUntil:'domcontentloaded'});
      await pageTitle.waitFor({state:'visible',timeout:15000});
      console.log('PHASE17_A11_MAP_ROUTE_AUTH_REFRESH_RECOVERY_PASS');
    }
    try {
      await page.locator('#map-search-input').waitFor({state:'visible',timeout:8000});
    } catch (initialError) {
      // Actual UI data loading can fail transiently after Auth permission refresh.
      // Exercise its existing Retry rather than substituting a mocked dataset.
      console.log('PHASE17_A11_INITIAL_LOAD_RECOVERY_DIAGNOSTIC',JSON.stringify({
        url:page.url(),
        body:(await page.locator('body').innerText()).slice(-1400),
      }));
      const retry=page.getByRole('button',{name:'Retry',exact:true});
      if(await retry.isVisible()) {
        await retry.click();
      } else {
        await page.reload({waitUntil:'domcontentloaded'});
      }
      await page.locator('#map-search-input').waitFor({state:'visible',timeout:15000});
      console.log('PHASE17_A11_INITIAL_TRANSIENT_MAP_LOAD_RECOVERED_PASS');
    }
    await page.locator('#map-search-input').fill('SYNTH-A11-');
    const [publishedId, submittedId, unmappedId] = mapIds;
    await page.getByText(publishedId,{exact:false}).first().waitFor({state:'visible'});
    await page.getByText(submittedId,{exact:false}).first().waitFor({state:'visible'});
    assert.equal(await page.getByText(unmappedId,{exact:false}).count(),0,
      'Invalid-coordinate report must not appear as a marker or mapped list item');
    await page.locator('.leaflet-container').waitFor({state:'visible'});
    assert.ok(await page.locator('path.leaflet-interactive').count() >= 2,
      'Real Leaflet should render both valid geospatial markers');
    console.log('PHASE17_A11_DESKTOP_MAP_SEARCH_TWO_MARKERS_UNMAPPED_GUARD_PASS');

    await page.locator('#map-status-select').selectOption('published');
    await page.getByText(publishedId,{exact:false}).first().waitFor({state:'visible'});
    assert.equal(await page.getByText(submittedId,{exact:false}).count(),0,
      'Status filter must exclude submitted fixture when Published is selected');
    await page.locator('#map-district-select').selectOption('Dhaka');
    await page.getByText(publishedId,{exact:false}).first().waitFor({state:'visible'});
    await page.locator('#map-status-select').selectOption('submitted');
    assert.equal(await page.getByText(publishedId,{exact:false}).count(),0,
      'Combined status/district filter must produce no matched report');
    await page.locator('#map-status-select').selectOption('published');
    console.log('PHASE17_A11_COMBINED_STATUS_AND_DISTRICT_FILTERS_PASS');

    // One explicitly simulated transient HTTP failure must preserve the prior
    // valid map instead of silently clearing the user-visible dataset.
    const failOnce = route => route.fulfill({
      status:503, contentType:'application/json',
      body:JSON.stringify({code:'A11_ISOLATED_TRANSIENT',message:'Temporary local map read failure'}),
    });
    await page.route(rpcPattern, failOnce);
    try {
      await page.getByRole('button',{name:'Refresh',exact:true}).click();
      await page.getByText('Could not refresh latest map data. Displaying previously loaded dataset.')
        .waitFor({state:'visible'});
      await page.getByText(publishedId,{exact:false}).first().waitFor({state:'visible'});
    } finally {
      await page.unroute(rpcPattern, failOnce);
    }
    await page.getByRole('button',{name:'Dismiss',exact:true}).click();
    console.log('PHASE17_A11_REFRESH_FAILURE_PRESERVES_LAST_VALID_DATA_PASS');

    await page.setViewportSize({width:390,height:844});
    await page.getByRole('button',{name:/List View/}).click();
    await page.getByText(publishedId,{exact:false}).first().waitFor({state:'visible'});
    const overflow = await page.evaluate(() =>
      document.documentElement.scrollWidth - document.documentElement.clientWidth);
    assert.ok(overflow <= 1, 'A11 mobile map/list overflow: ' + overflow);
    await page.getByText('A11 synthetic published geospatial report',{exact:true}).first().click();
    await page.getByRole('button',{name:'Close preview'}).waitFor({state:'visible'});
    console.log('PHASE17_A11_MOBILE_LIST_SELECTION_MAP_PREVIEW_NO_OVERFLOW_PASS');
  } finally {
    await page.unroute(tilePattern,tileHandler);
    if(seeded) removeMapReports();
    grantMapPermission(false);
  }
  const after = await authorizedClient.rpc('admin_get_map_dataset');
  assert.ok(after.error, 'Post-test delegated map permission must be revoked');
  assert.equal(readMapRows(),0,'All A11 local SQL reports must be cleaned up');
  console.log('PHASE17_A11_LOCAL_FIXTURE_CLEANUP_ROLE_REVOCATION_PASS');
}
