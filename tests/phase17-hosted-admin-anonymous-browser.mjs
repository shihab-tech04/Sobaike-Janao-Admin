import assert from 'node:assert/strict';
import { mkdir, writeFile } from 'node:fs/promises';
import { join } from 'node:path';
import { chromium } from 'playwright';

// This is an anonymous, read-only test of the actual public Admin domain.
// It never accepts a password, token, cookie, or a writable Admin session.
const site = process.env.HOSTED_ADMIN_BASE_URL;
assert.equal(site, 'https://admin.shobaikejanao.com',
  'Hosted acceptance must target only the approved Admin production origin');

const expectedSha = process.env.HOSTED_ADMIN_EXPECTED_SHA || '';
if (expectedSha) assert.match(expectedSha, /^[0-9a-f]{40}$/);

const manifestResponse = await fetch(site + '/release-manifest.json', {
  headers: { 'Cache-Control': 'no-cache' },
  signal: AbortSignal.timeout(45_000),
});
assert.equal(manifestResponse.status, 200, 'Canonical Admin manifest unavailable');
const manifest = await manifestResponse.json();
assert.equal(manifest.repository, 'shihab-tech04/Sobaike-Janao-Admin');
assert.match(manifest.commit_sha, /^[0-9a-f]{40}$/);
if (expectedSha) assert.equal(manifest.commit_sha, expectedSha,
  'Hosted Admin serves a different commit than the successful release smoke');

const paths = [
  '/dashboard', '/complaints', '/complaints/SYNTHETIC-NOT-A-REAL-REPORT',
  '/news-intake', '/banners', '/users', '/roles', '/security/mfa',
  '/activity-log', '/notifications', '/unknown-admin-route',
];
const screenshotRoot = process.env.RUNNER_TEMP || '/tmp';
const screenshotDir = join(screenshotRoot, 'sobaike-hosted-admin-anon');
await mkdir(screenshotDir, { recursive: true });

const browser = await chromium.launch({ headless: true });
try {
  for (const width of [390, 1280]) {
    const context = await browser.newContext({
      viewport: { width, height: 850 },
      reducedMotion: 'reduce',
      locale: 'en-US',
      serviceWorkers: 'block',
      storageState: { cookies: [], origins: [] },
    });
    try {
      for (const path of paths) {
        const page = await context.newPage();
        const protectedRpcCalls = [];
        page.on('request', request => {
          const url = new URL(request.url());
          if (url.hostname === 'eztqgqgpluoqwmprgeas.supabase.co' &&
              /\/rest\/v1\/rpc\/admin_/i.test(url.pathname)) {
            protectedRpcCalls.push({ pathname: url.pathname, method: request.method() });
          }
        });
        await page.goto(site + '/#' + path, {
          waitUntil: 'domcontentloaded',
          timeout: 45_000,
        });
        await page.locator('#login-email').waitFor({ state: 'visible', timeout: 30_000 });
        await page.waitForURL(url => url.hash === '#/login', { timeout: 30_000 });
        assert.equal(await page.locator('#login-email').isVisible(), true,
          path + ': signed-out visitor must see the Login form');
        assert.equal(await page.locator('aside nav').count(), 0,
          path + ': protected navigation rendered before authentication');
        assert.deepEqual(protectedRpcCalls, [],
          path + ': signed-out UI attempted privileged Admin RPC');
        const viewport = await page.evaluate(() => ({
          content: document.documentElement.scrollWidth,
          available: document.documentElement.clientWidth,
        }));
        assert.ok(viewport.content <= viewport.available + 1,
          path + ': horizontal overflow at ' + width + 'px');
        if (path === '/dashboard') {
          const robots = await page.locator('meta[name="robots"]').getAttribute('content');
          assert.ok(robots?.split(',').map(x => x.trim().toLowerCase()).includes('noindex'),
            'Hosted Admin must remain non-indexable');
          await page.screenshot({
            path: join(screenshotDir, 'signed-out-' + width + '.png'),
            animations: 'disabled',
          });
        }
        await page.close();
      }
    } finally {
      await context.close();
    }
  }
  await writeFile(join(screenshotDir, 'release-evidence.json'), JSON.stringify({
    site, manifestSha: manifest.commit_sha, expectedSha: expectedSha || null,
    widths: [390, 1280], protectedRoutes: paths, result: 'PASS',
    kind: 'hosted anonymous UI boundary only; NO Admin login or AAL2 write test',
  }, null, 2));
  console.log('PHASE17_HOSTED_ADMIN_SIGNED_OUT_BROWSER_PASS: ' +
    (paths.length * 2) + ' protected-route checks; mobile/desktop; exact manifest ' +
    manifest.commit_sha + '; no privileged request; no citizen data writes.');
} finally {
  await browser.close();
}
