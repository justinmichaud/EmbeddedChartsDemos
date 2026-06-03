// Thin host: init wasm, own the rAF loop, forward events, bridge settings.
// No framework. The Rust Engine owns every pixel inside <canvas id="charts">.
import init, { Engine } from './wasm/charts.js';

interface Settings { currency: string; numCharts: number }
const DEFAULT_SETTINGS: Settings = { currency: 'USD', numCharts: 50 };

function loadSettings(): Settings {
  try {
    const raw = localStorage.getItem('settings');
    if (raw) return { ...DEFAULT_SETTINGS, ...JSON.parse(raw) };
  } catch { /* ignore */ }
  return { ...DEFAULT_SETTINGS };
}
function saveSettings(s: Settings) {
  localStorage.setItem('settings', JSON.stringify(s));
}

async function main() {
  await init();

  const $ = <T extends HTMLElement>(id: string) => document.getElementById(id) as T;
  const stage = $<HTMLDivElement>('stage');
  const canvas = $<HTMLCanvasElement>('charts');
  const sweepEl = $<HTMLElement>('sweep');
  const newsfeed = $<HTMLElement>('newsfeed');
  const engine = new Engine(canvas);

  // --- sizing: in grid view the canvas is sized to the chart content height
  // (below the NEWSFEED panel) so the stage scrolls; detail view fills the
  // viewport and hides the news/sweep chrome. Crisp on HiDPI via DPR. ---
  const relayout = () => {
    const dpr = window.devicePixelRatio || 1;
    const detail = engine.view() === 1;
    newsfeed.style.display = detail ? 'none' : '';
    sweepEl.style.display = detail ? 'none' : '';
    const vw = stage.clientWidth;
    const vh = stage.clientHeight;
    if (detail) {
      canvas.style.width = vw + 'px';
      canvas.style.height = vh + 'px';
      engine.resize(vw, vh, dpr);
      return;
    }
    const newsH = newsfeed.offsetHeight;
    const gh = engine.grid_height(vw);
    const h = Math.max(vh - newsH, gh);
    canvas.style.width = vw + 'px';
    canvas.style.height = h + 'px';
    sweepEl.style.height = (newsH + h) + 'px';
    engine.resize(vw, h, dpr);
  };
  new ResizeObserver(relayout).observe(stage);

  // --- settings ---
  let settings = loadSettings();
  engine.set_currency(settings.currency);
  engine.set_num_charts(settings.numCharts);
  relayout();

  // --- chrome wiring ---
  const dialog = $<HTMLDialogElement>('settings');
  const currencySel = $<HTMLSelectElement>('currency');
  const numInput = $<HTMLInputElement>('num-charts');
  const backBtn = $<HTMLButtonElement>('back');
  const fpsEl = $<HTMLElement>('fps');
  const clockEl = $<HTMLElement>('clock');
  const newsTexts = Array.from(newsfeed.querySelectorAll<HTMLElement>('.news-text'));

  const updateNews = () => {
    const lines = engine.news_lines();
    newsTexts.forEach((el, i) => { el.textContent = lines[i] ?? ''; });
  };
  updateNews();

  $('open-settings').addEventListener('click', () => {
    currencySel.value = settings.currency;
    numInput.value = String(settings.numCharts);
    dialog.showModal();
  });
  dialog.addEventListener('close', () => {
    if (dialog.returnValue === 'reset') {
      settings = { ...DEFAULT_SETTINGS };
    } else {
      settings = {
        currency: currencySel.value,
        numCharts: Math.max(2, Math.min(50, Number(numInput.value) || 14)),
      };
    }
    engine.set_currency(settings.currency);
    engine.set_num_charts(settings.numCharts);
    saveSettings(settings);
    relayout();
  });

  $('lag').addEventListener('click', () => engine.toggle_lag());

  const syncChrome = () => {
    backBtn.classList.toggle('hidden', engine.view() !== 1);
    relayout();
  };
  backBtn.addEventListener('click', () => { engine.pointer_down(-1, -1); syncChrome(); });
  canvas.addEventListener('pointerdown', (e) => {
    const r = canvas.getBoundingClientRect();
    engine.pointer_down(e.clientX - r.left, e.clientY - r.top);
    syncChrome();
  });
  syncChrome();

  // --- main loop ---
  let frames = 0;
  let lastFpsT = performance.now();
  let lastNews = '';
  const loop = (now: number) => {
    engine.frame(now);

    // CSS sweep overlay — position advances one discrete step per sim tick
    // (only when there's new data), kept in HTML rather than repainted on canvas.
    sweepEl.style.setProperty('--sweep', engine.sweep_pos() * 100 + '%');

    frames++;
    if (now - lastFpsT >= 1000) {
      fpsEl.textContent = String(frames);
      frames = 0;
      lastFpsT = now;
      clockEl.textContent = new Date().toLocaleTimeString();
      const news = engine.current_news();
      if (news !== lastNews) { updateNews(); lastNews = news; }
    }
    requestAnimationFrame(loop);
  };
  requestAnimationFrame(loop);

  // expose for tests/automation
  (window as unknown as { __engine: Engine }).__engine = engine;
}

main();
