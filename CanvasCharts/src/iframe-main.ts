// Renderer entry for the iframe. No framework: builds a pool of chart "cards"
// (DOM) once, mutates only their text per tick, and repaints each card's
// <canvas> via Canvas2D only when its data changed. Receives DATA snapshots
// from the host (which relays them from the worker) and posts navigation /
// settings intents back to the host.

import './styles.css';
import type { IframeToMainMessage, WorkerToMainMessage } from './types/messages';
import { drawChart, makeYState, type DataMsg, type YState } from './render/chart';
import { dpr, sizeCanvas } from './render/layout';

const HISTORY_LEN = 60;
const CURRENCIES = ['USD', 'EUR', 'GBP', 'JPY', 'CNY', 'CHF', 'AUD', 'CAD'];
const CHART_COUNTS = [2, 4, 8, 14, 20, 30, 40, 50];
const AGE_SAMPLES = 10;

const params = new URLSearchParams(location.search);
const detailSymbol = params.get('stock');
const isDetail = !!detailSymbol;

function send(msg: IframeToMainMessage) {
  window.parent.postMessage(msg, '*');
}

const $ = <T extends HTMLElement>(id: string) => document.getElementById(id) as T;

// ---------- chrome refs ----------
const gridEl = $<HTMLDivElement>('grid');
const sweepEl = $<HTMLDivElement>('sweep');
const newsfeedEl = $<HTMLElement>('newsfeed');
const newsTextEls = Array.from(document.querySelectorAll<HTMLElement>('.news-text'));
const fpsEl = $('fps');
const clockEl = $('clock');
const lagMsEl = $('lag-ms');
const ccyEl = $('ccy');
const backBtn = $<HTMLButtonElement>('back');
const detailBanner = $('detail-banner');
const detailLabel = $('detail-label');
const lagBtn = $<HTMLButtonElement>('lag');
const dialog = $<HTMLDialogElement>('settings');

// ---------- card pool ----------
interface Card {
  root: HTMLDivElement;
  symEl: HTMLElement;
  chgEl: HTMLElement;
  bidEl: HTMLElement;
  midEl: HTMLElement;
  askEl: HTMLElement;
  highEl: HTMLElement;
  lowEl: HTMLElement;
  ccyEl: HTMLElement;
  sprEl: HTMLElement;
  canvas: HTMLCanvasElement;
  ctx: CanvasRenderingContext2D | null;
  cssW: number;
  cssH: number;
  needsResize: boolean;
  y: YState;
  symbol: string;
}

const CARD_HTML = `
  <div class="card-head"><span class="sym"></span><span class="chg"></span></div>
  <div class="card-quotes"><div class="quote-grid">
    <div><div class="q-label">BID</div><div class="q-bid"></div></div>
    <div><div class="q-label">MID</div><div class="q-mid"></div></div>
    <div><div class="q-label">ASK</div><div class="q-ask"></div></div>
    <div><div class="q-label">HIGH</div><div class="q-hl q-high"></div></div>
    <div><div class="q-label">LOW</div><div class="q-hl q-low"></div></div>
  </div></div>
  <div class="card-plot"><canvas></canvas></div>
  <div class="card-foot"><div class="foot-grid">
    <div><span class="k">CCY: </span><span class="v c-ccy"></span></div>
    <div><span class="k">SPR: </span><span class="v c-spr"></span></div>
    <div><span class="k">UPD: </span><span class="v">5Hz</span></div>
  </div></div>`;

let cards: Card[] = [];
const ro = new ResizeObserver((entries) => {
  for (const e of entries) {
    const card = (e.target as HTMLElement & { __card?: Card }).__card;
    if (!card) continue;
    const r = e.contentRect;
    card.cssW = Math.round(r.width);
    card.cssH = Math.round(r.height);
    card.needsResize = true;
  }
  dirty = true;
});

