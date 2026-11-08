import assert from 'node:assert/strict';

/**
 * A15 Role Management — real local React + Supabase Auth email/TOTP AAL2 +
 * PostgreSQL role authorization/RPCs. No hosted or actual admin identities.
 * All synthetic role/permission state is removed before the local runner exits.
 */
export async function runPhase17A15({
  sql,page,browserBaseUrl,authorizedClient,publicClient,roleId,suffix,
}) {
  assert.equal(new URL(browserBaseUrl).origin,'http://127.0.0.1:4173');
  assert.match(roleId,/^synthetic_moderator_[a-f0-9]{8}$/);
  assert.match(suffix,/^[a-f0-9]{8}$/);
  const q=v=>"'"+String(v).replaceAll("'","''")+"'";
  const roleName='A15 Synthetic '+suffix;
  const roleSlug='a15-synthetic-'+suffix;
  const editedName='A15 Updated '+suffix;
  const countRole=()=>Number(sql('SELECT count(*) FROM public.roles WHERE id='+q(roleSlug)));
  const base=browserBaseUrl.replace(/\/$/,'');
  assert.equal(countRole(),0);
  const anon=await publicClient.rpc('admin_list_roles');
  assert.ok(anon.error,'Anonymous role list must fail closed');
  assert.equal(anon.error.code,'42501');
  const before=await authorizedClient.rpc('admin_list_roles');
  assert.ok(before.error,'AAL2 operator lacking roles.manage must be denied');
  assert.equal(before.error.code,'42501');
  await page.goto(base+'/#/roles',{waitUntil:'domcontentloaded'});
  await page.getByText('Access Restricted',{exact:true}).waitFor({state:'visible'});
  assert.equal(await page.locator('#header-create-role-btn').count(),0);
  console.log('PHASE17_A15_ANON_AND_UNGRANTED_ROLE_RPC_AND_UI_DENIAL_PASS');

  let granted=false,seededDangerPermission=false;
  try {
    sql("INSERT INTO public.permissions(id,module,action,name_en,name_bn) VALUES "+
      "('roles.manage','roles','manage','Manage Roles','ভূমিকা পরিচালনা') "+
      'ON CONFLICT(id) DO NOTHING');
    // The test's elevated but ungranted capability must exist in the local
    // catalogue; never alter a live permissions catalogue.
    if(Number(sql("SELECT count(*) FROM public.permissions WHERE id='admin_users.manage'"))===0){
      sql("INSERT INTO public.permissions(id,module,action,name_en,name_bn) "+
        "VALUES('admin_users.manage','admin_users','manage','Manage Users','ব্যবহারকারী পরিচালনা')");
      seededDangerPermission=true;
    }
    sql('INSERT INTO public.role_permissions(role_id,permission_id) VALUES ('+
      q(roleId)+",'roles.manage') ON CONFLICT DO NOTHING");
    granted=true;
    const permitted=await authorizedClient.rpc('has_permission',{p_permission_id:'roles.manage'});
    assert.ifError(permitted.error);
    assert.equal(permitted.data,true);
    const forbidden=await authorizedClient.rpc('has_permission',{p_permission_id:'admin_users.manage'});
    assert.ifError(forbidden.error);
    assert.equal(forbidden.data,false);
    const escalate=await authorizedClient.rpc('admin_create_role',{
      p_name_en:'A15 Forbidden '+suffix,p_name_bn:null,p_active:true,
      p_permission_ids:['admin_users.manage'],p_description:null,
    });
    assert.ok(escalate.error,'Delegated manager cannot assign permissions beyond ceiling');
    assert.equal(escalate.error.code,'42501');
    assert.equal(Number(sql("SELECT count(*) FROM public.roles WHERE name_en="+
      q('A15 Forbidden '+suffix))),0);
    console.log('PHASE17_A15_DELEGATION_CEILING_PREVENTS_ESCALATION_PASS');

    await page.setViewportSize({width:1280,height:850});
    await page.goto(base+'/#/roles',{waitUntil:'domcontentloaded'});
    await page.reload({waitUntil:'domcontentloaded'});
    const create=page.locator('#header-create-role-btn');
    try {await create.waitFor({state:'visible',timeout:9000});}
    catch {await page.reload({waitUntil:'domcontentloaded'});await create.waitFor({state:'visible',timeout:15000});}
    await create.click();
    await page.locator('#role-name-en-input').fill(roleName);
    await page.locator('#role-name-bn-input').fill('পরীক্ষামূলক ভূমিকা');
    await page.locator('#role-description-textarea').fill('Disposable role acceptance A15');
    await page.locator('#step1-next-btn').click();
    await page.locator('#step2-next-btn').waitFor({state:'visible',timeout:15000});
    await page.locator('#step2-next-btn').click();
    await page.locator('#create-role-submit-btn').waitFor({state:'visible',timeout:15000});
    // Require a real protected RPC response; a wizard click is not persistence.
    const submitResponse=page.waitForResponse(response=>
      response.url().includes('/rest/v1/rpc/admin_create_role'),{timeout:15000});
    await page.locator('#create-role-submit-btn').click();
    const createdResponse=await submitResponse;
    const createBody=await createdResponse.text();
    if(!createdResponse.ok()) {
      console.log('A15_LOCAL_CREATE_RPC_DIAGNOSTIC',JSON.stringify({
        status:createdResponse.status(),body:createBody.slice(0,950),
        url:page.url(),count:countRole(),
      }));
    }
    assert.equal(createdResponse.status(),200,'A15 real UI create-role RPC must succeed');
    try {
      await page.locator('#refresh-roles-btn').waitFor({state:'visible',timeout:7500});
    } catch {
      console.log('A15_LOCAL_CREATE_NAV_DIAGNOSTIC',JSON.stringify({
        url:page.url(),count:countRole(),
        body:(await page.locator('body').innerText()).slice(-1600),
      }));
      throw new Error('A15 UI create-role did not navigate after protected RPC success');
    }
    assert.equal(countRole(),1,'Role must persist through actual UI and protected SQL');
    assert.equal(sql('SELECT name_en FROM public.roles WHERE id='+q(roleSlug)),roleName);
    const readable=await authorizedClient.rpc('admin_get_role_detail',{p_role_id:roleSlug});
    assert.ifError(readable.error);
    assert.equal(readable.data.id,roleSlug);
    assert.deepEqual(readable.data.permission_ids,[]);
    console.log('PHASE17_A15_REAL_BILINGUAL_UI_CREATE_SQL_ROLE_DETAIL_PASS');

    await page.goto(base+'/#/roles/'+roleSlug+'/edit',{waitUntil:'domcontentloaded'});
    await page.locator('#edit-role-name').waitFor({state:'visible'});
    await page.locator('#edit-role-name').fill(editedName);
    await page.locator('#edit-role-save-btn').click();
    await page.locator('#edit-role-btn').waitFor({state:'visible',timeout:15000});
    assert.equal(sql('SELECT name_en FROM public.roles WHERE id='+q(roleSlug)),editedName);
    console.log('PHASE17_A15_REAL_UI_UPDATE_PRESERVES_IMMUTABLE_ROLE_ID_PASS');

    const validReplace=await authorizedClient.rpc('admin_replace_role_permissions',{
      p_role_id:roleSlug,p_permission_ids:['dashboard.view'],
    });
    assert.ifError(validReplace.error);
    assert.equal(Number(sql('SELECT count(*) FROM public.role_permissions WHERE role_id='+
      q(roleSlug)+" AND permission_id='dashboard.view'")),1);
    const illegalReplace=await authorizedClient.rpc('admin_replace_role_permissions',{
      p_role_id:roleSlug,p_permission_ids:['admin_users.manage'],
    });
    assert.ok(illegalReplace.error,'Role permission replacement must enforce delegation ceiling');
    assert.equal(illegalReplace.error.code,'42501');
    assert.equal(Number(sql('SELECT count(*) FROM public.role_permissions WHERE role_id='+
      q(roleSlug)+" AND permission_id='admin_users.manage'")),0);
    console.log('PHASE17_A15_ATOMIC_PERMISSION_REPLACE_AND_CEILING_DENIAL_PASS');

    await page.setViewportSize({width:390,height:844});
    await page.goto(base+'/#/roles',{waitUntil:'domcontentloaded'});
    await page.locator('#refresh-roles-btn').waitFor({state:'visible'});
    const overflow=await page.evaluate(()=>document.documentElement.scrollWidth-
      document.documentElement.clientWidth);
    assert.ok(overflow<=1,'Roles list mobile page horizontal overflow: '+overflow);
    console.log('PHASE17_A15_MOBILE_ROLES_LIST_NO_PAGE_OVERFLOW_PASS');
  } finally {
    sql('DELETE FROM public.role_permissions WHERE role_id='+q(roleSlug));
    sql('DELETE FROM public.roles WHERE id='+q(roleSlug));
    if(granted)sql('DELETE FROM public.role_permissions WHERE role_id='+
      q(roleId)+" AND permission_id='roles.manage'");
    if(seededDangerPermission)sql("DELETE FROM public.permissions WHERE id='admin_users.manage' "+
      "AND NOT EXISTS (SELECT 1 FROM public.role_permissions WHERE permission_id='admin_users.manage')");
  }
  assert.equal(countRole(),0,'Every synthetic A15 role must be removed');
  const revoked=await authorizedClient.rpc('has_permission',{p_permission_id:'roles.manage'});
  assert.ifError(revoked.error);
  assert.equal(revoked.data,false);
  console.log('PHASE17_A15_LOCAL_ROLE_CLEANUP_AND_DELEGATION_REVOCATION_PASS');
}
