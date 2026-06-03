// Per-app configuration for the web-charts benchmarks. rootDir is relative to
// this bench/ directory and is resolved by each launcher.
//
// recoverable: the app has the iframe-reload "RECOVER" action wired up.
// JSChartsSimple is served from its app root (its index.html references
// dist/index.js with a relative path and uses no /EmbeddedChartsDemos/ base).

export const WEB_APPS = {
  CanvasCharts:      { app: 'CanvasCharts',      rootDir: '../CanvasCharts/dist',      base: '/EmbeddedChartsDemos/', entry: 'index.html', recoverable: true },
  JSChartsFast:      { app: 'JSChartsFast',      rootDir: '../JSChartsFast/dist',      base: '/EmbeddedChartsDemos/', entry: 'index.html', recoverable: true },
  JSChartsFastServo: { app: 'JSChartsFastServo', rootDir: '../JSChartsFastServo/dist', base: '/EmbeddedChartsDemos/', entry: 'index.html', recoverable: true },
  JSChartsNoLeaks:   { app: 'JSChartsNoLeaks',   rootDir: '../JSChartsNoLeaks/dist',   base: '/EmbeddedChartsDemos/', entry: 'index.html', recoverable: true },
  WasmCharts:        { app: 'WasmCharts',        rootDir: '../WasmCharts/dist',        base: '/EmbeddedChartsDemos/', entry: 'index.html', recoverable: false },
  JSChartsSimple:    { app: 'JSChartsSimple',    rootDir: '../JSChartsSimple',         base: '/',                     entry: 'index.html', recoverable: false },
};
