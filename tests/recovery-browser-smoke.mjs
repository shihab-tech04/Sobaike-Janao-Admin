import assert from 'node:assert/strict';
import { mkdir } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { chromium } from 'playwright';

const app = process.env.RECOVERY_BROWSER_APP;
const baseUrl = process.env.RECOVERY_BROWSER_BASE_URL;
const expectedSupabaseHost = process.env.RECOVERY_EXPECT_SUPABASE_HOST;
assert.equal(app, 'admin');
assert.ok(baseUrl, 'RECOVERY_BROWSER_BASE_URL must point to the site under test');

const widths = [360, 390, 768, 1280, 1536];
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
      path: join(screenshotDir, `admin-${width}-en-light.png`),
      animations: 'disabled',
    });
    assert.ok(screenshot.byteLength > 1000, `English viewport screenshot was unexpectedly small at ${width}px`);

    const controls = page.locator('header button');
    for (let i = 0; i < await controls.count(); i++) {
      const dimensions = await controls.nth(i).boundingBox();
      assert.ok(dimensions && dimensions.height >= 44 && dimensions.width >= 44, `Admin header control ${i} at ${width}px must meet 44px touch target`);
    }
    assert.match(await page.locator('body').evaluate((el) => getComputedStyle(el).fontFamily), /Noto Sans/);
    await page.locator('header button[title="Switch to Dark Mode"]').click();
    assert.ok(await page.locator('html').evaluate((el) => el.classList.contains('dark')));
    screenshot = await page.screenshot({
      path: join(screenshotDir, `admin-${width}-en-dark.png`),
      animations: 'disabled',
    });
    assert.ok(screenshot.byteLength > 1000);
    await assertNoHorizontalOverflow('en dark');

    await page.locator('header button[title="Switch Language"]').click();
    assert.equal((await page.locator('label[for="login-email"]').innerText()).trim(), 'ইমেল');
    await page.getByRole('button', { name: 'লগইন', exact: true }).waitFor({ state: 'visible' });
    await assertNoHorizontalOverflow('bn');
    screenshot = await page.screenshot({
      path: join(screenshotDir, `admin-${width}-bn-dark.png`),
      animations: 'disabled',
    });
    assert.ok(screenshot.byteLength > 1000, `Bengali viewport screenshot was unexpectedly small at ${width}px`);
    assert.match(await page.locator('body').evaluate((el) => getComputedStyle(el).fontFamily), /Noto Sans Bengali/);
    await page.locator('header button[title="Switch to Light Mode"]').click();
    await assertNoHorizontalOverflow('bn light');
    screenshot = await page.screenshot({
      path: join(screenshotDir, `admin-${width}-bn-light.png`),
      animations: 'disabled',
    });
    assert.ok(screenshot.byteLength > 1000);
    await context.close();
  }
  if (expectedSupabaseHost) {
    // With no signed-in user, Supabase Auth can restore an empty local session
    // without any network requests. Reject unexpected hosted project traffic.
    assert.ok([...supabaseHosts].every((host) => host === expectedSupabaseHost), 'connected Admin site must not contact another Supabase project');
  } else {
    assert.deepEqual([...supabaseHosts], [], 'isolated browser smoke must not contact any hosted Supabase project');
  }
  console.log(`Responsive Admin login EN/BN × light/dark and 44px control smoke passed at ${widths.join(', ')} CSS pixels. Supabase mode: ${expectedSupabaseHost || 'isolated'}.`);
} finally {
  await browser.close();
}
