import { test, expect, type Page, type Frame } from '@playwright/test';

// The renderer iframe exposes window.__cards() (the live card pool) for tests.
declare global {
  interface Window {
    __cards: () => Array<{
      symbol: string;
      cssW: number;
      cssH: number;
      canvas: HTMLCanvasElement;
    }>;
  }
}

// Acquire the current renderer iframe and wait until it has at least one card
// with a sized canvas and real data.
async function getFrame(page: Page): Promise<Frame> {
  const handle = await page.waitForSelector('#frame');
  const frame = await handle.contentFrame();
  if (!frame) throw new Error('no iframe content frame');
  await frame.waitForFunction(
    () => !!window.__cards && window.__cards().length > 0 && window.__cards()[0].cssW > 0,
    undefined,
    { timeout: 8000 },
  );
  // let a sim tick land so the canvas has been painted at least once
  await page.waitForTimeout(400);
  return frame;
}

test('charts are live: a card canvas changes as the sim ticks', async ({ page }) => {
  await page.goto('/');
  const frame = await getFrame(page);

  const snap = () =>
    frame.evaluate(() => window.__cards()[0].canvas.toDataURL());

  const a = await snap();
  await page.waitForTimeout(800);
  const b = await snap();
  expect(a).not.toBe(b);
});

test('clicking a card navigates to the detail view', async ({ page }) => {
  await page.goto('/');
  const frame = await getFrame(page);

  const sym = await frame.evaluate(() => window.__cards()[0].symbol);
  expect(sym.length).toBeGreaterThan(0);

  await frame.locator('.card').first().click();

  // host recreates the iframe with ?stock=SYM
  await page.waitForFunction(
    () => {
      const f = document.getElementById('frame') as HTMLIFrameElement | null;
      return !!f && f.src.includes('stock=');
    },
    undefined,
    { timeout: 8000 },
  );

  const handle = await page.waitForSelector('#frame');
  const detail = await handle.contentFrame();
  if (!detail) throw new Error('no detail frame');
  await detail.waitForSelector('#detail-banner:not(.hidden)', { timeout: 8000 });
  await detail.waitForSelector('#back:not(.hidden)', { timeout: 8000 });
  const label = await detail.locator('#detail-label').textContent();
  expect(label).toContain(sym);
});

test('settings: changing chart count rebuilds the grid', async ({ page }) => {
  await page.goto('/');
  const frame = await getFrame(page);

  const before = await frame.evaluate(() => window.__cards().length);
  expect(before).toBe(14); // default

  await frame.locator('#open-settings').click();
  await frame.locator('[data-num="8"]').click();

  await frame.waitForFunction(() => window.__cards().length === 8, undefined, { timeout: 8000 });
});

test('recover reloads the renderer iframe and it repaints', async ({ page }) => {
  await page.goto('/');
  await getFrame(page);

  // Recover swaps the iframe out from under us; reach into the live
  // contentWindow from the page rather than holding a (soon-detached) Frame.
  await page.evaluate(() => {
    const w = (document.getElementById('frame') as HTMLIFrameElement).contentWindow as Window & {
      document: Document;
    };
    (w.document.getElementById('recover') as HTMLButtonElement).click();
  });

  await page.waitForFunction(
    () => {
      const f = document.getElementById('frame') as HTMLIFrameElement | null;
      const w = f?.contentWindow as (Window & { __cards?: () => unknown[] }) | undefined;
      const cards = w?.__cards?.();
      return !!cards && cards.length > 0 && (cards[0] as { cssW: number }).cssW > 0;
    },
    undefined,
    { timeout: 8000 },
  );

  const n = await page.evaluate(() => {
    const w = (document.getElementById('frame') as HTMLIFrameElement).contentWindow as Window & {
      __cards: () => unknown[];
    };
    return w.__cards().length;
  });
  expect(n).toBeGreaterThan(0);
});
