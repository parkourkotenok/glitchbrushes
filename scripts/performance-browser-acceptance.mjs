import { spawn, spawnSync } from 'node:child_process';
import { mkdtempSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join, resolve } from 'node:path';

const appUrl = process.env.GLITCHBRUSHES_URL ?? 'http://127.0.0.1:4173/?perf=1&tool=glitch-brushes&controls=simple';
const browserName = process.argv.find((arg) => arg.startsWith('--browser='))?.split('=')[1] ?? 'edge';
const delay = (ms) => new Promise((resolveDelay) => setTimeout(resolveDelay, ms));
const profile = mkdtempSync(join(tmpdir(), `glitchbrushes-${browserName}-`));

function deserialize(remote) {
  if (!remote || typeof remote !== 'object') return remote;
  if (remote.type === 'null') return null;
  if (remote.type === 'undefined') return undefined;
  if ('value' in remote) {
    if (remote.type === 'array') return remote.value.map(deserialize);
    if (remote.type === 'object') {
      return Object.fromEntries(remote.value.map(([key, value]) => [deserialize(key), deserialize(value)]));
    }
    return remote.value;
  }
  return remote;
}

class Rpc {
  constructor(url, bidi = false) {
    this.socket = new WebSocket(url);
    this.bidi = bidi;
    this.id = 0;
    this.pending = new Map();
  }
  async open() {
    await new Promise((resolveOpen, reject) => {
      this.socket.addEventListener('open', resolveOpen, { once: true });
      this.socket.addEventListener('error', reject, { once: true });
    });
    this.socket.addEventListener('message', (event) => {
      const message = JSON.parse(event.data);
      if (!message.id) return;
      const pending = this.pending.get(message.id);
      if (!pending) return;
      this.pending.delete(message.id);
      clearTimeout(pending.timer);
      if (message.error || message.type === 'error') {
        pending.reject(new Error(message.error?.message ?? `${message.error}: ${message.message}`));
      } else {
        pending.resolve(this.bidi ? message.result : message.result);
      }
    });
  }
  send(method, params = {}, timeout = 60000) {
    const id = ++this.id;
    return new Promise((resolveSend, reject) => {
      const timer = setTimeout(() => {
        this.pending.delete(id);
        reject(new Error(`${method} timed out.`));
      }, timeout);
      this.pending.set(id, { resolve: resolveSend, reject, timer });
      this.socket.send(JSON.stringify({ id, method, params }));
    });
  }
  close() { this.socket.close(); }
}

async function waitFor(callback, timeout = 30000) {
  const started = Date.now();
  while (Date.now() - started < timeout) {
    try {
      const value = await callback();
      if (value) return value;
    } catch {
      // Browser endpoint or page is not ready yet.
    }
    await delay(80);
  }
  throw new Error(`Timed out after ${timeout} ms.`);
}

function summarize(values = []) {
  const sorted = [...values].sort((a, b) => a - b);
  const at = (ratio) => sorted[Math.min(sorted.length - 1, Math.floor((sorted.length - 1) * ratio))] ?? 0;
  return { count: sorted.length, p50: at(0.5), p95: at(0.95), max: sorted.at(-1) ?? 0 };
}

async function stopBrowser(child) {
  if (child.exitCode !== null) return;
  child.kill();
  await Promise.race([
    new Promise((resolveExit) => child.once('exit', resolveExit)),
    delay(1500),
  ]);
  if (child.exitCode === null && process.platform === 'win32') {
    spawnSync('taskkill', ['/PID', String(child.pid), '/T', '/F'], {
      stdio: 'ignore',
      windowsHide: true,
    });
  }
}

async function exercise(evaluate, stroke, capabilities) {
  await waitFor(() => evaluate(`document.querySelector('.work-canvas')?.width > 1`));
  await delay(700);
  const canvas = await evaluate(`(() => { const r=document.querySelector('.work-canvas').getBoundingClientRect(); return {x:r.x,y:r.y,width:r.width,height:r.height}; })()`);
  const before = JSON.parse(await evaluate(`document.documentElement.getAttribute('data-glitchbrush-performance')`));
  const zoomBefore = await evaluate(`document.querySelector('.zoom-readout')?.textContent ?? ''`);
  for (let index = 0; index < 20; index += 1) {
    const start = { x: canvas.x + canvas.width * 0.2, y: canvas.y + canvas.height * (0.2 + (index % 10) * 0.055) };
    const end = { x: start.x + canvas.width * 0.09, y: start.y + 6 };
    await stroke(start, end);
    await delay(180);
  }
  await delay(900);
  const after = JSON.parse(await evaluate(`document.documentElement.getAttribute('data-glitchbrush-performance')`));
  const zoomAfter = await evaluate(`document.querySelector('.zoom-readout')?.textContent ?? ''`);
  const delta = (name) => (after.counts[name] ?? 0) - (before.counts[name] ?? 0);
  return {
    browser: capabilities,
    document: await evaluate(`document.querySelector('.topbar-file')?.textContent.trim() ?? ''`),
    strokes: 20,
    canvasDirtyUploadDelta: delta('glitchbrushes:canvas-dirty-upload'),
    canvasFullSyncDelta: delta('glitchbrushes:canvas-full-sync'),
    fitToScreenDelta: delta('glitchbrushes:fit-to-screen'),
    zoomStable: zoomBefore === zoomAfter,
    adoption: summarize((after.samples['glitchbrushes:worker-result-adoption'] ?? []).slice(-20)),
    layerCommit: summarize((after.samples['glitchbrushes:commit-current-buffer'] ?? []).slice(-20)),
    canvasUpload: summarize((after.samples['glitchbrushes:canvas-dirty-upload'] ?? []).slice(-20)),
    rafGaps: summarize(after.rafGaps),
    rafGapsOver50ms: after.rafGaps.filter((gap) => gap >= 50).length,
  };
}

