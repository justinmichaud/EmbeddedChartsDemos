import { test, expect, type Page } from '@playwright/test';

const HISTORY_LEN = 60;
const NUM_STOCKS = 14;

function makeDataMessage(tick: number) {
  const stockMid:  number[] = [];
  const stockBid:  number[] = [];
  const stockAsk:  number[] = [];
  const stockTime: number[] = [];
  const stockHead: number[] = [];
  const basePrice = 100;

  for (let s = 0; s < NUM_STOCKS; s++) {
    stockHead.push(0);
    for (let i = 0; i < HISTORY_LEN; i++) {
      const mid = basePrice + Math.sin(tick * 0.01 + s) * 5;
      stockMid.push(mid);
      stockBid.push(mid - 0.05);
      stockAsk.push(mid + 0.05);
      stockTime.push(tick + i);
    }
  }

  return {
    type: 'DATA',
    timestamp: Date.now(),
    tick,
    sweepPos: (tick % 50) / 50,
    settings: { currency: 'USD', numCharts: NUM_STOCKS },
    stockSymbols: ['AAPL','MSFT','GOOGL','AMZN','NVDA','TSLA','META','BRK.B','JPM','V','JNJ','WMT','PG','XOM'],
    stockMid, stockBid, stockAsk, stockTime, stockHead,
    headlines: ['Test headline one', 'Test headline two'],
    newsIndex: tick % 2,
  };
}

async function measureHeap(page: Page): Promise<number> {
  await page.requestGC();
  await page.waitForTimeout(50);
  return page.evaluate(() => (performance as any).memory?.usedJSHeapSize ?? 0);
}

test('iframe direct: renders charts from injected data', async ({ page }) => {
  await page.goto('/iframe.html?testMode=true');
  await page.waitForTimeout(500);

  // Inject one message
  await page.evaluate((msg) => window.postMessage(msg, '*'), makeDataMessage(1));
  await page.waitForTimeout(300);

  await expect(page.locator('[data-symbol="AAPL"]')).toBeVisible({ timeout: 3000 });
});

test('iframe: chart detail view shows single stock', async ({ page }) => {
  await page.goto('/iframe.html?stock=NVDA&testMode=true');
  await page.evaluate((msg) => window.postMessage(msg, '*'), makeDataMessage(1));
  await page.waitForTimeout(300);

  await expect(page.locator('text=NVDA — DETAIL VIEW')).toBeVisible({ timeout: 3000 });
  await expect(page.locator('[data-symbol="NVDA"]')).toBeVisible({ timeout: 3000 });
  // Other symbols should not be present
  await expect(page.locator('[data-symbol="AAPL"]')).not.toBeVisible();
});

test('memory does not grow under high-frequency rendering', async ({ page }) => {
  await page.goto('/iframe.html?testMode=true');
  await page.waitForTimeout(500);

  // Warm up
  for (let i = 0; i < 50; i++) {
    await page.evaluate((msg) => window.postMessage(msg, '*'), makeDataMessage(i));
  }
  await page.waitForTimeout(200);

  const baseline = await measureHeap(page);
  if (baseline === 0) {
    console.log('performance.memory not available; skipping assertion');
    return;
  }

  // Inject 10 batches × 500 messages (far exceeds 60fps)
  for (let batch = 0; batch < 10; batch++) {
    await page.evaluate((startTick) => {
      for (let i = 0; i < 500; i++) {
        const tick = startTick + i;
        const stockMid: number[] = [], stockBid: number[] = [], stockAsk: number[] = [],
              stockTime: number[] = [], stockHead: number[] = [];
        for (let s = 0; s < 14; s++) {
          stockHead.push(0);
          for (let j = 0; j < 60; j++) {
            const mid = 100 + Math.sin(tick * 0.01 + s) * 5;
            stockMid.push(mid); stockBid.push(mid - 0.05); stockAsk.push(mid + 0.05);
            stockTime.push(tick + j);
          }
        }
        window.postMessage({
          type: 'DATA', timestamp: performance.now(), tick, sweepPos: (tick % 50) / 50,
          settings: { currency: 'USD', numCharts: 14 },
          stockSymbols: ['AAPL','MSFT','GOOGL','AMZN','NVDA','TSLA','META','BRK.B','JPM','V','JNJ','WMT','PG','XOM'],
          stockMid, stockBid, stockAsk, stockTime, stockHead,
          headlines: ['Headline A', 'Headline B'],
          newsIndex: tick % 2,
        }, '*');
      }
    }, batch * 500);
    await page.waitForTimeout(50); // let React flush renders
  }

  const after = await measureHeap(page);
  console.log(`Heap baseline: ${(baseline / 1024 / 1024).toFixed(1)} MB, after: ${(after / 1024 / 1024).toFixed(1)} MB`);
  expect(after - baseline).toBeLessThan(10 * 1024 * 1024); // < 10 MB growth
});
