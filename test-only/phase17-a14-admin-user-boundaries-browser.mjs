import assert from 'node:assert/strict';

// A14 scoped Admin Users RLS/permission negative and read-only list browser.
// It MUST run only under the existing disposable AAL2 session on loopback.
// Creating/deleting real users is deliberately excluded from this subcheck.
export async function runPhase17A14({sql,page,browserBaseUrl,authorizedClient,publicClient,userId,roleId}) {
  assert.equal(new URL(browserBaseUrl).origin,'http://127.0.0.1:4173');
  assert.match(userId,/^[a-f0-9-]{36}$/i);
  assert.match(roleId,/^synthetic_moderator_[a-f0-9]{8}$/);
  const quote=s=>"'"+s.replaceAll("'","''")+"'";
  const params={p_limit:10,p_offset:0};
  const anon=await publicClient.rpc('admin_get_users',params);
  assert.ok(anon.error,'Anonymous admin user list must fail');
  assert.equal(anon.error.code,'42501');
  const anonDetail=await publicClient.rpc('admin_get_user',{p_user_id:userId});
  assert.ok(anonDetail.error,'Anonymous user detail must fail');
  assert.equal(anonDetail.error.code,'42501');
  const denied=await authorizedClient.rpc('admin_get_users',params);
  assert.ok(denied.error,'Delegated non-user-management admin must not see user list');
  assert.equal(denied.error.code,'42501');
  console.log('PHASE17_A14_ANONYMOUS_AND_UNGRANTED_USER_READ_DENIED_PASS');
  const route=browserBaseUrl.replace(/\/$/,'')+'/#/users';
  await page.setViewportSize({width:1280,height:850});
  await page.goto(route,{waitUntil:'domcontentloaded'});
  await page.getByText('Access Restricted',{exact:true}).waitFor({state:'visible'});
  assert.equal(await page.locator('#admin-users-page').count(),0);
  console.log('PHASE17_A14_REAL_UI_UNGRANTED_USERS_ROUTE_DENIED_PASS');
  let granted=false;
  try {
    sql("INSERT INTO public.permissions(id,module,action,name_en,name_bn) VALUES "+
      "('admin_users.view','admin_users','view','View Administrators','প্রশাসক দেখুন') "+
      'ON CONFLICT (id) DO NOTHING');
    sql("INSERT INTO public.role_permissions(role_id,permission_id) VALUES ("+
      quote(roleId)+",'admin_users.view') ON CONFLICT DO NOTHING");
    granted=true;
    const profile=await authorizedClient.rpc('has_permission',{p_permission_id:'admin_users.view'});
    assert.ifError(profile.error);
    assert.equal(profile.data,true);
    const cannotManage=await authorizedClient.rpc('has_permission',{p_permission_id:'admin_users.manage'});
    assert.ifError(cannotManage.error);
    assert.equal(cannotManage.data,false);
    const listed=await authorizedClient.rpc('admin_get_users',params);
    assert.ifError(listed.error);
    assert.ok(Array.isArray(listed.data?.users));
    assert.ok(listed.data.users.some(x=>x.user_id===userId));
    const invalidSort=await authorizedClient.rpc('admin_get_users',{
      ...params,p_sort_by:'unapproved_sql_expression',
    });
    assert.ok(invalidSort.error,'User listing must reject nonallowlisted sort fields');
    assert.equal(invalidSort.error.code,'22000');
    console.log('PHASE17_A14_VIEW_ONLY_SQL_SCOPE_PAGINATION_AND_SORT_GUARD_PASS');
    await page.goto(route,{waitUntil:'domcontentloaded'});
    await page.reload({waitUntil:'domcontentloaded'});
    const users=page.locator('#admin-users-page');
    try {await users.waitFor({state:'visible',timeout:9000});}
    catch {await page.reload({waitUntil:'domcontentloaded'});await users.waitFor({state:'visible',timeout:14000});}
    await page.locator('#btn-refresh-users').waitFor({state:'visible'});
    assert.equal(await page.locator('#btn-create-user').count(),0,
      'Read-only delegated administrator must not see create-user CTA');
    await page.locator('#input-search-users').fill('Synthetic Map Read Delegate');
    // Search input is server-backed and may debounce. Await the actual row.
    await page.getByText('Synthetic Map Read Delegate',{exact:false}).first().waitFor({state:'visible'});
    await page.locator('#select-filter-status').selectOption('inactive');
    await page.locator('#select-filter-status').selectOption('all');
    await page.locator('#input-search-users').fill('');
    console.log('PHASE17_A14_REAL_VIEW_ONLY_USERS_SEARCH_STATUS_AND_NO_CREATE_PASS');
    await page.setViewportSize({width:390,height:844});
    const overflow=await page.evaluate(()=>document.documentElement.scrollWidth-document.documentElement.clientWidth);
    assert.ok(overflow<=1,'A14 Admin Users mobile overflow '+overflow);
    await page.goto(browserBaseUrl.replace(/\/$/,'')+'/#/users/create',{waitUntil:'domcontentloaded'});
    await page.getByText('Access Restricted',{exact:true}).waitFor({state:'visible'});
    assert.equal(await page.locator('#create-user-page').count(),0);
    console.log('PHASE17_A14_MOBILE_READ_ONLY_AND_PROTECTED_CREATION_DENIED_PASS');
  } finally {
    if(granted) sql("DELETE FROM public.role_permissions WHERE role_id="+quote(roleId)+
      " AND permission_id='admin_users.view'");
  }
  const after=await authorizedClient.rpc('has_permission',{p_permission_id:'admin_users.view'});
  assert.ifError(after.error);
  assert.equal(after.data,false);
  console.log('PHASE17_A14_LOCAL_VIEW_PERMISSION_REVOKED_PASS');
}
