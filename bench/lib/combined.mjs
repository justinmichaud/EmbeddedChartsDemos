// Combined comparison report across multiple per-app runs from one session.
// Reads the per-app JSON reports and renders a single SVG with two stacked
// panels — FPS vs time and memory (RSS) vs time — one colored line per app,
// plus a legend showing each app's average FPS and peak RSS.

import * as fs from 'node:fs';
import * as path from 'node:path';

const PALETTE = [
  '#4ade80', '#3b82f6', '#f97316', '#e879f9', '#facc15',
  '#22d3ee', '#ef4444', '#a3e635', '#fb7185', '#818cf8',
];

// reports: array of parsed report objects (see report.mjs writeReport output).
export function writeCombined({ reports, outDir, stamp }) {
  fs.mkdirSync(outDir, { recursive: true });
  const svgPath = path.join(outDir, `_combined-${stamp}.svg`);
  const jsonPath = path.join(outDir, `_combined-${stamp}.json`);

  const entries = reports
    .filter((r) => r && Array.isArray(r.samples) && r.samples.length)
    .map((r, i) => ({
      app: r.app,
      color: PALETTE[i % PALETTE.length],
      samples: r.samples,
      recoverAtSec: r.recoverAtSec,
      avgFps: r.summary?.run?.fps?.avg ?? null,
      peakRssMB: maxAcross(r, 'rssMB'),
    }));

  fs.writeFileSync(jsonPath, JSON.stringify({
    generatedAt: stamp,
    apps: entries.map((e) => ({ app: e.app, avgFps: e.avgFps, peakRssMB: e.peakRssMB })),
  }, null, 2));

  fs.writeFileSync(svgPath, renderCombined(entries, stamp));
  return { svgPath, jsonPath };
}

function maxAcross(report, key) {
  let m = null;
  for (const s of report.samples) {
    if (s[key] != null && (m == null || s[key] > m)) m = s[key];
  }
  return m;
}

