import { defineConfig } from 'vite';
import { resolve } from 'path';

// The Rust engine is built by `wasm-pack ... --target web` into src/wasm/.
// That output self-fetches its .wasm via import.meta.url, which Vite serves
// as an asset — no extra plugin needed.
export default defineConfig({
  root: '.',
  build: {
    target: 'esnext',
    minify: false,
    sourcemap: true,
    rollupOptions: {
      input: { main: resolve(__dirname, 'index.html') },
    },
  },
});
