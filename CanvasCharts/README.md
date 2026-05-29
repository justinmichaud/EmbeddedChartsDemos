# Stock Chart Viewer — CanvasCharts

A from-scratch, fast rebuild of `JSChartsFast`, with the same goals:

- A grid of pretty stock charts that update fast (5 Hz sim).
- Don't leak memory.

How it differs from `JSChartsFast`:

- **No React, no recharts, no SVG.** Each chart's plot is drawn directly to its
  own `<canvas>` with Canvas2D. App chrome (menubar, newsfeed, settings dialog,
  sweep overlay) and the per-chart text rows are plain DOM/CSS.
- **Same 3-tier architecture** is kept: a Web `Worker` runs the simulation, the
  host page (`index.html` / `src/main.ts`) owns a single `<iframe>`, and the
  iframe (`iframe.html` / `src/iframe-main.ts`) renders. Navigation recreates the
  iframe, throwing away its heap — this is the memory-reset / leak-prevention
  mechanism.

Rendering is immediate-mode and **only repaints charts whose data changed**;
card DOM is created once and only `textContent` mutates each tick, so there is no
per-tick allocation in the hot path.

## Layout

- `src/worker.ts` — the simulation (copied unchanged from JSChartsFast).
- `src/types/messages.ts` — worker/main/iframe message contracts (unchanged).
- `src/main.ts` — host: owns the Worker + iframe, relays messages, recreates the
  iframe on navigate/recover (unchanged).
- `src/iframe-main.ts` — renderer: card pool, rAF loop, chrome wiring.
- `src/render/chart.ts` — `drawChart()`, the Canvas2D plot routine.
- `src/render/layout.ts` — canvas sizing + responsive grid helpers.
- `iframe.html` / `src/styles.css` — HTML chrome + dark terminal theme.

## Development

(No `buildPrefix` editing needed — `src/main.ts` derives it from Vite's
`BASE_URL`, so dev and the deployed build both work as-is.)

```
~/.npm-global/bin/pnpm install
~/.npm-global/bin/pnpm dev
```

## Memory test

```
~/.npm-global/bin/pnpm build
~/.npm-global/bin/pnpm dlx serve dist
```
