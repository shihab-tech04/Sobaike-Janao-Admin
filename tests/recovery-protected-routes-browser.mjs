import assert from 'node:assert/strict';
import { chromium } from 'playwright';

const origin = process.env.RECOVERY_BROWSER_BASE_URL;
assert.ok(origin?.startsWith('http://127.0.0.1:'), 'Only isolated built candidate is allowed');
const protectedPaths = [
  '/', '/dashboard', '/complaints', '/responses', '/categories',
  '/news-intake', '/banners', '/users', '/roles',
  '/system-health', '/security/mfa', '/activity-log',
];
const browser = await chromium.launch({ headless: true });
try {
  for (const width of [390, 1280]) {
    const context = await browser.newContext({
      viewport: { width, height: 850 },
      reducedMotion: 'reduce',
    });
    for (const route of protectedPaths) {
      const page = await context.newPage();
      const hostedRequests = [];
      page.on('request', request => {
        const host = new URL(request.url()).hostname;
        if (host.endsWith('.supabase.co')) hostedRequests.push(request.url());
      });
      await page.goto(origin.replace(/\/$/, '') + '/#' + route, { waitUntil: 'domcontentloaded' });
      await page.locator('#login-email').waitFor({ state: 'visible' });
      await page.waitForURL(url => url.hash === '#/login');
      assert.equal(await page.locator('#login-email').isVisible(), true,
        route + ': unauthenticated visitor must see Login');
      assert.equal(await page.locator('aside nav').count(), 0,
        route + ': private Admin navigation must not render');
      assert.deepEqual(hostedRequests, [], route + ': isolated guard must not contact hosted Supabase');
      await page.close();
    }
    await context.close();
  }
  console.log('ADMIN_UNAUTH_ROUTE_PASS: 12 protected hash routes incl. MFA, 390/1280px, no hosted requests, no private nav.');
} finally {
  await browser.close();
}