async function runEdge() {
  const executable = 'C:\\Program Files (x86)\\Microsoft\\Edge\\Application\\msedge.exe';
  const port = 9341;
  const process = spawn(executable, [
    `--remote-debugging-port=${port}`,
    `--user-data-dir=${profile}`,
    '--no-first-run',
    '--no-default-browser-check',
    '--disable-features=msEdgeFirstRunExperience',
    '--window-size=1500,980',
    appUrl,
  ], { stdio: 'ignore', windowsHide: false });
  let rpc;
  try {
    const target = await waitFor(async () => {
      const response = await fetch(`http://127.0.0.1:${port}/json`);
      const pages = await response.json();
      return pages.find((page) => page.type === 'page' && page.url.startsWith(appUrl.split('?')[0]));
    }, 20000);
    rpc = new Rpc(target.webSocketDebuggerUrl);
    await rpc.open();
    await rpc.send('Runtime.enable');
    const evaluate = async (expression) => {
      const result = await rpc.send('Runtime.evaluate', { expression, awaitPromise: true, returnByValue: true, userGesture: true });
      if (result.exceptionDetails) throw new Error(result.exceptionDetails.text);
      return result.result.value;
    };
    const stroke = async (start, end) => {
      await rpc.send('Input.dispatchMouseEvent', { type: 'mouseMoved', x: start.x, y: start.y });
      await rpc.send('Input.dispatchMouseEvent', { type: 'mousePressed', x: start.x, y: start.y, button: 'left', buttons: 1, clickCount: 1 });
      for (let step = 1; step <= 4; step += 1) {
        const ratio = step / 4;
        await rpc.send('Input.dispatchMouseEvent', { type: 'mouseMoved', x: start.x + (end.x - start.x) * ratio, y: start.y + (end.y - start.y) * ratio, button: 'left', buttons: 1 });
      }
      await rpc.send('Input.dispatchMouseEvent', { type: 'mouseReleased', x: end.x, y: end.y, button: 'left', buttons: 0, clickCount: 1 });
    };
    return await exercise(evaluate, stroke, { name: 'Microsoft Edge', version: await evaluate('navigator.userAgent') });
  } finally {
    rpc?.close();
    await stopBrowser(process);
    await delay(500);
  }
}

async function runFirefox() {
  const executable = 'C:\\Program Files\\Mozilla Firefox\\firefox.exe';
  const port = 9228;
  const process = spawn(executable, ['--no-remote', '--profile', profile, `--remote-debugging-port=${port}`, '--width=1500', '--height=980', appUrl], { stdio: 'ignore', windowsHide: false });
  let rpc;
  try {
    rpc = await waitFor(async () => {
      const candidate = new Rpc(`ws://127.0.0.1:${port}/session`, true);
      try { await candidate.open(); return candidate; } catch { candidate.close(); return null; }
    }, 25000);
    const session = await rpc.send('session.new', { capabilities: { alwaysMatch: { acceptInsecureCerts: true } } });
    const tree = await rpc.send('browsingContext.getTree', {});
    const context = tree.contexts.find((entry) => entry.url.startsWith(appUrl.split('?')[0]))?.context;
    if (!context) throw new Error('Firefox application context was not found.');
    const evaluate = async (expression) => {
      const result = await rpc.send('script.evaluate', { expression, target: { context }, awaitPromise: true, resultOwnership: 'none', userActivation: true });
      if (result.type === 'exception') throw new Error(result.exceptionDetails?.text ?? 'Firefox evaluation failed.');
      return deserialize(result.result);
    };
    const stroke = async (start, end) => {
      const actions = [{ type: 'pointerMove', x: Math.round(start.x), y: Math.round(start.y), duration: 0, origin: 'viewport' }, { type: 'pointerDown', button: 0 }];
      for (let step = 1; step <= 4; step += 1) {
        const ratio = step / 4;
        actions.push({ type: 'pointerMove', x: Math.round(start.x + (end.x - start.x) * ratio), y: Math.round(start.y + (end.y - start.y) * ratio), duration: 20, origin: 'viewport' });
      }
      actions.push({ type: 'pointerUp', button: 0 });
      await rpc.send('input.performActions', { context, actions: [{ type: 'pointer', id: `stroke-${Date.now()}`, parameters: { pointerType: 'mouse' }, actions }] }, 60000);
    };
    const report = await exercise(evaluate, stroke, { name: 'Mozilla Firefox', version: session.capabilities.browserVersion, headed: !session.capabilities['moz:headless'] });
    await rpc.send('session.end', {});
    return report;
  } finally {
    rpc?.close();
    await stopBrowser(process);
    await delay(500);
  }
}

try {
  console.log(JSON.stringify(browserName === 'firefox' ? await runFirefox() : await runEdge(), null, 2));
} finally {
  const resolvedProfile = resolve(profile);
  const resolvedTemp = resolve(tmpdir());
  if (resolvedProfile.startsWith(resolvedTemp + '\\')) {
    for (let attempt = 0; attempt < 4; attempt += 1) {
      try {
        rmSync(resolvedProfile, { recursive: true, force: true });
        break;
      } catch (error) {
        if (attempt === 3) console.error(`Temporary profile cleanup deferred: ${error.message}`);
        else await delay(500);
      }
    }
  }
}
