// Resident-set-size (RSS) sampling for a process and all of its descendants.
// Works on macOS and Linux via `ps`. RSS is reported in KB by `ps`.

import { execFile } from 'node:child_process';
import { promisify } from 'node:util';

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
