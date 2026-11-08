import assert from 'node:assert/strict';

/**
 * A16 real Audit Activity: inspect immutable role audit events actually emitted
 * by A15's disposable Auth/SQL/UI lifecycle. No fabricated or hosted data.
 * All network must remain on 127.0.0.1, delegated audit.view is revoked.
 */
export async function runPhase17A16({
  sql,page,browserBaseUrl,authorizedClient,publicClient,userId,roleId,suffix,
}) {
  assert.equal(new URL(browserBaseUrl).origin,'http://127.0.0.1:4173');
  assert.match(userId,/^[0-9a-f-]{36}$/i);
  assert.match(suffix,/^[0-9a-f]{8}$/);
  assert.match(roleId,/^synthetic_moderator_[0-9a-f]{8}$/);
  const q=v=>"'"+String(v).replaceAll("'","''")+"'";
  const roleSlug='a15-synthetic-'+suffix;
  const origin=browserBaseUrl.replace(/\/$/,'');
  const baseArgs={p_limit:15,p_offset:0,p_search:roleSlug,p_actor_id:userId};
  const count=()=>Number(sql('SELECT count(*) FROM public.admin_audit_logs WHERE lower(btrim(target_type))=\'role\' AND target_id='+
    q(roleSlug)+' AND actor_id='+q(userId)));
  assert.ok(count()>=3,'A16 needs genuine A15 created/updated/permission-replaced audit events');
  const anon=await publicClient.rpc('admin_list_audit_logs',baseArgs);
  assert.ok(anon.error,'Public anon must not see private audit history');
  assert.equal(anon.error.code,'42501');
  const denied=await authorizedClient.rpc('admin_list_audit_logs',baseArgs);
  assert.ok(denied.error,'AAL2 without audit.view must be denied');
  assert.equal(denied.error.code,'42501');
  const direct=await authorizedClient.from('admin_audit_logs').select('id').limit(1);
  assert.ok(direct.error || !direct.data?.length,
    'Raw administrative audit table must not be publicly readable');
  await page.setViewportSize({width:1280,height:850});
  await page.goto(origin+'/#/activity-log',{waitUntil:'domcontentloaded'});
  await page.getByText('Access Restricted',{exact:true}).waitFor({state:'visible'});
  assert.equal(await page.locator('#admin-activity-log-page').count(),0);
  console.log('PHASE17_A16_ANON_UNGRANTED_RLS_RPC_AND_BROWSER_DENIED_PASS');

  let granted=false;
  try {
    sql("INSERT INTO public.permissions(id,module,action,name_en,name_bn) VALUES "+
      "('audit.view','audit','view','View Audit History','অডিট ইতিহাস দেখুন') "+
      'ON CONFLICT(id) DO NOTHING');
    sql('INSERT INTO public.role_permissions(role_id,permission_id) VALUES ('+
      q(roleId)+",'audit.view') ON CONFLICT DO NOTHING");
    granted=true;
    const allowed=await authorizedClient.rpc('has_permission',{p_permission_id:'audit.view'});
    assert.ifError(allowed.error);
    assert.equal(allowed.data,true);
    const result=await authorizedClient.rpc('admin_list_audit_logs',baseArgs);
    assert.ifError(result.error);
    const events=result.data?.logs;
    assert.ok(Array.isArray(events));
    assert.ok(events.length>=3);
    assert.equal(Number(result.data.total_count),count(),
      'RPC must match immutable A15 PostgreSQL audit history');
    assert.ok(events.every(event=>event.actor_id===userId &&
      event.target_id===roleSlug && event.target_type==='role'));
    for(const action of ['ROLE_CREATED','ROLE_UPDATED','ROLE_PERMISSIONS_REPLACED']) {
      assert.ok(events.some(event=>event.action===action),
        'Actual role lifecycle must log immutable '+action);
    }
    const single=await authorizedClient.rpc('admin_list_audit_logs',{
      ...baseArgs,p_limit:1,p_offset:1,
    });
    assert.ifError(single.error);
    assert.equal(single.data.logs.length,1);
    assert.equal(Number(single.data.total_count),count());
    const future=await authorizedClient.rpc('admin_list_audit_logs',{
      ...baseArgs,p_date_from:'2100-01-01T00:00:00Z',
    });
    assert.ifError(future.error);
    assert.equal(Number(future.data.total_count),0);
    const created=await authorizedClient.rpc('admin_list_audit_logs',{
      ...baseArgs,p_action:'ROLE_CREATED',p_target_type:'role',
    });
    assert.ifError(created.error);
    assert.equal(Number(created.data.total_count),1);
    const createdId=created.data.logs[0].id;
    console.log('PHASE17_A16_PROTECTED_SQL_TRUE_LIFECYCLE_AUDIT_FILTER_PAGING_PASS');

    await page.goto(origin+'/#/activity-log',{waitUntil:'domcontentloaded'});
    await page.reload({waitUntil:'domcontentloaded'});
    const activity=page.locator('#admin-activity-log-page');
    try {await activity.waitFor({state:'visible',timeout:9000});}
    catch {await page.reload({waitUntil:'domcontentloaded'});await activity.waitFor({state:'visible',timeout:14000});}
    await page.locator('#activity-search-input').fill(roleSlug);
    await page.locator('#audit-row-'+createdId).waitFor({state:'visible',timeout:14000});
    await page.locator('#activity-action-select').selectOption('ROLE_CREATED');
    await page.locator('#activity-target-type-select').selectOption('role');
    await page.waitForFunction(()=>document.querySelectorAll('#activity-logs-table tbody tr').length===1,
      {timeout:14000});
    assert.equal(await page.locator('#activity-logs-table tbody tr').count(),1);
    await page.locator('#btn-view-log-'+createdId).click();
    await page.locator('#activity-log-detail-content').waitFor({state:'visible'});
    await page.getByText(roleSlug,{exact:true}).first().waitFor({state:'visible'});
    await page.getByRole('button',{name:'Close drawer'}).click();
    console.log('PHASE17_A16_REAL_DESKTOP_SEARCH_ACTION_TARGET_AND_DRAWER_PASS');

    await page.setViewportSize({width:390,height:844});
    await page.locator('#mobile-audit-card-'+createdId).waitFor({state:'visible'});
    const overflow=await page.evaluate(()=>document.documentElement.scrollWidth-
      document.documentElement.clientWidth);
    assert.ok(overflow<=1,'A16 Activity Log mobile horizontal overflow '+overflow);
    await page.locator('#btn-view-mobile-log-'+createdId).click();
    await page.locator('#activity-log-detail-content').waitFor({state:'visible'});
    await page.getByRole('button',{name:'Close drawer'}).click();
    console.log('PHASE17_A16_REAL_MOBILE_AUDIT_CARDS_AND_PRIVATE_DRAWER_PASS');

    const rpcPattern='**/rest/v1/rpc/admin_list_audit_logs';
    const fail=route=>route.fulfill({status:503,contentType:'application/json',
      body:JSON.stringify({code:'A16_LOCAL_OUTAGE',message:'Synthetic audit temporary failure'})});
    await page.route(rpcPattern,fail);
    try {
      await page.locator('#btn-refresh-activity').click();
      await page.locator('#activity-error-banner').waitFor({state:'visible'});
    }finally{
      await page.unroute(rpcPattern,fail);
    }
    await page.locator('#btn-retry-activity').click();
    await page.locator('#mobile-audit-card-'+createdId).waitFor({state:'visible'});
    await page.locator('#activity-error-banner').waitFor({state:'detached'});
    console.log('PHASE17_A16_REAL_TRANSIENT_AUDIT_FAILURE_RETRY_PASS');
  } finally {
    if(granted) sql('DELETE FROM public.role_permissions WHERE role_id='+
      q(roleId)+" AND permission_id='audit.view'");
  }
  const revoked=await authorizedClient.rpc('has_permission',{p_permission_id:'audit.view'});
  assert.ifError(revoked.error);
  assert.equal(revoked.data,false);
  assert.ok(count()>=3,'A16 must not mutate authentic immutable role audit history');
  console.log('PHASE17_A16_AUDIT_REVOCATION_AND_IMMUTABLE_LOCAL_LOG_PRESERVATION_PASS');
}
