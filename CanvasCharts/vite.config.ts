import { defineConfig } from 'vite';
import { resolve } from 'path';

// Two entry points, mirroring JSChartsFast: the host shell (index.html) and the
// renderer iframe (iframe.html). minify off + sourcemaps so the production
// bundle stays readable for memory/perf profiling.
export default defineConfig({
  build: {
    rollupOptions: {
      input: {
        main: resolve(__dirname, 'index.html'),
        iframe: resolve(__dirname, 'iframe.html'),
      },
    },
    minify: false,
    sourcemap: true,
  },
});
