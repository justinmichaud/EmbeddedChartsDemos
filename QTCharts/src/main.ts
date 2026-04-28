import type { WorkerToMainMessage, MainToWorkerMessage, IframeToMainMessage } from './types/messages';
const buildPrefix = import.meta.env.BASE_URL;

const worker = new Worker(new URL('./worker.ts', import.meta.url), { type: 'module' });
let iframe: HTMLIFrameElement | null = null;

function createIframe(src = '/iframe.html') {
  if (iframe) {
    iframe.remove();
    iframe = null;
  }
  const el = document.createElement('iframe');
  el.id = 'frame';
  el.src = buildPrefix + src;
  document.body.appendChild(el);
  iframe = el;
  el.addEventListener('load', () => {
    worker.postMessage({ type: 'REQUEST_SNAPSHOT' } satisfies MainToWorkerMessage);
  });
}

// Load persisted settings and send to worker on startup
const saved = localStorage.getItem('settings');
worker.postMessage({
  type: 'INIT',
  settings: saved ? JSON.parse(saved) : {},
} satisfies MainToWorkerMessage);

// Worker → iframe relay
worker.onmessage = (e: MessageEvent<WorkerToMainMessage>) => {
  if (e.data.type === 'SAVE_SETTINGS') {
    localStorage.setItem('settings', JSON.stringify(e.data.settings));
    return;
  }
  iframe?.contentWindow?.postMessage(e.data, '*');
};

// iframe → main/worker relay
window.addEventListener('message', (e: MessageEvent<IframeToMainMessage>) => {
  if (!iframe || e.source !== iframe.contentWindow) return;
  const msg = e.data;
  switch (msg.type) {
    case 'NAVIGATE_DETAIL':
      createIframe(`/iframe.html?stock=${encodeURIComponent(msg.symbol)}`);
      break;
    case 'NAVIGATE_HOME':
      createIframe('/iframe.html');
      break;
    case 'RECOVER':
      createIframe('/iframe.html');
      break;
    case 'CLEAR_STORAGE':
      localStorage.clear();
      worker.postMessage({ type: 'RESET_SETTINGS' } satisfies MainToWorkerMessage);
      createIframe('/iframe.html');
      break;
    case 'UPDATE_SETTINGS':
      worker.postMessage({ type: 'UPDATE_SETTINGS', settings: msg.settings } satisfies MainToWorkerMessage);
      break;
    case 'TOGGLE_LAG':
      worker.postMessage({ type: 'TOGGLE_LAG' } satisfies MainToWorkerMessage);
      break;
  }
});

createIframe();
