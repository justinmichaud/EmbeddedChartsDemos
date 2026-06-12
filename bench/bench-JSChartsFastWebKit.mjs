#!/usr/bin/env node
// Benchmark launcher for JSChartsFast in the local WebKit (GTK) build, driven
// over WebDriver inside the wkdev container (see webkit-bench.mjs).
//   node bench-JSChartsFastWebKit.mjs --duration 30 [--interval 1000]
import { webkitBench, configFromArgs } from './webkit-bench.mjs';
import { WEB_APPS } from './web-apps.mjs';
import { fileURLToPath } from 'node:url';
import * as path from 'node:path';

const here = path.dirname(fileURLToPath(import.meta.url));
const def = { ...WEB_APPS.JSChartsFastWebKit };
def.rootDir = path.resolve(here, def.rootDir);
webkitBench(configFromArgs(def)).catch((e) => { console.error(e); process.exit(1); });
