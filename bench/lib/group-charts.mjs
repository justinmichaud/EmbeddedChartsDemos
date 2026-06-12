// Grouped comparison charts. Given this session's per-app JSON reports and a
// set of group definitions, render — for each group — TWO standalone SVGs:
// one for framerate (FPS) and one for memory (RSS, MB), each a single panel
// with one colored line per group member (using the member's display label,
// not its internal app name). One file per metric per group, as requested.

import * as fs from 'node:fs';
import * as path from 'node:path';

const PALETTE = [
  '#4ade80', '#3b82f6', '#f97316', '#e879f9', '#facc15',
  '#22d3ee', '#ef4444', '#a3e635', '#fb7185', '#818cf8',
];

// reportsByApp: Map<appName, parsedReport>. groups: see groups.mjs.
// Returns the list of written file paths.
export function writeGroupCharts({ reportsByApp, groups, outDir, stamp }) {
  fs.mkdirSync(outDir, { recursive: true });
  const written = [];

  for (const group of groups) {
    const entries = group.members
      .map((mem, i) => {
        const r = reportsByApp.get(mem.app);
        if (!r || !Array.isArray(r.samples) || !r.samples.length) return null;
        return {
          label: mem.label,
          color: PALETTE[i % PALETTE.length],
          samples: r.samples,
          recoverAtSec: r.recoverAtSec,
          avgFps: r.summary?.run?.fps?.avg ?? null,
          peakRssMB: maxAcross(r, 'rssMB'),
        };
      })
      .filter(Boolean);

    if (!entries.length) {
      console.log(`  (group "${group.title}": no reports — skipped)`);
      continue;
    }

    const fpsFile = path.join(outDir, `${group.slug}-fps-${stamp}.svg`);
    const memFile = path.join(outDir, `${group.slug}-memory-${stamp}.svg`);
    fs.writeFileSync(fpsFile, renderPanel(entries, {
      metric: 'fps', title: `${group.title} — framerate`, axis: 'FPS', unit: 'fps', stamp,
    }));
    fs.writeFileSync(memFile, renderPanel(entries, {
      metric: 'rssMB', title: `${group.title} — memory (RSS)`, axis: 'RSS (MB)', unit: 'MB', stamp,
    }));
    written.push(fpsFile, memFile);
  }
  return written;
}

function maxAcross(report, key) {
  let m = null;
  for (const s of report.samples) {
    if (s[key] != null && (m == null || s[key] > m)) m = s[key];
  }
  return m;
}

function renderPanel(entries, { metric, title, axis, unit, stamp }) {
  const W = 1100;
  const legendRows = entries.length;
  const headH = 44 + legendRows * 16 + 10;
  const panelH = 340;
  const H = headH + panelH + 56;
  const m = { left: 64, right: 24 };
  const pw = W - m.left - m.right;

  const tMax = Math.max(1, ...entries.flatMap((e) => e.samples.map((s) => s.ts)));
  const valOf = (s) => s[metric];
  let yMax;
  if (metric === 'fps') {
    yMax = Math.max(60, Math.ceil((Math.max(0, ...entries.flatMap((e) => e.samples.map((s) => s.fps ?? 0))) + 5) / 10) * 10);
  } else {
    const peak = Math.max(1, ...entries.flatMap((e) => e.samples.map((s) => s.rssMB ?? 0)));
    yMax = Math.ceil((peak * 1.1) / 50) * 50 || 50;
  }

  const COL = { grid: '#2d3748', axis: '#9ca3af', bg: '#0f141c', text: '#e6e8eb' };
  const x = (t) => m.left + (t / tMax) * pw;
  const top = headH;
  const yv = (v) => top + panelH - (v / yMax) * panelH;

  let svg = `<svg xmlns="http://www.w3.org/2000/svg" width="${W}" height="${H}" viewBox="0 0 ${W} ${H}" font-family="monospace">`;
  svg += `<rect width="${W}" height="${H}" fill="${COL.bg}"/>`;
  svg += `<text x="${m.left}" y="26" fill="${COL.text}" font-size="16" font-weight="bold">${esc(title)}</text>`;
  svg += `<text x="${m.left}" y="42" fill="${COL.axis}" font-size="10">session ${esc(stamp)} · ${esc(axis)} over elapsed time</text>`;

  // Legend: one row per member with the headline stat for this metric.
  entries.forEach((e, i) => {
    const ly = 58 + i * 16;
    const stat = metric === 'fps' ? `${fmt(e.avgFps, 0)} fps avg` : `${fmt(e.peakRssMB, 0)} MB peak`;
    svg += `<rect x="${m.left}" y="${ly - 8}" width="14" height="4" fill="${e.color}"/>`;
    svg += `<text x="${m.left + 20}" y="${ly - 3}" fill="${COL.text}" font-size="11">${esc(e.label)}  (${esc(stat)})</text>`;
  });

  // grid + y ticks
  for (let i = 0; i <= 5; i++) {
    const gy = top + (panelH * i) / 5;
    svg += `<line x1="${m.left}" y1="${gy}" x2="${m.left + pw}" y2="${gy}" stroke="${COL.grid}"/>`;
    svg += `<text x="${m.left - 8}" y="${gy + 4}" fill="${COL.axis}" font-size="10" text-anchor="end">${Math.round(yMax * (1 - i / 5))}</text>`;
  }
  // x ticks
  for (let i = 0; i <= 6; i++) {
    const tv = (tMax * i) / 6;
    const gx = x(tv);
    svg += `<line x1="${gx}" y1="${top + panelH}" x2="${gx}" y2="${top + panelH + 5}" stroke="${COL.axis}"/>`;
    svg += `<text x="${gx}" y="${top + panelH + 17}" fill="${COL.axis}" font-size="10" text-anchor="middle">${tv.toFixed(0)}s</text>`;
  }
  svg += `<text x="14" y="${top + panelH / 2}" fill="${COL.axis}" font-size="11" text-anchor="middle" transform="rotate(-90 14 ${top + panelH / 2})">${esc(axis)}</text>`;
  svg += `<text x="${m.left + pw / 2}" y="${H - 10}" fill="${COL.axis}" font-size="11" text-anchor="middle">elapsed (s)</text>`;

  // recover markers (de-duplicated across members)
  const recs = [...new Set(entries.map((e) => e.recoverAtSec).filter((v) => v != null).map((v) => Math.round(v)))];
  for (const rv of recs) {
    const rx = x(rv);
    svg += `<line x1="${rx}" y1="${top}" x2="${rx}" y2="${top + panelH}" stroke="#ef4444" stroke-width="1" stroke-dasharray="4 4" opacity="0.5"/>`;
  }
  if (recs.length) svg += `<text x="${x(recs[0]) + 4}" y="${top + 12}" fill="#ef4444" font-size="9" opacity="0.8">RECOVER</text>`;

  // one line per member
  for (const e of entries) {
    let d = '', pen = false;
    for (const samp of e.samples) {
      const v = valOf(samp);
      if (v == null) { pen = false; continue; }
      d += (pen ? 'L' : 'M') + x(samp.ts).toFixed(1) + ',' + yv(v).toFixed(1) + ' ';
      pen = true;
    }
    if (d) svg += `<path d="${d.trim()}" fill="none" stroke="${e.color}" stroke-width="1.8"/>`;
  }

  svg += `</svg>`;
  return svg;
}

function fmt(v, d = 1) { return v == null ? '—' : v.toFixed(d); }
function esc(s) { return String(s).replace(/[<>&]/g, (c) => ({ '<': '&lt;', '>': '&gt;', '&': '&amp;' }[c])); }
