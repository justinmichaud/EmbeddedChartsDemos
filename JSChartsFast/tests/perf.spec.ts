import { test, type Page } from '@playwright/test';

const HISTORY_LEN = 60;
const NUM_STOCKS = 14;
const SYMBOLS = ['AAPL','MSFT','GOOGL','AMZN','NVDA','TSLA','META','BRK.B','JPM','V','JNJ','WMT','PG','XOM'];

async function injectMessage(page: Page, tick: number) {
  await page.evaluate((t) => {
    const stockMid: number[] = [], stockBid: number[] = [], stockAsk: number[] = [],
          stockTime: number[] = [], stockHead: number[] = [];
    for (let s = 0; s < 14; s++) {
      stockHead.push(0);
      for (let j = 0; j < 60; j++) {
        // Sin curve over history (varies with j) + slow drift over time (t).
        const base = 100 + s * 5;
        const mid = base + Math.sin(j * 0.2 + s) * 0.3 + Math.sin(t * 0.005) * 0.05;
        stockMid.push(mid); stockBid.push(mid - 0.05); stockAsk.push(mid + 0.05);
        stockTime.push(t + j);
      }
    }
    window.postMessage({
      type: 'DATA', timestamp: performance.now(), tick: t, sweepPos: (t % 50) / 50,
      settings: { currency: 'USD', numCharts: 14 },
      stockSymbols: ['AAPL','MSFT','GOOGL','AMZN','NVDA','TSLA','META','BRK.B','JPM','V','JNJ','WMT','PG','XOM'],
      stockMid, stockBid, stockAsk, stockTime, stockHead,
      headlines: ['Headline A', 'Headline B'],
      newsIndex: t % 2,
    }, '*');
  }, tick);
}

test('perf: DOM mutations per data update', async ({ page }) => {
  await page.goto('/iframe.html?testMode=true');
  await page.waitForTimeout(500);

  // Warm up + first paint.
  for (let i = 0; i < 5; i++) {
    await injectMessage(page, i);
    await page.waitForTimeout(40);
  }
  await page.waitForTimeout(200);

  // Install counters AFTER first paint so we don't measure mount.
  await page.evaluate(() => {
    const w = window as any;
    w.__perf = {
      remove: 0, append: 0, insert: 0, setAttr: 0, replaceChild: 0,
      removeBy: {} as Record<string, number>,
      appendBy: {} as Record<string, number>,
      setAttrBy: {} as Record<string, number>,
    };
    const tag = (n: any): string => {
      if (!n) return '#null';
      if (n.nodeType === 3) return '#text';
      const cls = (n.getAttribute && n.getAttribute('class')) || '';
      return n.tagName + (cls ? '.' + cls.split(' ').slice(0, 2).join('.') : '');
    };
    const bump = (bag: Record<string, number>, k: string) => { bag[k] = (bag[k] || 0) + 1; };

    const origRemove = Node.prototype.removeChild;
    Node.prototype.removeChild = function (this: Node, child: any) {
      w.__perf.remove++;
      bump(w.__perf.removeBy, tag(child));
      return origRemove.call(this, child);
    } as any;
    const origAppend = Node.prototype.appendChild;
    Node.prototype.appendChild = function (this: Node, child: any) {
      w.__perf.append++;
      bump(w.__perf.appendBy, tag(child));
      return origAppend.call(this, child);
    } as any;
    const origInsert = Node.prototype.insertBefore;
    Node.prototype.insertBefore = function (this: Node, ...args: any[]) {
      w.__perf.insert++;
      return origInsert.apply(this, args as any);
    } as any;
    const origReplace = Node.prototype.replaceChild;
    Node.prototype.replaceChild = function (this: Node, ...args: any[]) {
      w.__perf.replaceChild++;
      return origReplace.apply(this, args as any);
    } as any;
    const origSetAttr = Element.prototype.setAttribute;
    Element.prototype.setAttribute = function (this: Element, name: string, value: string) {
      w.__perf.setAttr++;
      bump(w.__perf.setAttrBy, this.tagName + '.' + name);
      return origSetAttr.call(this, name, value);
    } as any;
  });

  // Run a measured batch of N messages and time it.
  const N = 30;
  const t0 = Date.now();
  for (let i = 0; i < N; i++) {
    await injectMessage(page, 1000 + i);
    await page.waitForTimeout(40);
  }
  await page.waitForTimeout(200);
  const elapsedMs = Date.now() - t0;

  const stats = await page.evaluate(() => (window as any).__perf);
  const tickCount = await page.evaluate(() => document.querySelectorAll('.recharts-cartesian-axis-tick').length);
  const totalSvgNodes = await page.evaluate(() => document.querySelectorAll('svg *').length);

  console.log(`\n=== perf stats over ${N} data updates (${elapsedMs}ms wall) ===`);
  console.log(`removeChild calls : ${stats.remove}  (${(stats.remove / N).toFixed(1)} per update)`);
  console.log(`appendChild calls : ${stats.append}  (${(stats.append / N).toFixed(1)} per update)`);
  console.log(`insertBefore calls: ${stats.insert}  (${(stats.insert / N).toFixed(1)} per update)`);
  console.log(`replaceChild calls: ${stats.replaceChild}  (${(stats.replaceChild / N).toFixed(1)} per update)`);
  console.log(`setAttribute calls: ${stats.setAttr}  (${(stats.setAttr / N).toFixed(1)} per update)`);
  console.log(`live tick <g> nodes: ${tickCount}`);
  console.log(`live svg child nodes: ${totalSvgNodes}`);
  console.log(`\n--- top removeChild victims ---`);
  for (const [k, v] of Object.entries(stats.removeBy as Record<string, number>).sort((a, b) => b[1] - a[1]).slice(0, 8)) {
    console.log(`  ${(v as number).toString().padStart(5)}  ${k}`);
  }
  console.log(`--- top appendChild kinds ---`);
  for (const [k, v] of Object.entries(stats.appendBy as Record<string, number>).sort((a, b) => b[1] - a[1]).slice(0, 8)) {
    console.log(`  ${(v as number).toString().padStart(5)}  ${k}`);
  }
  console.log(`--- top setAttribute targets ---`);
  for (const [k, v] of Object.entries(stats.setAttrBy as Record<string, number>).sort((a, b) => b[1] - a[1]).slice(0, 12)) {
    console.log(`  ${(v as number).toString().padStart(5)}  ${k}`);
  }
});
