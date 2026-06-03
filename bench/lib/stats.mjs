// Summary statistics over an array of samples.

export function summarize(samples, key) {
  const xs = samples.map((s) => s[key]).filter((v) => typeof v === 'number' && isFinite(v));
  if (xs.length === 0) return { n: 0, min: null, max: null, avg: null, median: null, p5: null, p95: null };
  const sorted = [...xs].sort((a, b) => a - b);
  const sum = xs.reduce((a, b) => a + b, 0);
  const pct = (p) => sorted[Math.min(sorted.length - 1, Math.max(0, Math.round((p / 100) * (sorted.length - 1))))];
  return {
    n: xs.length,
    min: sorted[0],
    max: sorted[sorted.length - 1],
    avg: sum / xs.length,
    median: pct(50),
    p5: pct(5),
    p95: pct(95),
  };
}

// Build a per-phase summary block ({run, recover}) for fps + memory metrics.
export function summarizePhases(samples) {
  const byPhase = {};
  for (const s of samples) {
    (byPhase[s.phase] ||= []).push(s);
  }
  const out = {};
  for (const [phase, rows] of Object.entries(byPhase)) {
    out[phase] = {
      durationSec: rows.length ? (rows[rows.length - 1].t - rows[0].t) / 1000 : 0,
      samples: rows.length,
      fps: summarize(rows, 'fps'),
      jsHeapMB: summarize(rows.map((r) => ({ v: r.jsHeapBytes == null ? null : r.jsHeapBytes / 1048576 })), 'v'),
      rssMB: summarize(rows.map((r) => ({ v: r.rssKb == null ? null : r.rssKb / 1024 })), 'v'),
    };
  }
  return out;
}
