import assert from 'node:assert/strict';
import {execFileSync} from 'node:child_process';
import {createHmac,randomUUID} from 'node:crypto';
import {createClient} from '@supabase/supabase-js';
import {chromium} from 'playwright';
import {createPhase17A11Fixture} from './phase17-a11-map-fixture.mjs';
import {runPhase17A11} from './phase17-a11-map-monitoring-browser.mjs';
import {runPhase17A12} from './phase17-a12-location-activity-browser.mjs';

// Standalone A11: use the same already-started disposable Phase10 Supabase and
// exact-source Admin preview, but a fresh fictional delegated map-only user.
// Never accept a non-loopback SQL, HTTP or browser destination.
const api=process.env.RECOVERY_LOCAL_API_URL;
const db=process.env.RECOVERY_LOCAL_DB_URL;
const browserBaseUrl=process.env.RECOVERY_BROWSER_BASE_URL;
const anon=process.env.RECOVERY_LOCAL_ANON_KEY;
const service=process.env.RECOVERY_LOCAL_SERVICE_ROLE_KEY;
for(const [url,protocol,port] of [
  [api,'http:', '54321'],[db,'postgres:','54322'],
  [browserBaseUrl,'http:','4173'],
]) {
  const parsed=new URL(url||'');
  assert.equal(parsed.hostname,'127.0.0.1');
  assert.ok((port==='54322' ? ['postgres:','postgresql:'] : [protocol]).includes(parsed.protocol),
    'A11 requires the expected loopback protocol and port');
  assert.equal(parsed.port,port);
}
assert.ok(anon&&service);
function sql(statement) {
  return execFileSync('psql',[
    db,'--set','ON_ERROR_STOP=1','--tuples-only','--no-align',
    '--command',statement,
  ],{encoding:'utf8',timeout:20000,stdio:'pipe'}).trim();
}
function totp(secret) {
  const alphabet='ABCDEFGHIJKLMNOPQRSTUVWXYZ234567';
  let bits='';
  for(const ch of secret.toUpperCase().replace(/=|\s/g,'')) {
    const position=alphabet.indexOf(ch);
    assert.ok(position>=0);
    bits+=position.toString(2).padStart(5,'0');
  }
  const key=Buffer.from(Array.from({length:Math.floor(bits.length/8)},
    (_,i)=>parseInt(bits.slice(i*8,i*8+8),2)));
  const counter=Buffer.alloc(8);
  counter.writeBigUInt64BE(BigInt(Math.floor(Date.now()/30000)));
  const mac=createHmac('sha1',key).update(counter).digest();
  const offset=mac[mac.length-1]&15;
  return String((mac.readUInt32BE(offset)&0x7fffffff)%1000000).padStart(6,'0');
}
const suffix=randomUUID().slice(0,8);
const email='a11-'+suffix+'@recovery.invalid';
const password='A11-local-'+randomUUID()+'!Only';
const roleId='synthetic_moderator_'+suffix;
const root=createClient(api,service,{auth:{persistSession:false,autoRefreshToken:false}});
const publicClient=createClient(api,anon,{auth:{persistSession:false,autoRefreshToken:false}});
const created=await root.auth.admin.createUser({email,password,email_confirm:true});
assert.ifError(created.error);
const userId=created.data.user?.id;
assert.match(userId||'',/^[0-9a-f-]{36}$/i);
const fixture=createPhase17A11Fixture({sql,roleId,suffix});
let browser;
let ctx;
let page;
try {
  sql("INSERT INTO public.permissions(id,module,action,name_en,name_bn) " +
    "VALUES ('dashboard.view','dashboard','view','Synthetic Dashboard','পরীক্ষামূলক ড্যাশবোর্ড') " +
    "ON CONFLICT (id) DO NOTHING");
  sql("INSERT INTO public.admin_users(user_id,active,is_super_admin,display_name) " +
    "VALUES ('"+userId+"',true,false,'Synthetic Map Read Delegate')");
  sql("INSERT INTO public.roles(id,name_en,name_bn,active,is_system) " +
    "VALUES ('"+roleId+"','Synthetic Map Viewer','পরীক্ষামূলক মানচিত্র পাঠক',true,false)");
  sql("INSERT INTO public.role_permissions(role_id,permission_id) " +
    "VALUES ('"+roleId+"','dashboard.view') ON CONFLICT DO NOTHING");
  sql("INSERT INTO public.user_roles(user_id,role_id) VALUES ('"+userId+"','"+roleId+"')");

  const operator=createClient(api,anon,{auth:{persistSession:false,autoRefreshToken:false}});
  const login=await operator.auth.signInWithPassword({email,password});
  assert.ifError(login.error);
  const enrollment=await operator.auth.mfa.enroll({factorType:'totp'});
  assert.ifError(enrollment.error);
  const verified=await operator.auth.mfa.challengeAndVerify({
    factorId:enrollment.data.id,code:totp(enrollment.data.totp.secret),
  });
  assert.ifError(verified.error);
  const assurance=await operator.auth.mfa.getAuthenticatorAssuranceLevel();
  assert.equal(assurance.data?.currentLevel,'aal2');

  const ungranted=await operator.rpc('has_permission',{p_permission_id:'map.view'});
  assert.ifError(ungranted.error);
  assert.equal(ungranted.data,false);
  const dashboard=await operator.rpc('has_permission',{p_permission_id:'dashboard.view'});
  assert.ifError(dashboard.error);
  assert.equal(dashboard.data,true);
  console.log('PHASE17_A11_DELEGATED_AAL2_MAP_UNGRANTED_AND_DASHBOARD_ALLOWED_PASS');

  browser=await chromium.launch({headless:true});
  ctx=await browser.newContext({
    viewport:{width:1280,height:850},reducedMotion:'reduce',
  });
  page=await ctx.newPage();
  page.setDefaultTimeout(30000);
  const unexpectedExternal=new Set();
  const reporterRequests=[];
  await page.route('**/*',async route=>{
    const target=new URL(route.request().url());
    if(target.hostname!=='127.0.0.1'){
      unexpectedExternal.add(target.hostname);
      await route.abort('blockedbyclient');
      return;
    }
    if(target.pathname.includes('admin_get_complaint_reporter_location')){
      reporterRequests.push(target.pathname);
    }
    await route.continue();
  });
  const origin=browserBaseUrl.replace(/\/$/,'');
  const goto=route=>page.goto(origin+'/#'+route,{waitUntil:'domcontentloaded'});
  await goto('/map');
  await page.locator('#login-email').waitFor({state:'visible'});
  await page.locator('#login-email').fill(email);
  await page.locator('#login-password').fill(password);
  await page.locator('form button[type="submit"]').click();
  await goto('/security/mfa');
  await page.locator('#mfa-otp').waitFor({state:'visible'});
  await page.locator('#mfa-otp').fill(totp(enrollment.data.totp.secret));
  await page.locator('form button[type="submit"]').click();
  await page.locator('#mfa-otp').waitFor({state:'detached'});
  console.log('PHASE17_A11_REAL_BROWSER_EMAIL_TOTP_AAL2_PASS');

  await runPhase17A11({
    page,browserBaseUrl,publicClient,authorizedClient:operator,
    grantMapPermission:fixture.grantMapPermission,
    seedMapReports:fixture.seedMapReports,
    removeMapReports:fixture.removeMapReports,
    mapIds:fixture.mapIds,readMapRows:fixture.readMapRows,
  });
  await runPhase17A12({sql,roleId,suffix,page,browserBaseUrl,
    authorizedClient:operator,publicClient});
  assert.deepEqual(reporterRequests,[],'A11/A12 delegated browser must not request private complaint reporter GPS');
  assert.ok(![...unexpectedExternal].some(h=>h.endsWith('.supabase.co')),
    'A11 attempted to contact hosted Supabase');
  // The earlier signed-out redirect may attempt OSM tile loads before the
  // map-specific transparent fixture is installed; the catch-all network guard
  // aborts those requests. Count them as blocked, not successful egress.
  const expectedBlockedHosts=new Set([
    'fonts.googleapis.com','fonts.gstatic.com',
    'a.tile.openstreetmap.org','b.tile.openstreetmap.org','c.tile.openstreetmap.org',
  ]);
  assert.deepEqual([...unexpectedExternal].filter(h=>!expectedBlockedHosts.has(h)),[],
    'A11 attempted an unexpected non-loopback external request');
  console.log('PHASE17_A11_REAL_LOCAL_UI_MAP_SQL_PRIVACY_FILTER_REFRESH_MOBILE_PASS');
} finally {
  await ctx?.close();
  await browser?.close();
  // Explicitly clean only synthetic local role/user mappings, never hosted rows.
  fixture.removeMapReports();
  fixture.grantMapPermission(false);
  sql("DELETE FROM public.user_roles WHERE user_id='"+userId+"'");
  sql("DELETE FROM public.admin_users WHERE user_id='"+userId+"'");
  sql("DELETE FROM public.role_permissions WHERE role_id='"+roleId+"'");
  sql("DELETE FROM public.roles WHERE id='"+roleId+"'");
  const deleted=await root.auth.admin.deleteUser(userId);
  assert.ifError(deleted.error);
  assert.equal(fixture.readMapRows(),0);
}
