#!/usr/bin/env node
// Benchmark launcher for JSChartsFastServo — runs the Servo-targeted build in a
// REAL Servo browser (via WebDriver), not Chromium. Override defaults with
// flags, e.g.:
//   node bench-JSChartsFastServo.mjs --duration 30 [--interval 1000]
// Env: SERVO_BIN, SERVO_WEBDRIVER_PORT, SERVO_WINDOW_SIZE (see servo-bench.mjs).
// There is no recover phase on Servo (no CDP); --recover is ignored.
//
// To run the same build in Chromium for comparison, use
// bench-JSChartsFastServoChromium.mjs instead.
import { servoBench, configFromArgs } from './servo-bench.mjs';
import { WEB_APPS } from './web-apps.mjs';
import { fileURLToPath } from 'node:url';
import * as path from 'node:path';

const here = path.dirname(fileURLToPath(import.meta.url));
const def = { ...WEB_APPS.JSChartsFastServo };
def.rootDir = path.resolve(here, def.rootDir);
servoBench(configFromArgs(def)).catch((e) => { console.error(e); process.exit(1); });
