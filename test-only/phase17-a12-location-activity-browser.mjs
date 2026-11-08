import assert from 'node:assert/strict';

/**
 * Phase 17 A12: REAL Admin Location Activity UI/SQL/RLS test.
 * The caller uses an existing disposable loopback-only Supabase instance, a
 * fictional temporary AAL2 delegated Admin, and a real local Chromium page.
 * It MUST NOT be run against hosted sessions or actual visitor GPS records.
 */
export async function runPhase17A12({
  sql,roleId,suffix,page,authorizedClient,publicClient,browserBaseUrl,
}) {
  assert.equal(new URL(browserBaseUrl).origin,'http://127.0.0.1:4173');
  assert.match(roleId,/^synthetic_moderator_[a-f0-9]{8}$/);
  assert.match(suffix,/^[a-f0-9]{8}$/);
  const ids=['GRT','DNY','OLD'].map(kind => 'SYNTH-A12-'+kind+'-'+suffix.toUpperCase());
  const prefix='SYNTH-A12-';
  const marker="'"+prefix+"%'";
  const exec=text=>sql(text);
  const count=()=>Number(exec('SELECT count(*) FROM public.public_visit_sessions WHERE visitor_id LIKE '+marker));
  const selectSynthetic=client=>client.from('public_visit_sessions')
    .select('visitor_id,session_id,permission_status,latitude,longitude,browser_name,device_category')
    .like('visitor_id',prefix+'%').order('visitor_id');

  assert.equal(count(),0,'Disposable A12 test must start without leftover sessions');
  const initiallyDenied=await selectSynthetic(authorizedClient);
  assert.ifError(initiallyDenied.error);
  assert.deepEqual(initiallyDenied.data,[],'AAL2 without location_activity.view must see zero rows');
  const anonymousDenied=await selectSynthetic(publicClient);
  // Hosted/local schema intentionally does not GRANT SELECT to anon, so
  // explicit SQL 42501 denial or RLS-filtered empty data are both fail-closed.
  if(anonymousDenied.error) {
    assert.equal(anonymousDenied.error.code,'42501');
  } else {
    assert.deepEqual(anonymousDenied.data,[],
      'Anonymous caller must not see visitor sessions');
  }
  const permissionBefore=await authorizedClient.rpc('has_permission',{p_permission_id:'location_activity.view'});
  assert.ifError(permissionBefore.error);
  assert.equal(permissionBefore.data,false);
  console.log('PHASE17_A12_ANON_AND_UNGRANTED_AAL2_RLS_DENIED_PASS');

  let granted=false,seeded=false;
  const grant=(yes)=>{
    if(yes)exec("INSERT INTO public.permissions(id,module,action,name_en,name_bn) " +
      "VALUES ('location_activity.view','location_activity','view','Synthetic Location View',"+
      "'পরীক্ষামূলক লোকেশন ভিউ') ON CONFLICT (id) DO NOTHING");
    if(yes)exec("INSERT INTO public.role_permissions(role_id,permission_id) VALUES ('"+
      roleId+"','location_activity.view') ON CONFLICT DO NOTHING");
    else exec("DELETE FROM public.role_permissions WHERE role_id='"+roleId+
      "' AND permission_id='location_activity.view'");
  };
  try {
    grant(true);
    granted=true;
    const fixtures=[
      {id:ids[0],status:'granted',lat:'23.780600',lng:'90.407400',
       accuracy:'55.00',browser:'Chrome',device:'desktop',when:'now()'},
      {id:ids[1],status:'denied',lat:'NULL',lng:'NULL',
       accuracy:'NULL',browser:'Firefox',device:'mobile',when:'now()'},
      {id:ids[2],status:'prompt',lat:'NULL',lng:'NULL',
       accuracy:'NULL',browser:'Edge',device:'tablet',when:"now()-interval '10 days'"},
    ];
    for(const f of fixtures) {
      exec('INSERT INTO public.public_visit_sessions('+
        'visitor_id,session_id,permission_status,latitude,longitude,accuracy_meters,'+
        'browser_name,browser_version,os_name,device_category,platform,language,timezone,'+
        'screen_width,screen_height,first_seen_at,last_seen_at,consented_at) VALUES ('+
        "'"+f.id+"','"+f.id+"-S','"+f.status+"',"+f.lat+','+f.lng+','+f.accuracy+','+
        "'"+f.browser+"','1.0','SyntheticOS','"+f.device+"','QA','en','Asia/Dhaka',"+
        "390,844,"+f.when+','+f.when+','+(f.status==='granted'?'now()':'NULL')+')');
    }
    seeded=true;
    assert.equal(count(),3);
    const allowed=await authorizedClient.rpc('has_permission',{p_permission_id:'location_activity.view'});
    assert.ifError(allowed.error);
    assert.equal(allowed.data,true);
    const rows=await selectSynthetic(authorizedClient);
    assert.ifError(rows.error);
    assert.equal(rows.data.length,3,'Only three synthetic local records may be visible');
    const grantedRow=rows.data.find(r=>r.visitor_id===ids[0]);
    const deniedRow=rows.data.find(r=>r.visitor_id===ids[1]);
    assert.ok(grantedRow && deniedRow);
    assert.equal(Number(grantedRow.latitude),23.7806);
    assert.equal(deniedRow.latitude,null);
    assert.equal(deniedRow.longitude,null);
    console.log('PHASE17_A12_AUTHORIZED_AAL2_SQL_KPIS_AND_CONSENT_GPS_PARITY_PASS');

    await page.setViewportSize({width:1280,height:850});
    const origin=browserBaseUrl.replace(/\/$/,'');
    await page.goto(origin+'/#/location-activity',{waitUntil:'domcontentloaded'});
    await page.getByRole('heading',{name:'Location Activity',exact:true,level:1}).waitFor({state:'visible'});
    const search=page.getByPlaceholder('Search by Visitor ID, Session ID, Browser, OS, Platform, Timezone...');
    try {
      await search.waitFor({state:'visible',timeout:9000});
    } catch {
      await page.reload({waitUntil:'domcontentloaded'});
      await search.waitFor({state:'visible',timeout:13000});
    }
    await search.fill(prefix);
    await page.getByText('Showing 3 of 3 total sessions').waitFor({state:'visible'});
    assert.equal(await page.locator('tbody tr').count(),3);
    console.log('PHASE17_A12_REAL_DESKTOP_SEARCH_AND_SQL_PAGINATION_PASS');

    const statusSelect=page.locator('select:has(option[value="granted"])');
    const deviceSelect=page.locator('select:has(option[value="desktop"])');
    const timeSelect=page.locator('select:has(option[value="24h"])');
    await statusSelect.selectOption('granted');
    await page.getByText('Showing 1 of 1 total sessions').waitFor({state:'visible'});
    assert.equal(await page.locator('tbody tr').count(),1);
    await page.locator('tbody tr').first().click();
    await page.getByText('Session & Location Details',{exact:true}).waitFor({state:'visible'});
    await page.getByText(ids[0]+'-S',{exact:true}).first().waitFor({state:'visible'});
    await page.getByText('23.780600',{exact:true}).first().waitFor({state:'visible'});
    await page.getByRole('button',{name:'Close',exact:true}).last().click();
    console.log('PHASE17_A12_GRANTED_LOCATION_DETAIL_ONLY_AUTHORIZED_PASS');

    await statusSelect.selectOption('denied');
    await deviceSelect.selectOption('mobile');
    await page.getByText('Showing 1 of 1 total sessions').waitFor({state:'visible'});
    await page.locator('tbody tr').first().click();
    await page.getByText('Visitor did not grant location permission.').waitFor({state:'visible'});
    assert.equal(await page.getByText('23.780600',{exact:true}).count(),0,
      'Denied session must never display coordinates of granted session');
    await page.getByRole('button',{name:'Close',exact:true}).last().click();
    await statusSelect.selectOption('granted');
    await page.getByText('Showing 0 of 0 total sessions').waitFor({state:'visible'});
    console.log('PHASE17_A12_COMBINED_PERMISSION_DEVICE_AND_DENIED_LOCATION_PRIVACY_PASS');

    await page.getByRole('button',{name:'Reset Filters',exact:true}).click();
    await page.getByText('Showing 3 of 3 total sessions').waitFor({state:'visible'});
    await timeSelect.selectOption('24h');
    await page.getByText('Showing 2 of 2 total sessions').waitFor({state:'visible'});
    console.log('PHASE17_A12_24H_FILTER_AND_RESET_PASS');

    await page.setViewportSize({width:390,height:844});
    await search.fill(prefix);
    await page.getByText('Showing 2 of 2 total sessions').waitFor({state:'visible'});
    const overflow=await page.evaluate(()=>document.documentElement.scrollWidth-
      document.documentElement.clientWidth);
    assert.ok(overflow<=1,'A12 mobile horizontal overflow '+overflow);
    await page.getByRole('button',{name:'View',exact:true}).first().click();
    await page.getByText('Session & Location Details',{exact:true}).waitFor({state:'visible'});
    await page.getByRole('button',{name:'Close',exact:true}).last().click();
    console.log('PHASE17_A12_MOBILE_CARD_DRAWER_NO_OVERFLOW_PASS');

    // A single transient SQL REST failure must show existing Retry, not silently
    // fabricate a successful zero-row result. No hosted endpoints are involved.
    const fail=route=>route.fulfill({status:503,contentType:'application/json',
      body:JSON.stringify({code:'A12_LOCAL_TRANSIENT',message:'Synthetic temporary read failure'})});
    await page.route('**/rest/v1/public_visit_sessions*',fail);
    try {
      await page.getByRole('button',{name:'Refresh',exact:true}).click();
      await page.getByRole('button',{name:'Retry',exact:true}).waitFor({state:'visible'});
    } finally {
      await page.unroute('**/rest/v1/public_visit_sessions*',fail);
    }
    await page.getByRole('button',{name:'Retry',exact:true}).click();
    await page.getByText('Showing 2 of 2 total sessions').waitFor({state:'visible'});
    console.log('PHASE17_A12_TRANSIENT_READ_FAILURE_RETRY_RECOVERY_PASS');
  } finally {
    if(seeded)exec("DELETE FROM public.public_visit_sessions WHERE visitor_id LIKE "+marker);
    if(granted)grant(false);
  }
  assert.equal(count(),0,'Every fictional visitor session must be removed');
  const deniedAfter=await selectSynthetic(authorizedClient);
  assert.ifError(deniedAfter.error);
  assert.deepEqual(deniedAfter.data,[],'Delegated access must be revoked after A12');
  console.log('PHASE17_A12_LOCAL_SQL_ROWS_AND_DELEGATED_PERMISSION_REVOKED_PASS');
}
