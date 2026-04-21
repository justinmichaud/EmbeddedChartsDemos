import "./modulepreload-polyfill-DaKOjhqt.js";
const buildPrefix = "/EmbeddedChartsDemos/";
const worker = new Worker(new URL(
  /* @vite-ignore */
  "/EmbeddedChartsDemos/assets/worker-BJBEFqmw.js",
  import.meta.url
), { type: "module" });
let iframe = null;
function createIframe(src = "/iframe.html") {
  if (iframe) {
    iframe.remove();
    iframe = null;
  }
  const el = document.createElement("iframe");
  el.id = "frame";
  el.src = buildPrefix + src;
  document.body.appendChild(el);
  iframe = el;
  el.addEventListener("load", () => {
    worker.postMessage({ type: "REQUEST_SNAPSHOT" });
  });
}
const saved = localStorage.getItem("settings");
worker.postMessage({
  type: "INIT",
  settings: saved ? JSON.parse(saved) : {}
});
worker.onmessage = (e) => {
  var _a;
  if (e.data.type === "SAVE_SETTINGS") {
    localStorage.setItem("settings", JSON.stringify(e.data.settings));
    return;
  }
  (_a = iframe == null ? void 0 : iframe.contentWindow) == null ? void 0 : _a.postMessage(e.data, "*");
};
window.addEventListener("message", (e) => {
  if (!iframe || e.source !== iframe.contentWindow) return;
  const msg = e.data;
  switch (msg.type) {
    case "NAVIGATE_DETAIL":
      createIframe(`/iframe.html?stock=${encodeURIComponent(msg.symbol)}`);
      break;
    case "NAVIGATE_HOME":
      createIframe("/iframe.html");
      break;
    case "RECOVER":
      createIframe("/iframe.html");
      break;
    case "CLEAR_STORAGE":
      localStorage.clear();
      worker.postMessage({ type: "RESET_SETTINGS" });
      createIframe("/iframe.html");
      break;
    case "UPDATE_SETTINGS":
      worker.postMessage({ type: "UPDATE_SETTINGS", settings: msg.settings });
      break;
    case "TOGGLE_LAG":
      worker.postMessage({ type: "TOGGLE_LAG" });
      break;
  }
});
createIframe();
//# sourceMappingURL=main-CIB2CoQX.js.map
