// Minimal W3C WebDriver client over HTTP — just the endpoints the Servo
// benchmark needs (session, navigate, frame-switch, execute, delete). Kept
// dependency-free (uses global fetch) because Servo only speaks WebDriver, not
// the CDP/Playwright protocol the Chromium harness uses.
//
// NOTE: the base URL must be 127.0.0.1, not localhost — Servo's WebDriver
// server rejects a "Host: localhost:PORT" header with "Invalid Host header".

export class WebDriver {
  constructor(port) {
    this.base = `http://127.0.0.1:${port}`;
    this.sessionId = null;
  }

  async #send(method, path, body) {
    const res = await fetch(this.base + path, {
      method,
      headers: { 'Content-Type': 'application/json' },
      body: body === undefined ? undefined : JSON.stringify(body),
    });
    const json = await res.json().catch(() => ({}));
    if (!res.ok || (json && json.value && json.value.error)) {
      const msg = json?.value?.message || json?.value?.error || `HTTP ${res.status}`;
      throw new Error(`WebDriver ${method} ${path}: ${msg}`);
    }
    return json.value;
  }

  async newSession() {
    const value = await this.#send('POST', '/session', { capabilities: { alwaysMatch: {} } });
    this.sessionId = value.sessionId;
    return value;
  }

  navigate(url) { return this.#send('POST', `/session/${this.sessionId}/url`, { url }); }

  // id: a frame index (number), or null to return to the top-level document.
  switchToFrame(id) { return this.#send('POST', `/session/${this.sessionId}/frame`, { id }); }

  // Runs in whichever frame is currently switched-to. Returns the script's
  // return value (already JSON-decoded by WebDriver).
  execute(script, args = []) {
    return this.#send('POST', `/session/${this.sessionId}/execute/sync`, { script, args });
  }

  async deleteSession() {
    if (!this.sessionId) return;
    try { await this.#send('DELETE', `/session/${this.sessionId}`); } catch { /* best effort */ }
    this.sessionId = null;
  }
}

// Poll until the WebDriver server accepts a session, or time out. Servo takes a
// few seconds to bring its WebDriver port up after launch.
export async function waitForWebDriver(port, timeoutMs = 20000) {
  const deadline = Date.now() + timeoutMs;
  let lastErr;
  while (Date.now() < deadline) {
    const wd = new WebDriver(port);
    try { await wd.newSession(); return wd; }
    catch (e) { lastErr = e; await new Promise((r) => setTimeout(r, 500)); }
  }
  throw new Error(`Servo WebDriver did not come up on port ${port}: ${lastErr?.message || 'timeout'}`);
}
