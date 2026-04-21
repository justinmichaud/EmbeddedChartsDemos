# JS Charts Simple

A simple TypeScript application that renders an animated sine wave on an HTML5 canvas.

## Setup

1. Install dependencies:
   ```bash
   npm install
   ```

## Development

To run the development server:

```bash
npm run dev
```

This will start esbuild in watch mode to automatically rebuild on changes, and launch an esbuild development server at `http://localhost:3000`. Open `index.html` in your browser. Hot reloading is automatically enabled when served locally - changes to the code will automatically rebuild and refresh in the browser.

## Production Build

To build a minified production version:

```bash
npm run build
```

This will generate a minified `dist/index.js` file. Open `index.html` in your browser to view the production build. This file contains no development overhead or hot reload scripts.

## Project Structure

- `src/index.ts`: Main TypeScript source code
- `index.html`: HTML page with the canvas
- `dist/`: Output directory for compiled JavaScript
- `package.json`: Project configuration and scripts
- `tsconfig.json`: TypeScript configuration