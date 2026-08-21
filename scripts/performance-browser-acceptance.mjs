import { spawn, spawnSync } from 'node:child_process';
import { mkdtempSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join, resolve } from 'node:path';

const appUrl =
  process.env.GLITCHBRUSHES_URL ??
  'http://127.0.0.1:4173/?perf=1&tool=glitch-brushes&controls=simple';
const browserName =
  process.argv.find((arg) => arg.startsWith('--browser='))?.split('=')[1] ?? 'edge';
const effectName =
  process.argv.find((arg) => arg.startsWith('--effect='))?.split('=')[1] ?? 'Slice Displacement';
const strokeProfile =
  process.argv.find((arg) => arg.startsWith('--stroke='))?.split('=')[1] ?? 'short';
const imageFxId = process.argv.find((arg) => arg.startsWith('--image-fx='))?.split('=')[1] ?? '';
const mutationMode =
  process.argv.find((arg) => arg.startsWith('--mutation='))?.split('=')[1] ?? 'clean';
const delay = (ms) => new Promise((resolveDelay) => setTimeout(resolveDelay, ms));
const profile = mkdtempSync(join(tmpdir(), `glitchbrushes-${browserName}-`));

function deserialize(remote) {
  if (!remote || typeof remote !== 'object') return remote;
  if (remote.type === 'null') return null;
  if (remote.type === 'undefined') return undefined;
  if ('value' in remote) {
    if (remote.type === 'array') return remote.value.map(deserialize);
    if (remote.type === 'object') {
      return Object.fromEntries(
        remote.value.map(([key, value]) => [deserialize(key), deserialize(value)]),
      );
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
  close() {
    this.socket.close();
  }
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
  const at = (ratio) =>
    sorted[Math.min(sorted.length - 1, Math.floor((sorted.length - 1) * ratio))] ?? 0;
  return { count: sorted.length, p50: at(0.5), p95: at(0.95), max: sorted.at(-1) ?? 0 };
}

async function stopBrowser(child) {
  if (child.exitCode !== null) return;
  child.kill();
  await Promise.race([new Promise((resolveExit) => child.once('exit', resolveExit)), delay(1500)]);
  if (child.exitCode === null && process.platform === 'win32') {
    spawnSync('taskkill', ['/PID', String(child.pid), '/T', '/F'], {
      stdio: 'ignore',
      windowsHide: true,
    });
  }
}

async function exercise(evaluate, stroke, capabilities) {
  await waitFor(() => evaluate(`document.querySelector('.work-canvas')?.width > 1`));
  await waitFor(() =>
    evaluate(
      `document.querySelector('.topbar-file')?.textContent.includes('parkour-kotenok-road.jpg')`,
    ),
  );
  if (imageFxId) {
    const openedImageBrush = await evaluate(`(() => {
      const button = [...document.querySelectorAll('nav button')].find((entry) => entry.textContent.trim() === 'Image Brush');
      button?.click();
      return Boolean(button);
    })()`);
    if (!openedImageBrush) throw new Error('Could not open Image Brush.');
    await delay(1000);
    const imageBrushReady = await evaluate(
      `Boolean(document.querySelector('.image-brush-lab') && document.querySelector('.image-brush-source-row'))`,
    );
    if (!imageBrushReady) {
      const state = await evaluate(
        `({ activeTab: [...document.querySelectorAll('nav button')].find((button) => button.getAttribute('aria-current') || button.classList.contains('active'))?.textContent.trim(), tabs: [...document.querySelectorAll('nav button')].map((button) => button.textContent.trim()), panel: document.querySelector('.inspector-scroll')?.textContent.slice(0, 160) })`,
      );
      throw new Error(`Image Brush did not open: ${JSON.stringify(state)}`);
    }
    await waitFor(() =>
      evaluate(
        `document.querySelector('.image-brush-source-copy strong')?.textContent.trim() !== 'No brush image'`,
      ),
    );
    await evaluate(`document.querySelector('[id$="-tab-evolution"]')?.click()`);
    await waitFor(() =>
      evaluate(`document.querySelector('[id$="-tab-evolution"]')?.getAttribute('aria-selected') === 'true'`),
    );
    const configured = await evaluate(`(() => {
      const mutation = [...document.querySelectorAll('.image-brush-lab select')]
        .find((select) => select.closest('label')?.textContent.includes('Evolution mode'));
      if (!mutation || ![...mutation.options].some((option) => option.value === ${JSON.stringify(mutationMode)})) return false;
      Object.getOwnPropertyDescriptor(HTMLSelectElement.prototype, 'value').set.call(mutation, ${JSON.stringify(mutationMode)});
      mutation.dispatchEvent(new Event('change', { bubbles: true }));
      return true;
    })()`);
    if (!configured) throw new Error(`Could not configure Image Brush mutation: ${mutationMode}`);
    await evaluate(`document.querySelector('[id$="-tab-fx"]')?.click()`);
    await waitFor(() =>
      evaluate(`document.querySelector('[id$="-tab-fx"]')?.getAttribute('aria-selected') === 'true'`),
    );
    await delay(250);
    await delay(500);
    const fxEditorReady = await evaluate(
      `Boolean(document.querySelector('.image-brush-add-fx select'))`,
    );
    if (!fxEditorReady) {
      const state = await evaluate(
        `({ mode: new URL(location.href).searchParams.get('controls'), summaries: [...document.querySelectorAll('summary')].map((entry) => ({ text: entry.textContent.trim(), open: entry.closest('details')?.open, childCount: entry.closest('details')?.children.length })) })`,
      );
      throw new Error(`Image Brush FX editor did not mount: ${JSON.stringify(state)}`);
    }
    const added = await evaluate(`(() => {
      const select = document.querySelector('.image-brush-add-fx select');
      if (!select || ![...select.options].some((option) => option.value === ${JSON.stringify(imageFxId)})) return false;
      Object.getOwnPropertyDescriptor(HTMLSelectElement.prototype, 'value').set.call(select, ${JSON.stringify(imageFxId)});
      select.dispatchEvent(new Event('change', { bubbles: true }));
      return true;
    })()`);
    if (!added) throw new Error(`Could not select Image Brush FX: ${imageFxId}`);
    await delay(120);
    const clicked = await evaluate(`(() => {
      const button = [...document.querySelectorAll('.image-brush-add-fx button')].find((entry) => entry.textContent.trim() === 'Add');
      button?.click();
      return Boolean(button);
    })()`);
    if (!clicked) throw new Error(`Could not add Image Brush FX: ${imageFxId}`);
    await waitFor(() =>
      evaluate(`document.querySelectorAll('.image-brush-fx-rack article').length > 0`),
    );
  } else {
    await evaluate(
      `(() => { const button = [...document.querySelectorAll('nav button')].find((entry) => entry.textContent.trim() === 'Effect'); button?.click(); return Boolean(button); })()`,
    );
    await waitFor(() => evaluate(`Boolean(document.querySelector('.effect-picker-trigger'))`));
    const opened = await evaluate(`(() => {
    const trigger = document.querySelector('.effect-picker-trigger');
    if (!trigger) return false;
    trigger.click();
    return true;
  })()`);
    if (!opened) throw new Error('Could not open the effect picker.');
    await waitFor(() =>
      evaluate(`document.querySelectorAll('.effect-picker-group button').length > 0`),
    );
    const selected = await evaluate(`(() => {
    const option = [...document.querySelectorAll('.effect-picker-group button')]
      .find((button) => button.querySelector('strong')?.textContent.trim().startsWith(${JSON.stringify(effectName)}));
    if (!option) return false;
    option.click();
    return true;
  })()`);
    if (!selected) throw new Error(`Could not select effect: ${effectName}`);
    await waitFor(() =>
      evaluate(
        `document.querySelector('.effect-picker-trigger')?.textContent.includes(${JSON.stringify(effectName)})`,
      ),
    );
  }
  await delay(1200);
  const canvas = await evaluate(
    `(() => { const r=document.querySelector('.work-canvas').getBoundingClientRect(); return {x:r.x,y:r.y,width:r.width,height:r.height}; })()`,
  );
  const warmupStart = { x: canvas.x + canvas.width * 0.18, y: canvas.y + canvas.height * 0.55 };
  await stroke(warmupStart, { x: warmupStart.x + canvas.width * 0.09, y: warmupStart.y + 6 });
  await waitFor(() => evaluate(`!document.querySelector('.image-brush-progress')`));
  await delay(1000);
  const before = JSON.parse(
    await evaluate(`document.documentElement.getAttribute('data-glitchbrush-performance')`),
  );
  const zoomBefore = await evaluate(`document.querySelector('.zoom-readout')?.textContent ?? ''`);
  for (let index = 0; index < 20; index += 1) {
    const previousImageUploads = imageFxId
      ? (JSON.parse(
          await evaluate(`document.documentElement.getAttribute('data-glitchbrush-performance')`),
        ).counts['glitchbrushes:image-brush-canvas-upload'] ?? 0)
      : 0;
    const start = {
      x: canvas.x + canvas.width * 0.2,
      y: canvas.y + canvas.height * (0.44 + (index % 10) * 0.032),
    };
    const end = {
      x: start.x + canvas.width * (strokeProfile === 'long' ? 0.48 : 0.09),
      y: start.y + (strokeProfile === 'long' ? 34 : 6),
    };
    await stroke(start, end);
    if (imageFxId) {
      try {
        await waitFor(async () => {
          const metrics = JSON.parse(
            await evaluate(`document.documentElement.getAttribute('data-glitchbrush-performance')`),
          );
          return (
            (metrics.counts['glitchbrushes:image-brush-canvas-upload'] ?? 0) > previousImageUploads
          );
        }, 60000);
      } catch {
        const state = await evaluate(`({
          notice: document.querySelector('.status-message')?.textContent.trim(),
          progress: document.querySelector('.image-brush-progress')?.textContent.trim(),
          rack: document.querySelector('.image-brush-fx-rack')?.textContent.trim().slice(0, 180),
          mutation: [...document.querySelectorAll('.image-brush-lab select')].find((select) => select.closest('label')?.textContent.includes('Evolution mode'))?.value
        })`);
        throw new Error(`Image Brush stroke ${index + 1} did not commit: ${JSON.stringify(state)}`);
      }
      await delay(80);
    } else {
      await delay(180);
    }
  }
  await delay(900);
  const after = JSON.parse(
    await evaluate(`document.documentElement.getAttribute('data-glitchbrush-performance')`),
  );
  const zoomAfter = await evaluate(`document.querySelector('.zoom-readout')?.textContent ?? ''`);
  const hashCanvas = async () =>
    evaluate(`(async () => {
    const canvas = document.querySelector('.work-canvas');
    const bytes = canvas.getContext('2d').getImageData(0, 0, canvas.width, canvas.height).data;
    const digest = await crypto.subtle.digest('SHA-256', bytes);
    return [...new Uint8Array(digest)].map((value) => value.toString(16).padStart(2, '0')).join('');
  })()`);
  const committedHash = await hashCanvas();
  const historyReady = await evaluate(
    `(() => { const button = document.querySelector('button[aria-label="Undo"]'); if (!button || button.disabled) return false; button.click(); return true; })()`,
  );
  if (!historyReady) throw new Error('Undo was not available after the acceptance strokes.');
  await delay(350);
  const undoneHash = await hashCanvas();
  const redoReady = await evaluate(
    `(() => { const button = document.querySelector('button[aria-label="Redo"]'); if (!button || button.disabled) return false; button.click(); return true; })()`,
  );
  if (!redoReady) throw new Error('Redo was not available after Undo.');
  await delay(350);
  const redoneHash = await hashCanvas();
  const delta = (name) => (after.counts[name] ?? 0) - (before.counts[name] ?? 0);
  const scenarioRafGaps = after.rafGaps.slice(before.rafGaps.length);
  return {
    browser: capabilities,
    effect: imageFxId || effectName,
    mutationMode: imageFxId ? mutationMode : undefined,
    strokeProfile,
    document: await evaluate(`document.querySelector('.topbar-file')?.textContent.trim() ?? ''`),
    strokes: 20,
    canvasDirtyUploadDelta: delta('glitchbrushes:canvas-dirty-upload'),
    canvasFullSyncDelta: delta('glitchbrushes:canvas-full-sync'),
    fitToScreenDelta: delta('glitchbrushes:fit-to-screen'),
    zoomStable: zoomBefore === zoomAfter,
    historyByteExact: committedHash !== undoneHash && committedHash === redoneHash,
    workerRoundTrip: summarize(
      (after.samples['glitchbrushes:pointer-up-to-result'] ?? []).slice(-20),
    ),
    adoption: summarize((after.samples['glitchbrushes:worker-result-adoption'] ?? []).slice(-20)),
    layerCommit: summarize(
      (
        after.samples[
          imageFxId ? 'glitchbrushes:layer-commit' : 'glitchbrushes:commit-current-buffer'
        ] ?? []
      ).slice(-20),
    ),
    canvasUpload: summarize(
      (
        after.samples[
          imageFxId
            ? 'glitchbrushes:image-brush-canvas-upload'
            : 'glitchbrushes:canvas-dirty-upload'
        ] ?? []
      ).slice(-20),
    ),
    rafGaps: summarize(scenarioRafGaps),
    rafGapsOver50ms: scenarioRafGaps.filter((gap) => gap >= 50).length,
  };
}

async function runEdge() {
  const executable = 'C:\\Program Files (x86)\\Microsoft\\Edge\\Application\\msedge.exe';
  const port = 9341;
  const process = spawn(
    executable,
    [
      `--remote-debugging-port=${port}`,
      `--user-data-dir=${profile}`,
      '--no-first-run',
      '--no-default-browser-check',
      '--disable-features=msEdgeFirstRunExperience',
      '--window-size=1500,980',
      appUrl,
    ],
    { stdio: 'ignore', windowsHide: false },
  );
  let rpc;
  try {
    const target = await waitFor(async () => {
      const response = await fetch(`http://127.0.0.1:${port}/json`);
      const pages = await response.json();
      return pages.find(
        (page) => page.type === 'page' && page.url.startsWith(appUrl.split('?')[0]),
      );
    }, 20000);
    rpc = new Rpc(target.webSocketDebuggerUrl);
    await rpc.open();
    await rpc.send('Runtime.enable');
    const evaluate = async (expression) => {
      const result = await rpc.send('Runtime.evaluate', {
        expression,
        awaitPromise: true,
        returnByValue: true,
        userGesture: true,
      });
      if (result.exceptionDetails) throw new Error(result.exceptionDetails.text);
      return result.result.value;
    };
    const stroke = async (start, end) => {
      await rpc.send('Input.dispatchMouseEvent', { type: 'mouseMoved', x: start.x, y: start.y });
      await rpc.send('Input.dispatchMouseEvent', {
        type: 'mousePressed',
        x: start.x,
        y: start.y,
        button: 'left',
        buttons: 1,
        clickCount: 1,
      });
      for (let step = 1; step <= 4; step += 1) {
        const ratio = step / 4;
        await rpc.send('Input.dispatchMouseEvent', {
          type: 'mouseMoved',
          x: start.x + (end.x - start.x) * ratio,
          y: start.y + (end.y - start.y) * ratio,
          button: 'left',
          buttons: 1,
        });
      }
      await rpc.send('Input.dispatchMouseEvent', {
        type: 'mouseReleased',
        x: end.x,
        y: end.y,
        button: 'left',
        buttons: 0,
        clickCount: 1,
      });
    };
    return await exercise(evaluate, stroke, {
      name: 'Microsoft Edge',
      version: await evaluate('navigator.userAgent'),
    });
  } finally {
    rpc?.close();
    await stopBrowser(process);
    await delay(500);
  }
}

async function runFirefox() {
  const executable = 'C:\\Program Files\\Mozilla Firefox\\firefox.exe';
  const port = 9228;
  const process = spawn(
    executable,
    [
      '--no-remote',
      '--wait-for-browser',
      '--profile',
      profile,
      `--remote-debugging-port=${port}`,
      '--width=1500',
      '--height=980',
      appUrl,
    ],
    { stdio: 'ignore', windowsHide: false },
  );
  let rpc;
  try {
    rpc = await waitFor(async () => {
      const candidate = new Rpc(`ws://127.0.0.1:${port}/session`, true);
      try {
        await candidate.open();
        return candidate;
      } catch {
        candidate.close();
        return null;
      }
    }, 25000);
    const session = await rpc.send('session.new', {
      capabilities: { alwaysMatch: { acceptInsecureCerts: true } },
    });
    const tree = await rpc.send('browsingContext.getTree', {});
    const context = tree.contexts.find((entry) =>
      entry.url.startsWith(appUrl.split('?')[0]),
    )?.context;
    if (!context) throw new Error('Firefox application context was not found.');
    const evaluate = async (expression) => {
      const result = await rpc.send('script.evaluate', {
        expression,
        target: { context },
        awaitPromise: true,
        resultOwnership: 'none',
        userActivation: true,
      });
      if (result.type === 'exception')
        throw new Error(result.exceptionDetails?.text ?? 'Firefox evaluation failed.');
      return deserialize(result.result);
    };
    const stroke = async (start, end) => {
      const actions = [
        {
          type: 'pointerMove',
          x: Math.round(start.x),
          y: Math.round(start.y),
          duration: 0,
          origin: 'viewport',
        },
        { type: 'pointerDown', button: 0 },
      ];
      for (let step = 1; step <= 4; step += 1) {
        const ratio = step / 4;
        actions.push({
          type: 'pointerMove',
          x: Math.round(start.x + (end.x - start.x) * ratio),
          y: Math.round(start.y + (end.y - start.y) * ratio),
          duration: 20,
          origin: 'viewport',
        });
      }
      actions.push({ type: 'pointerUp', button: 0 });
      await rpc.send(
        'input.performActions',
        {
          context,
          actions: [
            {
              type: 'pointer',
              id: `stroke-${Date.now()}`,
              parameters: { pointerType: 'mouse' },
              actions,
            },
          ],
        },
        60000,
      );
    };
    const report = await exercise(evaluate, stroke, {
      name: 'Mozilla Firefox',
      version: session.capabilities.browserVersion,
      headed: !session.capabilities['moz:headless'],
    });
    await rpc.send('session.end', {});
    return report;
  } finally {
    rpc?.close();
    await stopBrowser(process);
    await delay(500);
  }
}

try {
  console.log(
    JSON.stringify(browserName === 'firefox' ? await runFirefox() : await runEdge(), null, 2),
  );
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
