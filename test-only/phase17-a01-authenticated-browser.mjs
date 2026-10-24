import assert from 'node:assert/strict';
import { createHmac } from 'node:crypto';
import { readFileSync, unlinkSync } from 'node:fs';
import { resolve, sep } from 'node:path';
import { chromium } from 'playwright';

const api = new URL(process.env.RECOVERY_LOCAL_API_URL || '');
const base = new URL(process.env.RECOVERY_BROWSER_BASE_URL || '');
assert.equal(api.origin, 'http://127.0.0.1:54321', 'A01 must use only disposable local Auth');
assert.equal(base.origin, 'http://127.0.0.1:4173', 'A01 browser must use the isolated exact-source preview');
const temp = resolve(process.env.RUNNER_TEMP || '');
const fixtureFile = resolve(process.env.RECOVERY_A01_FIXTURE_PATH || '');
assert.ok(fixtureFile.startsWith(temp + sep), 'A01 credential fixture must remain inside runner temp');
const fixture = JSON.parse(readFileSync(fixtureFile, 'utf8'));
unlinkSync(fixtureFile);
assert.match(fixture.adminEmail, /@recovery\.invalid$/);
assert.match(fixture.outsiderEmail, /@recovery\.invalid$/);
assert.ok(fixture.adminEmail !== fixture.outsiderEmail);
assert.ok(fixture.password?.length >= 16 && fixture.totpSecret?.length > 15);

function totp(secret) {
  const alphabet = 'ABCDEFGHIJKLMNOPQRSTUVWXYZ234567';
  let bits = '';
  for (const ch of secret.toUpperCase().replace(/=|\s/g, '')) {
    const n = alphabet.indexOf(ch);
    assert.ok(n >= 0, 'invalid synthetic base32 factor');
    bits += n.toString(2).padStart(5, '0');
  }
  const key = Buffer.from(Array.from(
    { length: Math.floor(bits.length / 8) },
    (_, i) => parseInt(bits.slice(i * 8, i * 8 + 8), 2),
  ));
  const counter = Buffer.alloc(8);
  counter.writeBigUInt64BE(BigInt(Math.floor(Date.now() / 30000)));
  const mac = createHmac('sha1', key).update(counter).digest();
  const offset = mac[mac.length - 1] & 15;
  return String((mac.readUInt32BE(offset) & 0x7fffffff) % 1_000_000).padStart(6, '0');
}

const results = [];
const browser = await chromium.launch({ headless: true });
const forbiddenHosts = new Set();

async function newPage() {
  const context = await browser.newContext({
    viewport: { width: 390, height: 844 }, reducedMotion: 'reduce',
  });
  const page = await context.newPage();
  page.setDefaultTimeout(30000);
  await page.route('**/*', async (route) => {
    const url = new URL(route.request().url());
    if (url.hostname && url.hostname !== '127.0.0.1') {
      forbiddenHosts.add(url.hostname);
      await route.abort('blockedbyclient');
      return;
    }
    await route.continue();
  });
  return { page, context };
}
const start = base.origin + '/#';
const waitHash = (page, hash) => page.waitForURL(url => url.hash === hash, { timeout: 45000 });

try {
  // A01 rejection path: a real authenticated but non-admin local Auth user may
  // submit valid credentials; the UI must still deny active Admin membership.
  {
    const { page, context } = await newPage();
    try {
      await page.goto(start + '/roles', { waitUntil: 'domcontentloaded' });
      await page.locator('#login-email').waitFor({ state: 'visible' });
      await waitHash(page, '#/login');
      await page.locator('#login-email').fill(fixture.outsiderEmail);
      await page.locator('#login-password').fill(fixture.password);
      await page.locator('form button[type="submit"]').click();
      await page.getByText(/Unauthorized: Your account does not have active administrative privileges\./).waitFor({ state: 'visible' });
      assert.equal(new URL(page.url()).hash, '#/login');
      assert.equal(await page.locator('#mfa-otp').count(), 0);
      results.push('A01_AUTHENTICATED_NONADMIN_DENIED_PASS');
    } finally { await context.close(); }
  }

  // A01 positive path: enter email/password on the *actual Admin frontend*,
  // trigger the genuine DB-enforced AAL1→AAL2 route gate, and complete MFA via
  // real local Supabase Auth. No tokens, secrets or OTPs are logged or saved.
  {
    const { page, context } = await newPage();
    try {
      await page.goto(start + '/roles', { waitUntil: 'domcontentloaded' });
      await page.locator('#login-email').waitFor({ state: 'visible' });
      await page.locator('#login-email').fill(fixture.adminEmail);
      await page.locator('#login-password').fill(fixture.password);
      await page.locator('form button[type="submit"]').click();
      await waitHash(page, '#/security/mfa');
      await page.locator('#mfa-title').waitFor({ state: 'visible' });
      await page.locator('#mfa-otp').waitFor({ state: 'visible' });
      assert.equal(await page.locator('#header-create-role-btn').count(), 0,
        'AAL1 should not render protected role management');
      results.push('A01_SUPER_ADMIN_AAL1_ROLES_REQUIRE_MFA_PASS');

      const otp = totp(fixture.totpSecret);
      await page.locator('#mfa-otp').fill(otp);
      await page.locator('form button[type="submit"]').click();
      await waitHash(page, '#/roles');
      assert.equal(await page.locator('#login-email').count(), 0);
      assert.equal(await page.locator('#mfa-otp').count(), 0);
      await page.locator('#header-create-role-btn').waitFor({ state: 'visible' });
      results.push('A01_REAL_LOCAL_TOTP_AAL2_ROLE_ACCESS_PASS');

      await page.reload({ waitUntil: 'domcontentloaded' });
      await waitHash(page, '#/roles');
      await page.locator('#header-create-role-btn').waitFor({ state: 'visible' });
      assert.equal(await page.locator('#login-email').count(), 0);
      results.push('A01_AAL2_SESSION_RELOAD_RECOVERY_PASS');

      await page.goto(start + '/security/mfa', { waitUntil: 'domcontentloaded' });
      await page.locator('#mfa-title').waitFor({ state: 'visible' });
      await page.getByRole('button', { name: /Sign out|লগআউট/ }).click();
      await waitHash(page, '#/login');
      await page.locator('#login-email').waitFor({ state: 'visible' });
      await page.goto(start + '/roles', { waitUntil: 'domcontentloaded' });
      await waitHash(page, '#/login');
      assert.equal(await page.locator('#header-create-role-btn').count(), 0);
      results.push('A01_SIGNOUT_REVOKES_PROTECTED_ROLE_NAVIGATION_PASS');
    } finally { await context.close(); }
  }

  // The real source references Google Fonts. Every non-loopback request is
  // blocked above; known font stylesheet requests are harmless blocked assets,
  // not hosted API traffic. Fail for any *other* attempted outside destination.
  const unexpectedHosts = [...forbiddenHosts].filter(
    host => !['fonts.googleapis.com', 'fonts.gstatic.com'].includes(host),
  );
  assert.deepEqual(unexpectedHosts, [],
    'A01 synthetic sign-in attempted an unexpected external destination');
  assert.ok(![...forbiddenHosts].some(host => host.endsWith('.supabase.co')),
    'A01 browser must never attempt a hosted Supabase request');
  console.log('PHASE17_A01_REAL_LOCAL_UI_AUTH_MFA_AND_SESSION_RECOVERY_PASS: ' + results.join('; '));
} finally {
  await browser.close();
}