function renderCombined(entries, stamp) {
  const W = 1100;
  const legendRows = Math.ceil(entries.length / 2);
  const headH = 40 + legendRows * 18 + 12;
  const panelH = 250;
  const gap = 48;
  const H = headH + panelH * 2 + gap + 40;
  const m = { left: 64, right: 24 };
  const pw = W - m.left - m.right;

  const tMax = Math.max(1, ...entries.flatMap((e) => e.samples.map((s) => s.ts)));
  const fpsMax = Math.max(60, Math.ceil((Math.max(0, ...entries.flatMap((e) => e.samples.map((s) => s.fps ?? 0))) + 5) / 10) * 10);
  const memMax = Math.max(1, ...entries.flatMap((e) => e.samples.map((s) => s.rssMB ?? 0)));
  const memTop = Math.ceil((memMax * 1.1) / 50) * 50 || 50;

  const COL = { grid: '#2d3748', axis: '#9ca3af', bg: '#0f141c', text: '#e6e8eb' };
  const x = (t) => m.left + (t / tMax) * pw;

  let svg = `<svg xmlns="http://www.w3.org/2000/svg" width="${W}" height="${H}" viewBox="0 0 ${W} ${H}" font-family="monospace">`;
  svg += `<rect width="${W}" height="${H}" fill="${COL.bg}"/>`;
  svg += `<text x="${m.left}" y="26" fill="${COL.text}" font-size="16" font-weight="bold">Charts comparison — ${esc(entries.length)} demos</text>`;
  svg += `<text x="${m.left}" y="42" fill="${COL.axis}" font-size="10">session ${esc(stamp)} · FPS (top) and RSS memory (bottom) over elapsed time</text>`;

  // Legend with avg fps + peak RSS per app.
  entries.forEach((e, i) => {
    const col = i % 2;
    const row = Math.floor(i / 2);
    const lx = m.left + col * (pw / 2);
    const ly = 56 + row * 18;
    const stat = `${e.app}  (${fmt(e.avgFps, 0)} fps avg · ${fmt(e.peakRssMB, 0)} MB peak)`;
    svg += `<rect x="${lx}" y="${ly - 8}" width="14" height="4" fill="${e.color}"/>`;
    svg += `<text x="${lx + 20}" y="${ly - 3}" fill="${COL.text}" font-size="11">${esc(stat)}</text>`;
  });

  const panel = (top, yMaxVal, label, valueOf, ticksStep) => {
    let s = '';
    const yv = (v) => top + panelH - (v / yMaxVal) * panelH;
    // grid + y ticks
    for (let i = 0; i <= 5; i++) {
      const gy = top + (panelH * i) / 5;
      s += `<line x1="${m.left}" y1="${gy}" x2="${m.left + pw}" y2="${gy}" stroke="${COL.grid}"/>`;
      s += `<text x="${m.left - 8}" y="${gy + 4}" fill="${COL.axis}" font-size="10" text-anchor="end">${Math.round(yMaxVal * (1 - i / 5))}</text>`;
    }
    // x ticks
    for (let i = 0; i <= 6; i++) {
      const tv = (tMax * i) / 6;
      const gx = x(tv);
      s += `<line x1="${gx}" y1="${top + panelH}" x2="${gx}" y2="${top + panelH + 5}" stroke="${COL.axis}"/>`;
      s += `<text x="${gx}" y="${top + panelH + 17}" fill="${COL.axis}" font-size="10" text-anchor="middle">${tv.toFixed(0)}s</text>`;
    }
    s += `<text x="14" y="${top + panelH / 2}" fill="${COL.axis}" font-size="11" text-anchor="middle" transform="rotate(-90 14 ${top + panelH / 2})">${label}</text>`;
    // recover markers (de-duplicated)
    const recs = [...new Set(entries.map((e) => e.recoverAtSec).filter((v) => v != null).map((v) => Math.round(v)))];
    for (const rv of recs) {
      const rx = x(rv);
      s += `<line x1="${rx}" y1="${top}" x2="${rx}" y2="${top + panelH}" stroke="#ef4444" stroke-width="1" stroke-dasharray="4 4" opacity="0.5"/>`;
    }
    if (recs.length) s += `<text x="${x(recs[0]) + 4}" y="${top + 12}" fill="#ef4444" font-size="9" opacity="0.8">RECOVER</text>`;
    // one line per app
    for (const e of entries) {
      let d = '', pen = false;
      for (const samp of e.samples) {
        const v = valueOf(samp);
        if (v == null) { pen = false; continue; }
        d += (pen ? 'L' : 'M') + x(samp.ts).toFixed(1) + ',' + yv(v).toFixed(1) + ' ';
        pen = true;
      }
      if (d) s += `<path d="${d.trim()}" fill="none" stroke="${e.color}" stroke-width="1.6"/>`;
    }
    return s;
  };

  const fpsTop = headH;
  const memTopY = headH + panelH + gap;
  svg += `<text x="${m.left}" y="${fpsTop - 6}" fill="${COL.text}" font-size="12" font-weight="bold">Framerate (FPS)</text>`;
  svg += panel(fpsTop, fpsMax, 'FPS', (s) => s.fps);
  svg += `<text x="${m.left}" y="${memTopY - 6}" fill="${COL.text}" font-size="12" font-weight="bold">Memory — RSS (MB)</text>`;
  svg += panel(memTopY, memTop, 'RSS (MB)', (s) => s.rssMB);

  svg += `<text x="${m.left + pw / 2}" y="${H - 8}" fill="${COL.axis}" font-size="11" text-anchor="middle">elapsed (s)</text>`;
  svg += `</svg>`;
  return svg;
}

function fmt(v, d = 1) { return v == null ? '—' : v.toFixed(d); }
function esc(s) { return String(s).replace(/[<>&]/g, (c) => ({ '<': '&lt;', '>': '&gt;', '&': '&amp;' }[c])); }
