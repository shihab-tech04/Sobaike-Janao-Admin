import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { chromium } from 'playwright';

// This is a real Vite development build with no configured backend.
// Never synthesize an Admin session or contact the hosted project.
const origin = process.env.RECOVERY_DEV_BROWSER_BASE_URL;
assert.equal(origin, 'http://127.0.0.1:4175', 'Refuse non-loopback development testing');

const authSource = readFileSync(new URL('../src/context/AuthContext.tsx', import.meta.url), 'utf8');
assert.doesNotMatch(authSource, /mock-dev-token|mock-refresh-token|dev-admin-id-0001/,
  'Unconfigured development environments must not fabricate Admin credentials');

const browser = await chromium.launch({ headless: true });
try {
  for (const width of [375, 768, 1280]) {
    const context = await browser.newContext({
      viewport: { width, height: 850 },
      reducedMotion: 'reduce',
    });
    await context.addInitScript(() => localStorage.clear());
    for (const route of ['/dashboard', '/security/mfa', '/users', '/roles']) {
      const page = await context.newPage();
      const hostedRequests = [];
      await page.route('**/*', request => {
        const host = new URL(request.request().url()).hostname;
        if (host !== '127.0.0.1') {
          if (host.endsWith('.supabase.co')) hostedRequests.push(host);
          return request.abort('blockedbyclient');
        }
        return request.continue();
      });
      await page.goto(origin + '/#' + route, { waitUntil: 'domcontentloaded' });
      await page.locator('#login-email').waitFor({ state: 'visible' });
      await page.waitForURL(url => url.hash === '#/login');
      assert.equal(await page.locator('aside nav').count(), 0,
        route + ': private navigation rendered without a configured backend');
      assert.deepEqual(hostedRequests, [], route + ': unexpected hosted Supabase request');
      await page.close();
    }
    await context.close();
  }
  console.log('ADMIN_UNCONFIGURED_DEV_FAIL_CLOSED_PASS: 4 protected routes at 375/768/1280px; no mock Admin or hosted API calls.');
} finally {
  await browser.close();
}
