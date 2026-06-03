// Write a benchmark run to JSON and render a self-contained SVG graph.
// The SVG has a shared time x-axis, a left y-axis for FPS, and a right y-axis
// for memory (MB). RSS, JS heap and FPS are drawn as lines; the recover point
// (if any) is marked with a dashed vertical rule.

import * as fs from 'node:fs';
import * as path from 'node:path';
import { summarizePhases } from './stats.mjs';

export function writeReport({ app, params, samples, recoverAtT, outDir, stamp }) {
  fs.mkdirSync(outDir, { recursive: true });
  const base = `${app}-${stamp}`;
  const jsonPath = path.join(outDir, `${base}.json`);
  const svgPath = path.join(outDir, `${base}.svg`);

  const t0 = samples.length ? samples[0].t : 0;
  const rel = samples.map((s) => ({ ...s, ts: (s.t - t0) / 1000 }));

  const report = {
    app,
    generatedAt: stamp,
    params,
    recoverAtSec: recoverAtT == null ? null : (recoverAtT - t0) / 1000,
    summary: summarizePhases(samples),
    samples: rel.map((s) => ({
      ts: +s.ts.toFixed(3),
      phase: s.phase,
      fps: s.fps,
      jsHeapMB: s.jsHeapBytes == null ? null : +(s.jsHeapBytes / 1048576).toFixed(2),
      rssMB: s.rssKb == null ? null : +(s.rssKb / 1024).toFixed(2),
    })),
  };
  fs.writeFileSync(jsonPath, JSON.stringify(report, null, 2));

  fs.writeFileSync(svgPath, renderSvg({ app, rel, recoverAtSec: report.recoverAtSec, params }));
  return { jsonPath, svgPath, report };
}

