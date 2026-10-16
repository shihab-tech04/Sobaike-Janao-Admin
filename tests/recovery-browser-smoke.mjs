import assert from 'node:assert/strict';
import { mkdir } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { chromium } from 'playwright';

const app = process.env.RECOVERY_BROWSER_APP;
const baseUrl = process.env.RECOVERY_BROWSER_BASE_URL;
assert.equal(app, 'admin');
assert.ok(baseUrl, 'RECOVERY_BROWSER_BASE_URL must point to the loopback Vite server');

const widths = [360, 768, 1280];
const browser = await chromium.launch({ headless: true });
const screenshotDir = join(process.env.RUNNER_TEMP || tmpdir(), 'sobaike-responsive-smoke');
await mkdir(screenshotDir, { recursive: true });
const supabaseHosts = new Set();

try {
  for (const width of widths) {
    const context = await browser.newContext({ viewport: { width, height: 900 }, reducedMotion: 'reduce' });
    await context.addInitScript(() => localStorage.clear());
    const page = await context.newPage();
    page.on('request', (request) => {
      const host = new URL(request.url()).hostname;
      if (host.endsWith('.supabase.co')) supabaseHosts.add(host);
    });

    await page.goto(`${baseUrl.replace(/\/+$/, '')}/#/login`, { waitUntil: 'domcontentloaded' });
    await page.locator('#login-email').waitFor({ state: 'visible' });
    await page.reload({ waitUntil: 'domcontentloaded' });
    await page.locator('#login-email').waitFor({ state: 'visible' });
    assert.equal((await page.locator('label[for="login-email"]').innerText()).trim(), 'Email');

    const assertNoHorizontalOverflow = async (locale) => {
      const widths = await page.evaluate(() => ({
        viewport: document.documentElement.clientWidth,
        document: document.documentElement.scrollWidth,
      }));
      assert.ok(widths.document <= widths.viewport + 1, `${locale} at ${width}px overflows horizontally: ${JSON.stringify(widths)}`);
    };
    await assertNoHorizontalOverflow('en');
    let screenshot = await page.screenshot({
      path: join(screenshotDir, `admin-${width}-en.png`),
      animations: 'disabled',
    });
    assert.ok(screenshot.byteLength > 1000, `English viewport screenshot was unexpectedly small at ${width}px`);

    await page.locator('header button[title="Switch Language"]').click();
    assert.equal((await page.locator('label[for="login-email"]').innerText()).trim(), 'ইমেল');
    await page.getByRole('button', { name: 'লগইন', exact: true }).waitFor({ state: 'visible' });
    await assertNoHorizontalOverflow('bn');
    screenshot = await page.screenshot({
      path: join(screenshotDir, `admin-${width}-bn.png`),
      animations: 'disabled',
    });
    assert.ok(screenshot.byteLength > 1000, `Bengali viewport screenshot was unexpectedly small at ${width}px`);
    await context.close();
  }
  assert.deepEqual([...supabaseHosts], [], 'browser smoke must not contact any hosted Supabase project');
  console.log(`Responsive Admin login EN/BN smoke passed at ${widths.join(', ')} CSS pixels. Screenshots were rendered locally; no hosted data was requested.`);
} finally {
  await browser.close();
}
