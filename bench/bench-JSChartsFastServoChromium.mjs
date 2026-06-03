#!/usr/bin/env node
// Benchmark launcher for JSChartsFastServoChromium — the Servo-targeted build
// run in Chromium (the standard Playwright harness), so the same code can be
// compared against the real-Servo run (bench-JSChartsFastServo.mjs).
//   node bench-JSChartsFastServoChromium.mjs --duration 30 --recover 15 [--interval 1000]
import { webBench, configFromArgs } from './web-bench.mjs';
import { WEB_APPS } from './web-apps.mjs';
import { fileURLToPath } from 'node:url';
import * as path from 'node:path';

const here = path.dirname(fileURLToPath(import.meta.url));
const def = { ...WEB_APPS.JSChartsFastServoChromium };
def.rootDir = path.resolve(here, def.rootDir);
webBench(configFromArgs(def)).catch((e) => { console.error(e); process.exit(1); });
