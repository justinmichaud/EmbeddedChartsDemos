// Memory sampling for a process and all of its descendants.
// RSS (resident set size, via `ps`) works on macOS + Linux. PSS (proportional
// set size, via /proc/<pid>/smaps_rollup) is Linux-only and is the fairer
// cross-engine metric: it divides shared pages by the number of processes
// sharing them, so summing across a multi-process tree doesn't double-count
// shared memory (which otherwise penalizes engines with more processes).

import { execFile } from 'node:child_process';
import { promisify } from 'node:util';
import * as fs from 'node:fs';

const execFileP = promisify(execFile);

// Return a map pid -> { ppid, rssKb, comm } for every process on the system.
async function snapshot() {
  // -A: all processes; -o: custom columns. Same flags work on macOS + Linux.
  const { stdout } = await execFileP('ps', ['-Ao', 'pid=,ppid=,rss=,comm=']);
  const map = new Map();
  for (const line of stdout.split('\n')) {
    const m = line.trim().match(/^(\d+)\s+(\d+)\s+(\d+)\s+(.*)$/);
    if (!m) continue;
    const pid = Number(m[1]);
    map.set(pid, { ppid: Number(m[2]), rssKb: Number(m[3]), comm: m[4] });
  }
  return map;
}

// Collect pid + all transitive children.
function descendants(map, rootPid) {
  const children = new Map();
  for (const [pid, info] of map) {
    if (!children.has(info.ppid)) children.set(info.ppid, []);
    children.get(info.ppid).push(pid);
  }
  const out = [];
  const stack = [rootPid];
  const seen = new Set();
  while (stack.length) {
    const pid = stack.pop();
    if (seen.has(pid)) continue;
    seen.add(pid);
    if (map.has(pid)) out.push(pid);
    for (const c of children.get(pid) || []) stack.push(c);
  }
  return out;
}

// Sum RSS (KB) of `rootPid` and every descendant. Returns null if the root is gone.
export async function treeRssKb(rootPid) {
  if (!rootPid) return null;
  try {
    const map = await snapshot();
    if (!map.has(rootPid)) return null;
    const pids = descendants(map, rootPid);
    let total = 0;
    for (const pid of pids) total += map.get(pid)?.rssKb || 0;
    return total;
  } catch {
    return null;
  }
}

// Sum RSS, PSS and USS (KB) over `rootPid` and every descendant in one pass.
// RSS comes from `ps`; PSS/USS from /proc/<pid>/smaps_rollup (Linux only).
//   PSS = proportional set size (shared pages divided by # of sharers)
//   USS = unique/private set size (Private_Clean + Private_Dirty) — the strict
//         floor: RAM this tree costs that nothing else shares.
// pssKb/ussKb are null when smaps is unavailable (e.g. macOS), so callers/charts
// can simply omit those metrics. rssKb is null only if the root is already gone.
export async function treeMemAll(rootPid) {
  const none = { rssKb: null, pssKb: null, ussKb: null };
  if (!rootPid) return none;
  try {
    const map = await snapshot();
    if (!map.has(rootPid)) return none;
    const pids = descendants(map, rootPid);
    let rss = 0, pss = 0, uss = 0, anySmaps = false;
    for (const pid of pids) {
      rss += map.get(pid)?.rssKb || 0;
      try {
        const data = fs.readFileSync(`/proc/${pid}/smaps_rollup`, 'utf8');
        const mp = data.match(/^Pss:\s+(\d+)\s*kB/m);
        if (mp) { pss += Number(mp[1]); anySmaps = true; }
        for (const m of data.matchAll(/^Private_(?:Clean|Dirty):\s+(\d+)\s*kB/gm)) uss += Number(m[1]);
      } catch { /* process gone / kernel thread / no perm */ }
    }
    return { rssKb: rss, pssKb: anySmaps ? pss : null, ussKb: anySmaps ? uss : null };
  } catch {
    return none;
  }
}
