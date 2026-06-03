// Shared CLI helpers: argument parsing + console summary printing.

export function parseArgs(argv) {
  const out = {};
  for (let i = 0; i < argv.length; i++) {
    const a = argv[i];
    if (a.startsWith('--')) {
      const key = a.slice(2);
      const next = argv[i + 1];
      if (next === undefined || next.startsWith('--')) { out[key] = true; }
      else { out[key] = next; i++; }
    }
  }
  return out;
}

export function num(v, dflt) {
  const n = Number(v);
  return isFinite(n) ? n : dflt;
}

function fmt(v, digits = 1) {
  return v == null ? '   —' : v.toFixed(digits);
}

export function printSummary(app, summary, recoverAtSec) {
  console.log(`\n${'='.repeat(64)}`);
  console.log(`  ${app} — benchmark summary`);
  console.log('='.repeat(64));
  for (const [phase, s] of Object.entries(summary)) {
    console.log(`\n  [${phase}]  ${s.durationSec.toFixed(1)}s, ${s.samples} samples`);
    console.log(`    FPS        avg ${fmt(s.fps.avg)}  min ${fmt(s.fps.min)}  p5 ${fmt(s.fps.p5)}  max ${fmt(s.fps.max)}`);
    console.log(`    RSS  (MB)  avg ${fmt(s.rssMB.avg)}  min ${fmt(s.rssMB.min)}  max ${fmt(s.rssMB.max)}`);
    console.log(`    JSheap(MB) avg ${fmt(s.jsHeapMB.avg)}  min ${fmt(s.jsHeapMB.min)}  max ${fmt(s.jsHeapMB.max)}`);
  }
  if (recoverAtSec != null) console.log(`\n  recover triggered at ${recoverAtSec.toFixed(1)}s`);
}
