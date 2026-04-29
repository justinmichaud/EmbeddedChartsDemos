// Standalone analyzer: read a .cpuprofile and print top inclusive (self + children) costs.
// Usage: npx tsx tests/analyze-profile.ts cpu-profile-prod.cpuprofile
import * as fs from 'fs';

interface ProfileNode {
  id: number;
  callFrame: { functionName: string; url: string; lineNumber: number };
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

const file = process.argv[2] || 'cpu-profile-prod.cpuprofile';
const profile: CpuProfile = JSON.parse(fs.readFileSync(file, 'utf8'));
const SAMPLE_US = 100;
const totalUs = profile.endTime - profile.startTime;

const byId = new Map<number, ProfileNode>();
for (const n of profile.nodes) byId.set(n.id, n);

// build parent map
const parent = new Map<number, number | null>();
for (const n of profile.nodes) {
  parent.set(n.id, parent.get(n.id) ?? null);
  if (n.children) for (const c of n.children) parent.set(c, n.id);
}

// self & inclusive time per id
const selfBy = new Map<number, number>();
for (const id of profile.samples) selfBy.set(id, (selfBy.get(id) || 0) + SAMPLE_US);

// inclusive: walk up ancestors for each sample
const inclBy = new Map<number, number>();
for (const id of profile.samples) {
  let cur: number | null = id;
  while (cur != null) {
    inclBy.set(cur, (inclBy.get(cur) || 0) + SAMPLE_US);
    cur = parent.get(cur) ?? null;
  }
}

function frameKey(n: ProfileNode): string {
  const cf = n.callFrame;
  const fname = cf.functionName || '(anonymous)';
  const fileName = (cf.url || '').split('/').slice(-1).join('/');
  return `${fname}@${fileName}:${cf.lineNumber + 1}`;
}

// aggregate by frame name
const aggSelf = new Map<string, number>();
const aggIncl = new Map<string, number>();
for (const n of profile.nodes) {
  const k = frameKey(n);
  aggSelf.set(k, (aggSelf.get(k) || 0) + (selfBy.get(n.id) || 0));
  aggIncl.set(k, (aggIncl.get(k) || 0) + (inclBy.get(n.id) || 0));
}

function printTop(label: string, m: Map<string, number>, limit = 25) {
  const rows = [...m.entries()].sort((a, b) => b[1] - a[1]).slice(0, limit);
  console.log(`\n=== ${label} (total ${(totalUs / 1000).toFixed(0)}ms) ===`);
  for (const [k, v] of rows) {
    const pct = (v / totalUs * 100).toFixed(1).padStart(5);
    const ms  = (v / 1000).toFixed(1).padStart(7);
    console.log(`${pct}%  ${ms} ms  ${k}`);
  }
}

printTop('top INCLUSIVE time', aggIncl);
printTop('top SELF time',     aggSelf);
