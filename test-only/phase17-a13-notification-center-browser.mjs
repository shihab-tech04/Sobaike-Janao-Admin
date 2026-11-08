import assert from 'node:assert/strict';

// A13: ONLY disposable SQL, a synthetic delegated AAL2 Admin, and the true
// local React Notification Center. Never point this at hosted production.
export async function runPhase17A13({sql,page,browserBaseUrl,authorizedClient,publicClient,userId}) {
  assert.equal(new URL(browserBaseUrl).origin,'http://127.0.0.1:4173');
  assert.match(userId,/^[0-9a-f-]{36}$/i);
  const quote=s=>"'"+s.replaceAll("'","''")+"'";
  const fixturePrefix='A13 synthetic private QA notification ';
  const count=()=>Number(sql("SELECT count(*) FROM public.admin_notifications "+
    "WHERE recipient_user_id="+quote(userId)+" AND title_en LIKE "+quote(fixturePrefix+'%')));
  const sqlRead=(id)=>sql("SELECT CASE WHEN read_at IS NULL THEN 'unread' ELSE 'read' END "+
    "FROM public.admin_notifications WHERE id="+quote(id)+" AND recipient_user_id="+quote(userId));
  assert.equal(count(),0,'A13 local fixture must start empty');
  const anonymous=await publicClient.rpc('admin_list_notifications',{p_limit:10});
  assert.ok(anonymous.error,'Anonymous caller must be denied privileged notification RPC');
  assert.equal(anonymous.error.code,'42501');
  const anonMark=await publicClient.rpc('admin_mark_notification_read',{
    p_notification_id:'00000000-0000-4000-8000-000000000000',
  });
  assert.ok(anonMark.error,'Anonymous caller must not mark notification read');
  console.log('PHASE17_A13_ANON_LIST_AND_READ_DENIED_PASS');

  const records=[];
  const seededCatalogue=[];
  const cleanup=()=>{
    sql('DELETE FROM public.admin_notifications WHERE recipient_user_id='+quote(userId)+
      ' AND title_en LIKE '+quote(fixturePrefix+'%'));
  };
  try {
    // The recovered disposable SQL schema can be intentionally devoid of
    // canonical catalogue seed data; honour its real FK, do not disable it.
    for (const [key,layer,severity] of [
      ['role.created','administrative_oversight','info'],
      ['role.permissions_changed','security_privilege','security'],
    ]) {
      const existing=Number(sql('SELECT count(*) FROM public.admin_notification_event_catalogue WHERE event_key='+quote(key)));
      if(!existing) {
        sql('INSERT INTO public.admin_notification_event_catalogue(event_key,category,default_layer,default_severity,active) VALUES ('+
          quote(key)+",'role',"+quote(layer)+','+quote(severity)+',true)');
        seededCatalogue.push(key);
      }
    }
    // 18 distinct, timestamp-ordered and recipient-scoped rows: real keyset
    // pagination (15+3), a security event, an older read item and an access
    // restricted role notification for an unauthorized delegated Admin.
    for(let i=0;i<18;i++){
      const gated=i===17;
      const security=i===16;
      const event=security?'role.permissions_changed':'role.created';
      const layer=security?'security_privilege':'administrative_oversight';
      const severity=security?'security':'info';
      const eventLabel=fixturePrefix+String(i).padStart(2,'0');
      const unreadSql=(i===15?'now()': 'NULL');
      const required=gated?"ARRAY['roles.manage']::text[]":"'{}'::text[]";
      const audience=gated?'permission':'personal';
      const query="INSERT INTO public.admin_notifications("+
        "event_group_id,recipient_user_id,event_key,category,layer,severity,audience_mode,"+
        "title_en,title_bn,body_en,body_bn,required_all_permissions,created_at,read_at) VALUES ("+
        "gen_random_uuid(),"+quote(userId)+","+quote(event)+",'role',"+quote(layer)+","+
        quote(severity)+","+quote(audience)+","+quote(eventLabel)+","+
        quote('পরীক্ষামূলক বিজ্ঞপ্তি '+i)+","+
        quote('Synthetic disposable event only')+","+quote('শুধুমাত্র পরীক্ষা')+","+
        required+",now()-interval '"+(i+1)+" minutes',"+unreadSql+") RETURNING id";
      // psql also prints the command tag `INSERT 0 1`; use the returned UUID row.
      const rowId=sql(query).trim().split(/\r?\n/)[0];
      assert.match(rowId,/^[0-9a-f-]{36}$/i);
      records.push({id:rowId,index:i,gated});
    }
    assert.equal(count(),18);
    const visible=await authorizedClient.rpc('admin_list_notifications',{p_limit:50});
    assert.ifError(visible.error);
    const own=visible.data.filter(x=>records.some(y=>y.id===x.id));
    assert.equal(own.length,17,'A13 delegated account must not read a roles.manage-gated row');
    assert.ok(!own.some(x=>x.id===records[17].id));
    const unread=await authorizedClient.rpc('admin_get_unread_notification_count');
    assert.ifError(unread.error);
    assert.ok(unread.data>=16,'Expected 16 synthetic visible unread notifications');
    const unauthorizedMark=await authorizedClient.rpc('admin_mark_notification_read',{
      p_notification_id:records[17].id,
    });
    assert.ifError(unauthorizedMark.error);
    assert.equal(unauthorizedMark.data,false);
    console.log('PHASE17_A13_RLS_RECIPIENT_AND_ROLE_SCOPE_AND_SQL_RPC_PASS');

    await page.setViewportSize({width:1280,height:850});
    await page.goto(browserBaseUrl.replace(/\/$/,'')+'/#/notifications',{waitUntil:'domcontentloaded'});
    const topRow=page.locator('#notification-card-'+records[0].id);
    try {await topRow.waitFor({state:'visible',timeout:8000});}
    catch {
      await page.reload({waitUntil:'domcontentloaded'});
      await topRow.waitFor({state:'visible',timeout:12000});
    }
    // 15 per page; then load remaining items by the real keyset backend.
    const visibleCards=()=>page.locator('div[id^="notification-card-"]');
    assert.equal(await visibleCards().count(),15);
    assert.equal(await page.locator('#notification-card-'+records[17].id).count(),0);
    await page.locator('#notifications-load-more-btn').click();
    await page.locator('#notification-card-'+records[16].id).waitFor({state:'visible'});
    assert.equal(await visibleCards().count(),17);
    console.log('PHASE17_A13_REAL_UI_KEYSET_PAGINATION_NO_GATED_LEAK_PASS');

    await page.locator('#notification-filter-tab-security').click();
    await page.locator('#notification-card-'+records[16].id).waitFor({state:'visible'});
    await page.waitForFunction(()=>document.querySelectorAll('[id^="notification-card-"]').length===1);
    assert.equal(await visibleCards().count(),1,
      'A13 security filter must show only the security event');
    await page.locator('#notification-filter-tab-unread').click();
    await page.locator('#notification-card-'+records[0].id).waitFor({state:'visible'});
    await page.waitForFunction(()=>document.querySelectorAll('[id^="notification-card-"]').length===15);
    assert.equal(await page.locator('#notification-card-'+records[15].id).count(),0,
      'Previously-read notification must be absent from Unread');
    const firstId=records[0].id;
    await page.locator('#mark-read-btn-'+firstId).click();
    await page.locator('#notification-card-'+firstId).waitFor({state:'detached'});
    assert.equal(sqlRead(firstId),'read','Mark read must persist in Postgres');
    console.log('PHASE17_A13_FILTER_SECURITY_UNREAD_AND_SINGLE_READ_SQL_PASS');

    await page.locator('#notification-filter-tab-all').click();
    await page.locator('#notification-card-'+records[1].id).waitFor({state:'visible'});
    await page.locator('#notifications-mark-all-read-btn').click();
    await page.waitForFunction(()=>!document.querySelector('#notifications-mark-all-read-btn')?.disabled,
      {timeout:3000}).catch(()=>{}); // disabled is expected once unread count is zero
    const finalUnread=await authorizedClient.rpc('admin_get_unread_notification_count');
    assert.ifError(finalUnread.error);
    assert.equal(Number(finalUnread.data),0,
      'Mark-all-read must persist for every visible delegated notification');
    assert.equal(sqlRead(records[17].id),'unread',
      'Mark-all must not mark inaccessible role-gated notification');
    console.log('PHASE17_A13_MARK_ALL_READ_SERVER_SCOPE_PASS');

    // Change to mobile without changing any production CSS or components.
    await page.setViewportSize({width:390,height:844});
    const overflow=await page.evaluate(()=>
      document.documentElement.scrollWidth-document.documentElement.clientWidth);
    assert.ok(overflow<=1,'Notification Center mobile overflow: '+overflow);
    await page.locator('#notifications-refresh-btn').click();
    await page.locator('#notification-card-'+records[0].id).waitFor({state:'visible'});
    console.log('PHASE17_A13_MOBILE_REFRESH_AND_RESPONSIVE_PASS');

    // Controlled synthetic RPC outage must display a genuine Retry, then recover.
    const rpcPattern='**/rest/v1/rpc/admin_list_notifications';
    const fail=route=>route.fulfill({status:503,contentType:'application/json',
      body:JSON.stringify({code:'A13_LOCAL_OUTAGE',message:'Synthetic notification failure'})});
    await page.route(rpcPattern,fail);
    try{
      await page.locator('#notifications-refresh-btn').click();
      await page.getByText('Synthetic notification failure').first().waitFor({state:'visible'});
    }finally{
      await page.unroute(rpcPattern,fail);
    }
    await page.getByRole('button',{name:'Retry',exact:true}).click();
    await page.locator('#notification-card-'+records[0].id).waitFor({state:'visible'});
    console.log('PHASE17_A13_TRANSIENT_LIST_FAILURE_RETRY_RECOVERY_PASS');
  } finally {
    cleanup();
    for(const key of seededCatalogue) {
      sql('DELETE FROM public.admin_notification_event_catalogue WHERE event_key='+quote(key)+
        ' AND NOT EXISTS (SELECT 1 FROM public.admin_notifications WHERE event_key='+quote(key)+')');
    }
  }
  assert.equal(count(),0,'All A13 synthetic notifications must be removed');
  console.log('PHASE17_A13_SYNTHETIC_SQL_NOTIFICATION_CLEANUP_PASS');
}