function createCard(enlarged: boolean, clickable: boolean): Card {
  const root = document.createElement('div');
  root.className = clickable ? 'card clickable' : 'card';
  root.innerHTML = CARD_HTML;
  const q = <T extends HTMLElement>(sel: string) => root.querySelector(sel) as T;
  const plot = q<HTMLDivElement>('.card-plot');
  plot.style.height = (enlarged ? 320 : 96) + 'px';
  const canvas = q<HTMLCanvasElement>('canvas');
  const card: Card = {
    root,
    symEl: q('.sym'),
    chgEl: q('.chg'),
    bidEl: q('.q-bid'),
    midEl: q('.q-mid'),
    askEl: q('.q-ask'),
    highEl: q('.q-high'),
    lowEl: q('.q-low'),
    ccyEl: q('.c-ccy'),
    sprEl: q('.c-spr'),
    canvas,
    ctx: null,
    cssW: 0,
    cssH: 0,
    needsResize: true,
    y: makeYState(),
    symbol: '',
  };
  (plot as HTMLElement & { __card?: Card }).__card = card;
  ro.observe(plot);
  if (clickable) {
    root.addEventListener('click', () => {
      if (card.symbol) send({ type: 'NAVIGATE_DETAIL', symbol: card.symbol });
    });
  }
  return card;
}

function rebuildCards(n: number, enlarged: boolean, clickable: boolean) {
  for (const c of cards) {
    ro.unobserve(c.canvas.parentElement!);
  }
  cards = [];
  gridEl.replaceChildren();
  for (let i = 0; i < n; i++) {
    const card = createCard(enlarged, clickable);
    cards.push(card);
    gridEl.appendChild(card.root);
  }
  dirty = true;
}

// ---------- state ----------
let latest: DataMsg | null = null;
let dirty = false; // some card needs repaint
let lastNewsIndex = -1;
let lastCurrency = '';

const ageBuffer = new Array<number>(AGE_SAMPLES).fill(0);
let ageIdx = 0;

window.addEventListener('message', (e: MessageEvent<WorkerToMainMessage>) => {
  const msg = e.data;
  if (!msg || msg.type !== 'DATA') return;
  latest = msg;

  // Rolling message-age average (worker → here latency).
  const age = performance.timeOrigin + performance.now() - msg.timestamp;
  ageBuffer[ageIdx % AGE_SAMPLES] = age;
  ageIdx++;

  // Currency chrome.
  if (msg.settings.currency !== lastCurrency) {
    lastCurrency = msg.settings.currency;
    ccyEl.textContent = lastCurrency;
  }

  if (isDetail) {
    if (cards.length === 0) rebuildCards(1, true, false);
  } else {
    const n = msg.stockSymbols.length;
    if (cards.length !== n) rebuildCards(n, false, true);
  }

  updateText(msg);
  if (dialog.open) syncSettingsSelection();
  dirty = true;
});

function updateText(msg: DataMsg) {
  for (let ci = 0; ci < cards.length; ci++) {
    const card = cards[ci];
    const s = isDetail ? msg.stockSymbols.indexOf(detailSymbol!) : ci;
    if (s < 0) {
      card.symEl.textContent = detailSymbol ?? '';
      continue;
    }
    card.symbol = msg.stockSymbols[s];

    const base = s * HISTORY_LEN;
    const head = msg.stockHead[s];
    const lastIdx = base + ((head + HISTORY_LEN - 1) % HISTORY_LEN);
    const firstIdx = base + (head % HISTORY_LEN);

    // High/low over the window.
    let high = -Infinity;
    let low = Infinity;
    for (let i = 0; i < HISTORY_LEN; i++) {
      const idx = base + i;
      if (msg.stockAsk[idx] > high) high = msg.stockAsk[idx];
      if (msg.stockBid[idx] < low) low = msg.stockBid[idx];
    }

    const curMid = msg.stockMid[lastIdx];
    const curBid = msg.stockBid[lastIdx];
    const curAsk = msg.stockAsk[lastIdx];
    const firstMid = msg.stockMid[firstIdx];
    const change = firstMid !== 0 ? ((curMid - firstMid) / firstMid) * 100 : 0;

    card.symEl.textContent = card.symbol;
    card.chgEl.textContent = (change >= 0 ? '+' : '') + change.toFixed(3) + '%';
    card.chgEl.style.color = change >= 0 ? '#10b981' : '#ef4444';
    card.bidEl.textContent = curBid.toFixed(3);
    card.midEl.textContent = curMid.toFixed(3);
    card.askEl.textContent = curAsk.toFixed(3);
    card.highEl.textContent = high.toFixed(3);
    card.lowEl.textContent = low.toFixed(3);
    card.ccyEl.textContent = msg.settings.currency;
    card.sprEl.textContent = '$' + (curAsk - curBid).toFixed(4);
  }
}

