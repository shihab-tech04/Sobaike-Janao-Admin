import assert from 'node:assert/strict';
import { chromium } from 'playwright';

const origin = process.env.RECOVERY_BROWSER_BASE_URL;
assert.ok(origin?.startsWith('http://127.0.0.1:'), 'Only isolated built candidate is allowed');
// Match the actual AppRoutes.tsx protected shell, including nested CRUD,
// special pages and the protected not-found branch. All fixture IDs are inert.
const protectedPaths = [
  '/', '/dashboard', '/complaints', '/complaints/SYNTHETIC-UNAUTHORIZED',
  '/responses', '/categories', '/news-intake', '/banners',
  '/system-health', '/map', '/location-activity', '/notifications',
  '/users', '/users/create', '/users/synthetic-user', '/users/synthetic-user/edit',
  '/roles', '/roles/create', '/roles/synthetic-role', '/roles/synthetic-role/edit',
  '/security/mfa', '/activity-log', '/unknown-admin-route',
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
  console.log('ADMIN_UNAUTH_ROUTE_PASS: all 23 protected root/nested/hash routes incl. MFA, 390/1280px, no hosted requests, no private nav.');
} finally {
  await browser.close();
}
