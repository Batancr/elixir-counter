// Browser tests for the page. Serve docs/ and point BASE at it:
//   python3 -m http.server 8131 -d docs &
//   BASE=http://localhost:8131/ npx playwright test tests/browser
const { test, expect } = require('@playwright/test');
const BASE = process.env.BASE || 'http://localhost:8131/';

async function open(page, errors, hash = '') {
  await page.route(/fonts\./, (r) => r.abort());
  page.on('pageerror', (e) => errors.push(String(e)));
  await page.goto(BASE + 'index.html' + hash);
}
// Picks a card the first time it is seen, taps its deck button after that.
async function tapCard(page, name) {
  const btn = page.locator(`#deck button[data-card="${name}"]`);
  if (await btn.count()) return btn.click();
  await page.locator('#deck button[data-new]').first().click();
  await page.fill('#search', name);
  await page.locator(`#pickList [data-pick="${name}"]`).click();
}
const elixir = (page) => page.locator('#elx').textContent().then(Number);

test.describe('Elixir Counter', () => {
  let errors;
  test.beforeEach(() => { errors = []; });
  test.afterEach(() => expect(errors).toEqual([]));

  test('live: start, tap plays, the cycle and elixir follow', async ({ page }) => {
    await open(page, errors);
    await page.click('#start');
    for (const c of ['Hog Rider', 'Ice Spirit', 'Cannon', 'The Log', 'Musketeer']) await tapCard(page, c);
    await expect(page.locator('#seen')).toHaveText('5/8');
    await expect(page.locator('#queue .c.next .n')).toHaveText('Ice Spirit');   // Hog went back into hand
    await expect(page.locator('#hand .n')).toHaveText(['Hog Rider']);
    await expect(page.locator('#negWarn')).toContainText('below 0');           // 14 elixir in a second
    await expect(page.locator('#logCount')).toHaveText('5');
  });

  test('undo steps back one action, including a removed log row', async ({ page }) => {
    await open(page, errors);
    await page.click('#start');
    await tapCard(page, 'Knight'); await tapCard(page, 'Archers');
    await page.locator('#log tr').first().click();                 // removes Archers
    await expect(page.locator('#logCount')).toHaveText('1');
    await page.click('#undo');                                       // brings it back
    await expect(page.locator('#logCount')).toHaveText('2');
    await page.click('#undo');                                       // undoes the Archers tap
    await expect(page.locator('#logCount')).toHaveText('1');
  });

  test('a live match survives a reload', async ({ page }) => {
    await open(page, errors);
    await page.click('#start');
    await tapCard(page, 'Hog Rider');
    await page.waitForTimeout(1200);
    await page.reload();
    await expect(page.locator('#logCount')).toHaveText('1');
    await expect(page.locator('#start')).toHaveText('Restart');
    await expect(page.locator('#status')).toContainText('restored');
    const clock = await page.locator('#clock').textContent();
    expect(['2:59', '2:58']).toContain(clock);
  });

  test('switching mode mid-match needs a second tap', async ({ page }) => {
    await open(page, errors);
    await page.click('#start'); await tapCard(page, 'Zap');
    await page.click('#modeReplay');
    await expect(page.locator('#modeReplay')).toHaveText('Confirm?');
    await expect(page.locator('#logCount')).toHaveText('1');
    await page.click('#modeReplay');
    await expect(page.locator('#replayBox')).toBeVisible();
    await expect(page.locator('#logCount')).toHaveText('0');
  });

  test('Mirror shows its real cost in the log', async ({ page }) => {
    await open(page, errors);
    await page.click('#start');
    await tapCard(page, 'Fireball'); await tapCard(page, 'Mirror');
    await expect(page.locator('#log tr').first().locator('td').last()).toHaveText('5');
  });

  test('settings: Esc keeps changes, silly values are clamped, cost changes can be removed', async ({ page }) => {
    await open(page, errors);
    await page.click('#openSettings');
    await page.fill('#cfgStart', '7');
    await page.fill('#cfgSec', '0');
    await page.keyboard.press('Escape');
    await expect(page.locator('#elx')).toHaveText('7.0');
    await expect.poll(() => page.evaluate(() => (JSON.parse(localStorage.getItem('ct.cfg')) || {}).secPerElixir)).toBe(0.5);
    await page.click('#openSettings');
    await page.fill('#costName', 'Knight'); await page.fill('#costValue', '4'); await page.click('#saveCost');
    await expect(page.locator('#costList .override')).toHaveCount(1);
    await page.locator('#costList [data-unset="Knight"]').click();
    await expect(page.locator('#costList .override')).toHaveCount(0);
  });

  test('2v2 button sets the slower regen', async ({ page }) => {
    await open(page, errors);
    await page.click('#openSettings');
    await page.locator('#cfgType [data-sec="3.6"]').click();
    await expect(page.locator('#cfgSec')).toHaveValue('3.6');
    await expect(page.locator('#cfgType [data-sec="3.6"]')).toHaveAttribute('aria-pressed', 'true');
    await page.click('#closeSettings');   // the dialog's close event saves, a moment later
    await expect.poll(() => page.evaluate(() => (JSON.parse(localStorage.getItem('ct.cfg')) || {}).secPerElixir)).toBe(3.6);
  });

  test('demo runs and the tracker matches the hidden hand', async ({ page }) => {
    await open(page, errors, '#demo');
    await page.locator('#demoSpeed [data-s="10"]').click();
    await expect(page.locator('#truthMatch')).toContainText('tracker exact', { timeout: 20000 });
  });

  test('keyboard: number keys tap deck cards, U undoes', async ({ page }) => {
    await open(page, errors);
    await page.click('#start');
    await tapCard(page, 'Goblins');
    await page.locator('body').click({ position: { x: 5, y: 5 } });
    await page.keyboard.press('1');
    await expect(page.locator('#logCount')).toHaveText('2');
    await page.keyboard.press('u');
    await expect(page.locator('#logCount')).toHaveText('1');
  });

  for (const w of [360, 390, 1280]) {
    test(`no sideways scroll at ${w}px, deck first on phones`, async ({ page }) => {
      await page.setViewportSize({ width: w, height: 800 });
      await open(page, errors);
      expect(await page.evaluate(() => document.documentElement.scrollWidth - innerWidth)).toBeLessThanOrEqual(0);
      const deckY = (await page.locator('#pDeck').boundingBox()).y, cycleY = (await page.locator('#pCycle').boundingBox()).y;
      if (w < 760) expect(deckY).toBeLessThan(cycleY);
    });
  }
});