function repaint(msg: DataMsg) {
  const ratio = dpr();
  for (let ci = 0; ci < cards.length; ci++) {
    const card = cards[ci];
    if (card.cssW <= 0 || card.cssH <= 0) continue;
    const s = isDetail ? msg.stockSymbols.indexOf(detailSymbol!) : ci;
    if (s < 0) continue;
    if (card.needsResize || !card.ctx) {
      card.ctx = sizeCanvas(card.canvas, card.cssW, card.cssH, ratio);
      card.needsResize = false;
    }
    drawChart(card.ctx, msg, s, card.cssW, card.cssH, isDetail, card.y);
  }
}

// ---------- rAF loop: chrome + repaint ----------
let frames = 0;
let lastFpsT = performance.now();

function loop(now: number) {
  if (dirty && latest) {
    repaint(latest);
    sweepEl.style.setProperty('--sweep', latest.sweepPos * 100 + '%');
    updateNews(latest);
    dirty = false;
  }

  frames++;
  if (now - lastFpsT >= 1000) {
    fpsEl.textContent = String(frames);
    frames = 0;
    lastFpsT = now;
    clockEl.textContent = new Date().toLocaleTimeString();
    let sum = 0;
    for (let i = 0; i < AGE_SAMPLES; i++) sum += ageBuffer[i];
    lagMsEl.textContent = (sum / AGE_SAMPLES).toFixed(1);
  }
  requestAnimationFrame(loop);
}

function updateNews(msg: DataMsg) {
  if (msg.newsIndex === lastNewsIndex || !msg.headlines.length) return;
  lastNewsIndex = msg.newsIndex;
  for (let off = 0; off < newsTextEls.length; off++) {
    const i = (msg.newsIndex - off + msg.headlines.length) % msg.headlines.length;
    newsTextEls[off].textContent = msg.headlines[i];
  }
}

// ---------- settings dialog ----------
function buildSettings() {
  const cGrid = $('currency-grid');
  const nGrid = $('charts-grid');
  cGrid.replaceChildren();
  nGrid.replaceChildren();
  for (const c of CURRENCIES) {
    const b = document.createElement('button');
    b.type = 'button';
    b.className = 'opt';
    b.textContent = c;
    b.dataset.ccy = c;
    b.addEventListener('click', () => send({ type: 'UPDATE_SETTINGS', settings: { currency: c } }));
    cGrid.appendChild(b);
  }
  for (const n of CHART_COUNTS) {
    const b = document.createElement('button');
    b.type = 'button';
    b.className = 'opt';
    b.textContent = String(n);
    b.dataset.num = String(n);
    b.addEventListener('click', () => send({ type: 'UPDATE_SETTINGS', settings: { numCharts: n } }));
    nGrid.appendChild(b);
  }
}

function syncSettingsSelection() {
  if (!latest) return;
  for (const b of document.querySelectorAll<HTMLElement>('[data-ccy]')) {
    b.classList.toggle('sel', b.dataset.ccy === latest.settings.currency);
  }
  for (const b of document.querySelectorAll<HTMLElement>('[data-num]')) {
    b.classList.toggle('sel', Number(b.dataset.num) === latest.settings.numCharts);
  }
}

// ---------- wiring ----------
buildSettings();

$('open-settings').addEventListener('click', () => {
  syncSettingsSelection();
  dialog.showModal();
});
$('settings-close').addEventListener('click', (e) => {
  e.preventDefault();
  dialog.close();
});
$('clear-storage').addEventListener('click', (e) => {
  e.preventDefault();
  dialog.close();
  send({ type: 'CLEAR_STORAGE' });
});

lagBtn.addEventListener('click', () => {
  lagBtn.classList.toggle('active');
  lagBtn.textContent = lagBtn.classList.contains('active') ? 'LAG ON' : 'LAG';
  send({ type: 'TOGGLE_LAG' });
});
$('recover').addEventListener('click', () => send({ type: 'RECOVER' }));
backBtn.addEventListener('click', () => send({ type: 'NAVIGATE_HOME' }));

// View chrome.
if (isDetail) {
  newsfeedEl.classList.add('hidden');
  sweepEl.classList.add('hidden');
  backBtn.classList.remove('hidden');
  detailBanner.classList.remove('hidden');
  detailLabel.textContent = `${detailSymbol} — DETAIL VIEW`;
  gridEl.classList.add('detail');
}

requestAnimationFrame(loop);

// expose for tests/automation
(window as unknown as { __cards: () => Card[] }).__cards = () => cards;
