import { test, expect, type Page } from '@playwright/test';

// The Rust engine is exposed on window.__engine by src/host.ts.
declare global {
  interface Window {
    __engine: {
      frame(now: number): void;
      pointer_down(x: number, y: number): void;
      set_num_charts(n: number): void;
      set_currency(c: string): void;
      view(): number;
      grid_height(w: number): number;
      symbol_at(x: number, y: number): string | undefined;
      debug_pixel_hash(): number;
      current_news(): string;
    };
  }
}

async function ready(page: Page) {
  await page.goto('/');
  await page.waitForFunction(() => !!window.__engine, undefined, { timeout: 5000 });
  await page.waitForTimeout(500); // a few sim ticks + first paint
}

test('canvas is live: pixel hash changes as the sim ticks', async ({ page }) => {
  await ready(page);
  const h1 = await page.evaluate(() => window.__engine.debug_pixel_hash());
  await page.waitForTimeout(800);
  const h2 = await page.evaluate(() => window.__engine.debug_pixel_hash());
  expect(h1).not.toBe(h2);
});

test('hit-testing returns expected symbols and opens detail', async ({ page }) => {
  await ready(page);
  // first grid cell center -> AAPL (the first symbol)
  const sym = await page.evaluate(() => window.__engine.symbol_at(120, 110));
  expect(sym).toBe('AAPL');

  expect(await page.evaluate(() => window.__engine.view())).toBe(0); // grid
  await page.evaluate(() => window.__engine.pointer_down(120, 110));
  expect(await page.evaluate(() => window.__engine.view())).toBe(1); // detail
  // any click in detail returns to grid
  await page.evaluate(() => window.__engine.pointer_down(400, 400));
  expect(await page.evaluate(() => window.__engine.view())).toBe(0);
});

test('settings: more charts grows the scrollable canvas', async ({ page }) => {
  await ready(page);
  await page.click('#open-settings');
  await page.fill('#num-charts', '50');
  await page.click('button[value="close"]');
  await page.waitForTimeout(300);
  const scrollH = await page.evaluate(() => document.getElementById('stage')!.scrollHeight);
  const clientH = await page.evaluate(() => document.getElementById('stage')!.clientHeight);
  expect(scrollH).toBeGreaterThan(clientH); // 50 charts overflow -> scroll
});

test('news headline is populated', async ({ page }) => {
  await ready(page);
  const news = await page.evaluate(() => window.__engine.current_news());
  expect(news.length).toBeGreaterThan(10);
});

test('no per-frame heap growth over a few seconds (no leak)', async ({ page }) => {
  await ready(page);
  const mem = () => page.evaluate(() => (performance as unknown as { memory?: { usedJSHeapSize: number } }).memory?.usedJSHeapSize ?? 0);
  const before = await mem();
  test.skip(before === 0, 'performance.memory unavailable');
  await page.waitForTimeout(4000);
  const after = await mem();
  // allow some slack for JIT/GC noise, but it must not balloon
  expect(after - before).toBeLessThan(3_000_000);
});
