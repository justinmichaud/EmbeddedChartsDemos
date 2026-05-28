import { test, type Page } from '@playwright/test';
import * as fs from 'fs';
import * as path from 'path';

async function injectMessage(page: Page, tick: number) {
  await page.evaluate((t) => {
    const stockMid: number[] = [], stockBid: number[] = [], stockAsk: number[] = [],
          stockTime: number[] = [], stockHead: number[] = [];
    for (let s = 0; s < 14; s++) {
      stockHead.push(0);
      for (let j = 0; j < 60; j++) {
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

interface ProfileNode {
  id: number;
  callFrame: { functionName: string; url: string; lineNumber: number; columnNumber: number };
  hitCount?: number;
  children?: number[];
}
interface CpuProfile {
  nodes: ProfileNode[];
  startTime: number;
  endTime: number;
  samples: number[];
  timeDeltas: number[];
}

test('cpu profile: capture during steady-state updates', async ({ page }) => {
  await page.goto('/iframe.html?testMode=true');
  await page.waitForTimeout(500);

  // Warm up so first-paint cost is excluded.
  for (let i = 0; i < 8; i++) {
    await injectMessage(page, i);
    await page.waitForTimeout(40);
  }
  await page.waitForTimeout(300);

  const cdp = await page.context().newCDPSession(page);
  await cdp.send('Profiler.enable');
  await cdp.send('Profiler.setSamplingInterval', { interval: 100 }); // microseconds
  await cdp.send('Profiler.start');

  const N = 60;
  for (let i = 0; i < N; i++) {
    await injectMessage(page, 1000 + i);
    await page.waitForTimeout(35);
  }
  await page.waitForTimeout(200);

  const { profile } = await cdp.send('Profiler.stop') as { profile: CpuProfile };
  await cdp.detach();

  const profilePath = path.resolve('cpu-profile.cpuprofile');
  fs.writeFileSync(profilePath, JSON.stringify(profile));
  console.log(`\nWrote ${profilePath}`);

  // ---- self-time analysis ----
  const nodeById = new Map<number, ProfileNode>();
  for (const n of profile.nodes) nodeById.set(n.id, n);

  // each sample == 100us of self time on its node
  const us = 100;
  const totalUs = (profile.endTime - profile.startTime); // in microseconds
  const selfBy = new Map<number, number>();
  for (const sid of profile.samples) selfBy.set(sid, (selfBy.get(sid) || 0) + us);

  // aggregate by display name (collapse anonymous frames by url:line)
  type Row = { name: string; selfUs: number };
  const byName = new Map<string, number>();
  for (const [id, sUs] of selfBy) {
    const n = nodeById.get(id);
    if (!n) continue;
    const cf = n.callFrame;
    const file = (cf.url || '').split('/').slice(-2).join('/');
    const fn  = cf.functionName || '(anonymous)';
    const key = `${fn}  ${file}:${cf.lineNumber + 1}`;
    byName.set(key, (byName.get(key) || 0) + sUs);
  }
  const rows: Row[] = Array.from(byName.entries()).map(([name, selfUs]) => ({ name, selfUs }));
  rows.sort((a, b) => b.selfUs - a.selfUs);

  console.log(`\n=== top self-time over ${(totalUs / 1000).toFixed(0)}ms wall (${N} updates) ===`);
  let printed = 0;
  for (const r of rows) {
    if (r.selfUs / totalUs < 0.005 && printed >= 5) break;
    if (printed >= 30) break;
    const pct = (r.selfUs / totalUs * 100).toFixed(1).padStart(5);
    const ms  = (r.selfUs / 1000).toFixed(1).padStart(7);
    console.log(`${pct}%  ${ms} ms  ${r.name}`);
    printed++;
  }
});