function renderSvg({ app, rel, recoverAtSec, params }) {
  const W = 1000, H = 520;
  const m = { top: 56, right: 72, bottom: 56, left: 60 };
  const pw = W - m.left - m.right;
  const ph = H - m.top - m.bottom;

  const ts = rel.map((s) => s.ts);
  const tMax = Math.max(1, ...ts);
  const fpsVals = rel.map((s) => s.fps).filter((v) => v != null);
  const memVals = rel.flatMap((s) => [s.jsHeapBytes, s.rssKb])
    .filter((v) => v != null);
  const fpsMax = Math.max(60, Math.ceil((Math.max(0, ...fpsVals) + 5) / 10) * 10);
  const memMaxMB = Math.max(1, ...rel.map((s) => s.rssKb == null ? 0 : s.rssKb / 1024),
    ...rel.map((s) => s.jsHeapBytes == null ? 0 : s.jsHeapBytes / 1048576));
  const memTop = Math.ceil((memMaxMB * 1.1) / 25) * 25 || 25;

  const x = (t) => m.left + (t / tMax) * pw;
  const yFps = (v) => m.top + ph - (v / fpsMax) * ph;
  const yMem = (mb) => m.top + ph - (mb / memTop) * ph;

  const linePath = (pts) => {
    let d = '', pen = false;
    for (const [px, py] of pts) {
      if (py == null) { pen = false; continue; }
      d += (pen ? 'L' : 'M') + px.toFixed(1) + ',' + py.toFixed(1) + ' ';
      pen = true;
    }
    return d.trim();
  };

  const fpsPts = rel.map((s) => [x(s.ts), s.fps == null ? null : yFps(s.fps)]);
  const rssPts = rel.map((s) => [x(s.ts), s.rssKb == null ? null : yMem(s.rssKb / 1024)]);
  const heapPts = rel.map((s) => [x(s.ts), s.jsHeapBytes == null ? null : yMem(s.jsHeapBytes / 1048576)]);

  const COL = { fps: '#4ade80', rss: '#f97316', heap: '#3b82f6', grid: '#2d3748', axis: '#9ca3af', bg: '#0f141c', text: '#e6e8eb' };

  let svg = '';
  svg += `<svg xmlns="http://www.w3.org/2000/svg" width="${W}" height="${H}" viewBox="0 0 ${W} ${H}" font-family="monospace">`;
  svg += `<rect width="${W}" height="${H}" fill="${COL.bg}"/>`;
  svg += `<text x="${m.left}" y="28" fill="${COL.text}" font-size="16" font-weight="bold">${esc(app)} — framerate &amp; memory over time</text>`;
  const sub = `duration ${params.durationSec}s` + (params.recoverSec ? ` + recover ${params.recoverSec}s` : '') + ` · ${rel.length} samples`;
  svg += `<text x="${m.left}" y="46" fill="${COL.axis}" font-size="11">${esc(sub)}</text>`;

  // Horizontal grid + dual y ticks.
  for (let i = 0; i <= 5; i++) {
    const gy = m.top + (ph * i) / 5;
    svg += `<line x1="${m.left}" y1="${gy}" x2="${m.left + pw}" y2="${gy}" stroke="${COL.grid}" stroke-width="1"/>`;
    const fv = Math.round(fpsMax * (1 - i / 5));
    const mv = Math.round(memTop * (1 - i / 5));
    svg += `<text x="${m.left - 8}" y="${gy + 4}" fill="${COL.fps}" font-size="10" text-anchor="end">${fv}</text>`;
    svg += `<text x="${m.left + pw + 8}" y="${gy + 4}" fill="${COL.rss}" font-size="10" text-anchor="start">${mv}</text>`;
  }
  // X ticks.
  const xticks = 6;
  for (let i = 0; i <= xticks; i++) {
    const tv = (tMax * i) / xticks;
    const gx = x(tv);
    svg += `<line x1="${gx}" y1="${m.top + ph}" x2="${gx}" y2="${m.top + ph + 5}" stroke="${COL.axis}"/>`;
    svg += `<text x="${gx}" y="${m.top + ph + 18}" fill="${COL.axis}" font-size="10" text-anchor="middle">${tv.toFixed(0)}s</text>`;
  }
  svg += `<text x="${m.left + pw / 2}" y="${H - 8}" fill="${COL.axis}" font-size="11" text-anchor="middle">elapsed (s)</text>`;
  svg += `<text x="14" y="${m.top + ph / 2}" fill="${COL.fps}" font-size="11" text-anchor="middle" transform="rotate(-90 14 ${m.top + ph / 2})">FPS</text>`;
  svg += `<text x="${W - 12}" y="${m.top + ph / 2}" fill="${COL.rss}" font-size="11" text-anchor="middle" transform="rotate(90 ${W - 12} ${m.top + ph / 2})">memory (MB)</text>`;

  // Recover marker.
  if (recoverAtSec != null) {
    const rx = x(recoverAtSec);
    svg += `<line x1="${rx}" y1="${m.top}" x2="${rx}" y2="${m.top + ph}" stroke="#ef4444" stroke-width="1.5" stroke-dasharray="5 4"/>`;
    svg += `<text x="${rx + 4}" y="${m.top + 12}" fill="#ef4444" font-size="10">RECOVER</text>`;
  }

  svg += `<path d="${linePath(heapPts)}" fill="none" stroke="${COL.heap}" stroke-width="1.5" opacity="0.9"/>`;
  svg += `<path d="${linePath(rssPts)}" fill="none" stroke="${COL.rss}" stroke-width="1.5" opacity="0.9"/>`;
  svg += `<path d="${linePath(fpsPts)}" fill="none" stroke="${COL.fps}" stroke-width="2"/>`;

  // Legend.
  const items = [['FPS', COL.fps], ['RSS (MB)', COL.rss], ['JS heap (MB)', COL.heap]];
  let lx = m.left + pw - 320;
  for (const [label, col] of items) {
    svg += `<rect x="${lx}" y="40" width="14" height="3" fill="${col}"/>`;
    svg += `<text x="${lx + 20}" y="46" fill="${COL.text}" font-size="11">${label}</text>`;
    lx += 110;
  }

  svg += `</svg>`;
  return svg;
}

function esc(s) {
  return String(s).replace(/[<>&]/g, (c) => ({ '<': '&lt;', '>': '&gt;', '&': '&amp;' }[c]));
}
