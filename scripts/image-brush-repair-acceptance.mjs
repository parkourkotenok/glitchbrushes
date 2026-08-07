import { spawn } from 'node:child_process';
import { mkdirSync, mkdtempSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join, resolve } from 'node:path';
import { deflateSync } from 'node:zlib';

const edgePath = 'C:\\Program Files (x86)\\Microsoft\\Edge\\Application\\msedge.exe';
const appUrl = process.env.IMGFUCK_URL ?? process.env.HEX_REDACTOR_URL ?? 'http://127.0.0.1:5174/';
const artifactDir = resolve('browser-artifacts', 'image-brush-repair');
const skipEffectAudit =
  process.env.SKIP_EFFECT_AUDIT === '1' || process.argv.includes('--skip-effects');
const cancelOnly = process.argv.includes('--cancel-only');
const codecOnly = process.argv.includes('--codec-only');
mkdirSync(artifactDir, { recursive: true });

class Cdp {
  constructor(url) {
    this.socket = new WebSocket(url);
    this.id = 0;
    this.pending = new Map();
    this.listeners = new Map();
  }

  async open() {
    await new Promise((resolveOpen, reject) => {
      this.socket.addEventListener('open', resolveOpen, { once: true });
      this.socket.addEventListener('error', reject, { once: true });
    });
    this.socket.addEventListener('message', (event) => {
      const message = JSON.parse(event.data);
      if (message.id) {
        const pending = this.pending.get(message.id);
        if (!pending) return;
        this.pending.delete(message.id);
        clearTimeout(pending.timer);
        if (message.error) pending.reject(new Error(message.error.message));
        else pending.resolve(message.result);
        return;
      }
      for (const listener of this.listeners.get(message.method) ?? []) listener(message.params);
    });
  }

  on(method, listener) {
    const listeners = this.listeners.get(method) ?? [];
    listeners.push(listener);
    this.listeners.set(method, listeners);
  }

  send(method, params = {}, timeout = 60000) {
    const id = ++this.id;
    return new Promise((resolveSend, reject) => {
      const timer = setTimeout(() => {
        this.pending.delete(id);
        reject(new Error(`CDP ${method} timed out after ${timeout} ms.`));
      }, timeout);
      this.pending.set(id, { resolve: resolveSend, reject, timer });
      this.socket.send(JSON.stringify({ id, method, params }));
    });
  }

  close() {
    this.socket.close();
  }
}

const delay = (ms) => new Promise((resolveDelay) => setTimeout(resolveDelay, ms));

async function waitFor(fn, timeout = 30000, interval = 40) {
  const started = Date.now();
  let lastError;
  while (Date.now() - started < timeout) {
    try {
      const value = await fn();
      if (value) return value;
    } catch (error) {
      lastError = error;
    }
    await delay(interval);
  }
  throw lastError ?? new Error(`Timed out after ${timeout} ms.`);
}

async function waitForEndpoint(port) {
  return waitFor(async () => {
    const response = await fetch(`http://127.0.0.1:${port}/json/list`);
    const pages = await response.json();
    return pages.find((page) => page.type === 'page' && !page.url.startsWith('edge://'));
  }, 15000);
}

async function evaluate(cdp, expression) {
  const result = await cdp.send('Runtime.evaluate', {
    expression,
    awaitPromise: true,
    returnByValue: true,
    userGesture: true,
  });
  if (result.exceptionDetails) {
    throw new Error(result.exceptionDetails.exception?.description ?? result.exceptionDetails.text);
  }
  return result.result.value;
}

async function waitExpression(cdp, expression, timeout = 30000) {
  return waitFor(() => evaluate(cdp, expression), timeout);
}

const crcTable = Array.from({ length: 256 }, (_, value) => {
  let crc = value;
  for (let bit = 0; bit < 8; bit += 1) crc = crc & 1 ? 0xedb88320 ^ (crc >>> 1) : crc >>> 1;
  return crc >>> 0;
});

function pngChunk(type, data) {
  const typeBytes = Buffer.from(type, 'ascii');
  const length = Buffer.alloc(4);
  length.writeUInt32BE(data.length);
  let crc = 0xffffffff;
  for (const byte of Buffer.concat([typeBytes, data]))
    crc = crcTable[(crc ^ byte) & 0xff] ^ (crc >>> 8);
  const checksum = Buffer.alloc(4);
  checksum.writeUInt32BE((crc ^ 0xffffffff) >>> 0);
  return Buffer.concat([length, typeBytes, data, checksum]);
}

function testIconBase64(size = 96) {
  const stride = size * 4;
  const raw = Buffer.alloc((stride + 1) * size);
  for (let y = 0; y < size; y += 1) {
    const row = y * (stride + 1);
    for (let x = 0; x < size; x += 1) {
      const offset = row + 1 + x * 4;
      const solid = x >= 20 && x < 76 && y >= 20 && y < 76;
      const thin = Math.abs(x - y) <= 1 || Math.abs(x + y - (size - 1)) <= 1;
      const bar = (x >= 43 && x <= 52) || (y >= 43 && y <= 52);
      if (!solid && !thin) continue;
      raw[offset] = bar ? 236 : thin ? 70 : 224;
      raw[offset + 1] = bar ? 184 : thin ? 210 : 78;
      raw[offset + 2] = bar ? 78 : thin ? 206 : 88;
      raw[offset + 3] = 255;
    }
  }
  const header = Buffer.alloc(13);
  header.writeUInt32BE(size, 0);
  header.writeUInt32BE(size, 4);
  header[8] = 8;
  header[9] = 6;
  return Buffer.concat([
    Buffer.from([137, 80, 78, 71, 13, 10, 26, 10]),
    pngChunk('IHDR', header),
    pngChunk('IDAT', deflateSync(raw)),
    pngChunk('IEND', Buffer.alloc(0)),
  ]).toString('base64');
}

function testDocumentBase64(size) {
  const stride = size * 4;
  const raw = Buffer.alloc((stride + 1) * size);
  for (let y = 0; y < size; y += 1) {
    const row = y * (stride + 1);
    for (let x = 0; x < size; x += 1) {
      const offset = row + 1 + x * 4;
      const block = (Math.floor(x / 96) + Math.floor(y / 96)) % 2;
      raw[offset] = block ? 42 : 196;
      raw[offset + 1] = block ? 92 : 76;
      raw[offset + 2] = block ? 150 : 112;
      raw[offset + 3] = 255;
    }
  }
  const header = Buffer.alloc(13);
  header.writeUInt32BE(size, 0);
  header.writeUInt32BE(size, 4);
  header[8] = 8;
  header[9] = 6;
  return Buffer.concat([
    Buffer.from([137, 80, 78, 71, 13, 10, 26, 10]),
    pngChunk('IHDR', header),
    pngChunk('IDAT', deflateSync(raw, { level: 6 })),
    pngChunk('IEND', Buffer.alloc(0)),
  ]).toString('base64');
}

async function installMetrics(cdp) {
  await evaluate(
    cdp,
    `(() => {
    const metrics = window.__imageBrushBaseline = {
      pointerEvents: 0,
      pointerStartedAt: 0,
      pointerEndedAt: 0,
      rafFrames: 0,
      rafGaps: [],
      longTasks: [],
      workerJobs: 0,
      workerCancels: 0,
      workerPosts: [],
      workerResults: [],
      domMutations: 0
    };
    document.querySelector('.canvas-stage').addEventListener('pointermove', () => {
      if (!metrics.pointerStartedAt) metrics.pointerStartedAt = performance.now();
      metrics.pointerEndedAt = performance.now();
      metrics.pointerEvents += 1;
    }, { capture: true });
    let previous = performance.now();
    const frame = (now) => {
      const gap = now - previous;
      metrics.rafFrames += 1;
      if (gap > 20) metrics.rafGaps.push(gap);
      previous = now;
      requestAnimationFrame(frame);
    };
    requestAnimationFrame(frame);
    try {
      new PerformanceObserver((entries) => {
        metrics.longTasks.push(...entries.getEntries().map((entry) => ({
          start: entry.startTime,
          duration: entry.duration
        })));
      }).observe({ type: 'longtask', buffered: true });
    } catch {}
    const NativeWorker = window.Worker;
    window.Worker = class InstrumentedWorker extends NativeWorker {
      constructor(...args) {
        super(...args);
        metrics.workerJobs += 1;
        this.addEventListener('message', (event) => {
          if (event.data?.type === 'result') {
            metrics.workerResults.push({
              at: performance.now(),
              bytes: event.data.result?.pixels?.byteLength ?? 0,
              stamps: event.data.result?.stampCount ?? 0,
              changed: event.data.result?.affectedPixels ?? 0
            });
          }
        });
      }
      postMessage(message, transfer) {
        const transfers = Array.isArray(transfer) ? transfer : transfer?.transfer ?? [];
        metrics.workerPosts.push({
          at: performance.now(),
          type: message?.type,
          bytes: transfers.reduce((total, item) => total + (item?.byteLength ?? 0), 0)
        });
        if (message?.type === 'cancel') metrics.workerCancels += 1;
        return super.postMessage(message, transfer);
      }
      terminate() {
        return super.terminate();
      }
    };
    new MutationObserver((records) => {
      metrics.domMutations += records.length;
    }).observe(document.querySelector('#root'), { subtree: true, childList: true, attributes: true, characterData: true });
    return true;
  })()`,
  );
}

async function addBrushAsset(cdp, base64) {
  await evaluate(
    cdp,
    `(async () => {
    const binary = atob(${JSON.stringify(base64)});
    const bytes = new Uint8Array(binary.length);
    for (let index = 0; index < binary.length; index += 1) bytes[index] = binary.charCodeAt(index);
    const file = new File([bytes], 'repair-icon-96.png', { type: 'image/png' });
    const transfer = new DataTransfer();
    transfer.items.add(file);
    const input = document.querySelector('.image-brush-compact input[type=file][accept*="image/png"]');
    if (!input) throw new Error('Image Brush file input is unavailable.');
    Object.getOwnPropertyDescriptor(HTMLInputElement.prototype, 'files').set.call(input, transfer.files);
    input.dispatchEvent(new Event('change', { bubbles: true }));
    return true;
  })()`,
  );
  await waitExpression(
    cdp,
    `[...document.querySelectorAll('.image-brush-library-strip article')].some((node) => node.textContent.includes('repair-icon-96'))`,
  );
}

async function setPreset(cdp, text) {
  return evaluate(
    cdp,
    `(() => {
    const select = [...document.querySelectorAll('.image-brush-select select')]
      .find((item) => [...item.options].some((option) => option.textContent.trim() === ${JSON.stringify(text)}));
    if (!select) return false;
    const option = [...select.options].find((entry) => entry.textContent.trim() === ${JSON.stringify(text)});
    Object.getOwnPropertyDescriptor(HTMLSelectElement.prototype, 'value').set.call(select, option.value);
    select.dispatchEvent(new Event('change', { bubbles: true }));
    return true;
  })()`,
  );
}

async function setSelect(cdp, label, text) {
  return evaluate(
    cdp,
    `(() => {
    const field = [...document.querySelectorAll('.image-brush-select')]
      .find((item) => item.querySelector(':scope > span')?.textContent.trim() === ${JSON.stringify(label)});
    const select = field?.querySelector('select');
    const option = [...(select?.options ?? [])].find((entry) => entry.textContent.trim() === ${JSON.stringify(text)});
    if (!select || !option) return false;
    Object.getOwnPropertyDescriptor(HTMLSelectElement.prototype, 'value').set.call(select, option.value);
    select.dispatchEvent(new Event('change', { bubbles: true }));
    return true;
  })()`,
  );
}

async function setRangeByLabel(cdp, label, value) {
  return evaluate(
    cdp,
    `(() => {
    const field = [...document.querySelectorAll('.image-brush-lab .slider-field')]
      .find((item) => item.querySelector(':scope > span')?.textContent.trim() === ${JSON.stringify(label)});
    const input = field?.querySelector('input[type=range]');
    if (!input) return false;
    Object.getOwnPropertyDescriptor(HTMLInputElement.prototype, 'value').set.call(input, ${JSON.stringify(String(value))});
    input.dispatchEvent(new Event('input', { bubbles: true }));
    input.dispatchEvent(new Event('change', { bubbles: true }));
    return true;
  })()`,
  );
}

async function loadTestDocument(cdp, size) {
  const base64 = testDocumentBase64(size);
  await evaluate(
    cdp,
    `(async () => {
    const binary = atob(${JSON.stringify(base64)});
    const bytes = new Uint8Array(binary.length);
    for (let index = 0; index < binary.length; index += 1) bytes[index] = binary.charCodeAt(index);
    const file = new File([bytes], 'performance-${size}.png', { type: 'image/png' });
    const transfer = new DataTransfer();
    transfer.items.add(file);
    const input = document.querySelector('.topbar input[type=file][accept*="image/png"]');
    Object.getOwnPropertyDescriptor(HTMLInputElement.prototype, 'files').set.call(input, transfer.files);
    input.dispatchEvent(new Event('change', { bubbles: true }));
    return true;
  })()`,
  );
  await waitExpression(
    cdp,
    `document.querySelector('.topbar-file strong')?.textContent.includes('performance-${size}.png')`,
    90000,
  );
  await evaluate(
    cdp,
    `(() => {
    const canvas = document.querySelector('.work-canvas');
    window.__imageBrushBaseline.lastCommitted = canvas.getContext('2d').getImageData(0, 0, canvas.width, canvas.height).data.slice();
    return true;
  })()`,
  );
}

async function setFirstFxAmount(cdp, value) {
  return evaluate(
    cdp,
    `(() => {
    const input = document.querySelector('.image-brush-fx-rack article .slider-field input[type=range]');
    if (!input) return false;
    Object.getOwnPropertyDescriptor(HTMLInputElement.prototype, 'value').set.call(input, ${JSON.stringify(String(value))});
    input.dispatchEvent(new Event('input', { bubbles: true }));
    input.dispatchEvent(new Event('change', { bubbles: true }));
    return true;
  })()`,
  );
}

async function auditStampEffects(cdp) {
  const effects = await evaluate(
    cdp,
    `(() => {
    const select = document.querySelector('.image-brush-add-fx select');
    return [...select.options].map((option) => ({ id: option.value, name: option.textContent.trim() }));
  })()`,
  );
  await evaluate(
    cdp,
    `(() => {
    const canvas = document.createElement('canvas');
    canvas.width = 1000;
    canvas.height = 850;
    canvas.id = 'image-brush-effect-contact-sheet';
    const context = canvas.getContext('2d');
    context.fillStyle = '#121312';
    context.fillRect(0, 0, canvas.width, canvas.height);
    context.font = '12px monospace';
    context.textBaseline = 'top';
    window.__imageBrushContactSheet = canvas;
    return true;
  })()`,
  );
  const results = [];
  for (let index = 0; index < effects.length; index += 1) {
    const effect = effects[index];
    await evaluate(
      cdp,
      `(() => {
      for (const button of [...document.querySelectorAll('.image-brush-fx-rack article > header button.icon-button')]) {
        button.click();
      }
      const select = document.querySelector('.image-brush-add-fx select');
      Object.getOwnPropertyDescriptor(HTMLSelectElement.prototype, 'value').set.call(select, ${JSON.stringify(effect.id)});
      select.dispatchEvent(new Event('change', { bubbles: true }));
      return true;
    })()`,
    );
    await delay(25);
    await evaluate(cdp, `document.querySelector('.image-brush-add-fx button').click()`);
    await waitFor(
      async () => {
        const text = await evaluate(
          cdp,
          `document.querySelector('.image-brush-diagnostics')?.innerText ?? ''`,
        );
        return text.startsWith('FULL') ? text : null;
      },
      30000,
      25,
    );
    const defaultHash = await canvasHash(cdp, '.image-brush-previews article:nth-child(2) canvas');
    await setFirstFxAmount(cdp, 0.86);
    const changedHash = await waitFor(
      async () => {
        const hash = await canvasHash(cdp, '.image-brush-previews article:nth-child(2) canvas');
        return hash !== defaultHash ? hash : null;
      },
      30000,
      25,
    ).catch(() => defaultHash);
    await waitFor(
      async () => {
        const text = await evaluate(
          cdp,
          `document.querySelector('.image-brush-diagnostics')?.innerText ?? ''`,
        );
        return text.startsWith('FULL') ? text : null;
      },
      30000,
      25,
    );
    const diagnostic = await evaluate(
      cdp,
      `document.querySelector('.image-brush-diagnostics')?.innerText ?? ''`,
    );
    await evaluate(
      cdp,
      `(() => {
      const sheet = window.__imageBrushContactSheet;
      const context = sheet.getContext('2d');
      const original = document.querySelector('.image-brush-previews article:nth-child(1) canvas');
      const processed = document.querySelector('.image-brush-previews article:nth-child(2) canvas');
      const index = ${index};
      const column = index % 4;
      const row = Math.floor(index / 4);
      const x = column * 250;
      const y = row * 170;
      context.fillStyle = '#1b1d1b';
      context.fillRect(x + 5, y + 5, 240, 160);
      context.fillStyle = '#d0ad66';
      context.font = '12px monospace';
      context.fillText(${JSON.stringify(effect.name)}, x + 12, y + 12);
      context.fillStyle = '#70766f';
      context.font = '9px monospace';
      context.fillText('ORIGINAL', x + 12, y + 34);
      context.fillText('PROCESSED', x + 126, y + 34);
      context.drawImage(original, x + 12, y + 48, 102, 78);
      context.drawImage(processed, x + 126, y + 48, 102, 78);
      context.fillStyle = '#80aaa5';
      context.fillText(${JSON.stringify(diagnostic.split('\\n').slice(1, 3).join(' · '))}, x + 12, y + 137);
      return true;
    })()`,
    );
    results.push({
      ...effect,
      parameterChangedOutput: changedHash !== defaultHash,
      diagnostic,
    });
  }
  const png = await evaluate(cdp, `window.__imageBrushContactSheet.toDataURL('image/png')`);
  return { results, png };
}

async function canvasHash(cdp, selector) {
  return evaluate(
    cdp,
    `(() => {
    const canvas = document.querySelector(${JSON.stringify(selector)});
    const data = canvas.getContext('2d').getImageData(0, 0, canvas.width, canvas.height).data;
    let hash = 2166136261 >>> 0;
    for (let index = 0; index < data.length; index += 4) {
      hash = Math.imul(hash ^ data[index], 16777619) >>> 0;
      hash = Math.imul(hash ^ data[index + 1], 16777619) >>> 0;
      hash = Math.imul(hash ^ data[index + 2], 16777619) >>> 0;
      hash = Math.imul(hash ^ data[index + 3], 16777619) >>> 0;
    }
    return hash;
  })()`,
  );
}

async function previewDifference(cdp) {
  return evaluate(
    cdp,
    `(() => {
    const canvases = [...document.querySelectorAll('.image-brush-previews canvas')];
    const original = canvases[0].getContext('2d').getImageData(0, 0, canvases[0].width, canvases[0].height).data;
    const processed = canvases[1].getContext('2d').getImageData(0, 0, canvases[1].width, canvases[1].height).data;
    let changed = 0;
    let total = 0;
    for (let offset = 0; offset < original.length; offset += 4) {
      const delta = Math.abs(original[offset] - processed[offset]) +
        Math.abs(original[offset + 1] - processed[offset + 1]) +
        Math.abs(original[offset + 2] - processed[offset + 2]) +
        Math.abs(original[offset + 3] - processed[offset + 3]);
      if (delta > 12) changed += 1;
      total += delta;
    }
    return { changed, total, percent: changed / (original.length / 4) * 100 };
  })()`,
  );
}

async function stagePoints(cdp, row = 0.5) {
  return evaluate(
    cdp,
    `(() => {
    const rect = document.querySelector('.canvas-stage').getBoundingClientRect();
    return {
      start: { x: rect.left + rect.width * .16, y: rect.top + rect.height * ${row} },
      end: { x: rect.left + rect.width * .82, y: rect.top + rect.height * ${row} }
    };
  })()`,
  );
}

async function drawMeasuredStroke(cdp, events, intervalMs, row) {
  await cdp.send('Page.bringToFront');
  const points = await stagePoints(cdp, row);
  const beforeHash = await canvasHash(cdp, '.work-canvas');
  const overlayBeforeHash = await canvasHash(cdp, '.image-brush-overlay-canvas');
  await evaluate(
    cdp,
    `(() => {
    const metrics = window.__imageBrushBaseline;
    metrics.strokeStart = performance.now();
    metrics.domBefore = metrics.domMutations;
    metrics.pointerEvents = 0;
    metrics.pointerStartedAt = 0;
    metrics.pointerEndedAt = 0;
    metrics.rafGaps = [];
    metrics.longTasks = [];
    return true;
  })()`,
  );
  const inputStarted = performance.now();
  await cdp.send('Input.dispatchMouseEvent', {
    type: 'mouseMoved',
    x: points.start.x,
    y: points.start.y,
    button: 'none',
  });
  await cdp.send('Input.dispatchMouseEvent', {
    type: 'mousePressed',
    x: points.start.x,
    y: points.start.y,
    button: 'left',
    buttons: 1,
    clickCount: 1,
  });
  let overlayMidHash = 0;
  let workMidHash = 0;
  for (let index = 1; index <= events; index += 1) {
    const ratio = index / events;
    await cdp.send('Input.dispatchMouseEvent', {
      type: 'mouseMoved',
      x: points.start.x + (points.end.x - points.start.x) * ratio,
      y: points.start.y + Math.sin(ratio * Math.PI * 3) * 72,
      button: 'left',
      buttons: 1,
    });
    if (index === Math.floor(events / 2)) {
      overlayMidHash = await canvasHash(cdp, '.image-brush-overlay-canvas');
      workMidHash = await canvasHash(cdp, '.work-canvas');
    }
    if (intervalMs > 0) await delay(intervalMs);
  }
  const inputEnded = performance.now();
  const downHash = await canvasHash(cdp, '.work-canvas');
  const releasedAt = performance.now();
  await cdp.send('Input.dispatchMouseEvent', {
    type: 'mouseReleased',
    x: points.end.x,
    y: points.end.y,
    button: 'left',
    buttons: 0,
    clickCount: 1,
  });
  try {
    await waitFor(
      async () => {
        const hash = await canvasHash(cdp, '.work-canvas');
        const busy = await evaluate(
          cdp,
          `Boolean(document.querySelector('.image-brush-progress'))`,
        );
        return hash !== beforeHash && !busy ? hash : null;
      },
      15000,
      25,
    );
  } catch (error) {
    const state = await evaluate(
      cdp,
      `({
      notice: document.querySelector('.statusbar')?.innerText ?? '',
      progress: document.querySelector('.image-brush-progress')?.innerText ?? '',
      workerPost: window.__imageBrushBaseline.workerPosts.at(-1),
      workerResult: window.__imageBrushBaseline.workerResults.at(-1),
      overlay: document.querySelector('.image-brush-overlay-canvas')?.getContext('2d').getImageData(0, 0, 1, 1).data[3],
      activeTab: document.querySelector('.inspector-tabs button.active')?.innerText,
      stagePointerEvents: getComputedStyle(document.querySelector('.canvas-stage')).pointerEvents,
      helpMode: document.body.classList.contains('help-mode-active')
    })`,
    );
    const failureScreenshot = await cdp.send('Page.captureScreenshot', {
      format: 'png',
      captureBeyondViewport: false,
    });
    writeFileSync(
      join(artifactDir, 'acceptance-failure.png'),
      Buffer.from(failureScreenshot.data, 'base64'),
    );
    throw new Error(`${error.message} State: ${JSON.stringify(state)}`);
  }
  const committedAt = performance.now();
  const changedPixels = await evaluate(
    cdp,
    `(() => {
    const canvas = document.querySelector('.work-canvas');
    const data = canvas.getContext('2d').getImageData(0, 0, canvas.width, canvas.height).data;
    if (!window.__imageBrushBaseline.lastCommitted) {
      window.__imageBrushBaseline.lastCommitted = data.slice();
      return -1;
    }
    let changed = 0;
    const before = window.__imageBrushBaseline.lastCommitted;
    for (let offset = 0; offset < data.length; offset += 4) {
      if (data[offset] !== before[offset] || data[offset + 1] !== before[offset + 1] ||
          data[offset + 2] !== before[offset + 2] || data[offset + 3] !== before[offset + 3]) changed += 1;
    }
    window.__imageBrushBaseline.lastCommitted = data.slice();
    return changed;
  })()`,
  );
  const metrics = await evaluate(
    cdp,
    `(() => ({
    pointerEvents: window.__imageBrushBaseline.pointerEvents,
    pointerDuration: window.__imageBrushBaseline.pointerEndedAt - window.__imageBrushBaseline.pointerStartedAt,
    domMutations: window.__imageBrushBaseline.domMutations - window.__imageBrushBaseline.domBefore,
    rafGaps: window.__imageBrushBaseline.rafGaps.slice(-100),
    longTasks: window.__imageBrushBaseline.longTasks.slice(-30),
    lastWorkerPost: window.__imageBrushBaseline.workerPosts.at(-1),
    lastWorkerResult: window.__imageBrushBaseline.workerResults.at(-1)
  }))()`,
  );
  return {
    inputDispatchMs: inputEnded - inputStarted,
    pointerUpCommitMs: committedAt - releasedAt,
    workChangedWhilePointerDown: downHash !== beforeHash,
    workChangedAtMidStroke: workMidHash !== beforeHash,
    overlayMidHash,
    overlayChangedAtMidStroke: overlayMidHash !== overlayBeforeHash,
    changedPixels,
    ...metrics,
  };
}

async function runPerformanceMatrix(cdp) {
  await evaluate(
    cdp,
    `(() => {
    if (!document.querySelector('.image-brush-performance > div')) {
      document.querySelector('.image-brush-performance > button')?.click();
    }
    return true;
  })()`,
  );
  const cases = [
    {
      size: 1000,
      tip: 96,
      spacing: 8,
      mode: 'Fixed Glitch',
      stage: 'Process Each Stamp',
      events: 90,
    },
    {
      size: 2000,
      tip: 128,
      spacing: 9,
      mode: 'Per Stamp',
      stage: 'Process Each Stamp',
      events: 140,
    },
    {
      size: 4000,
      tip: 128,
      spacing: 15,
      mode: 'Evolving',
      stage: 'Process Each Stamp',
      events: 180,
    },
  ];
  const results = [];
  for (const test of cases) {
    await loadTestDocument(cdp, test.size);
    await setPreset(cdp, 'Glitched Repeat');
    await setSelect(cdp, 'Unit', 'Pixels');
    await setRangeByLabel(cdp, 'Size', test.tip);
    await setRangeByLabel(cdp, 'Spacing', test.spacing);
    await setSelect(cdp, 'Mutation', test.mode);
    await setSelect(cdp, 'FX stage', test.stage);
    if (test.mode === 'Per Stamp') await setRangeByLabel(cdp, 'Variant pool', 8);
    await delay(250);
    const metrics = await drawMeasuredStroke(cdp, test.events, 1, 0.5);
    const panel = await evaluate(
      cdp,
      `document.querySelector('.image-brush-performance > div')?.innerText ?? ''`,
    );
    results.push({ ...test, ...metrics, panel });
  }
  return results;
}

async function runCodecPerformanceMatrix(cdp) {
  const cases = [
    { size: 1000, tip: 96, spacing: 8, events: 90, expectedStamps: 100 },
    { size: 2000, tip: 128, spacing: 9, events: 140, expectedStamps: 200 },
  ];
  const results = [];
  for (const test of cases) {
    await loadTestDocument(cdp, test.size);
    await setPreset(cdp, 'Codec Damage Trail');
    await setSelect(cdp, 'Unit', 'Pixels');
    await setRangeByLabel(cdp, 'Size', test.tip);
    await setRangeByLabel(cdp, 'Spacing', test.spacing);
    await delay(300);
    const metrics = await drawMeasuredStroke(cdp, test.events, 1, 0.5);
    results.push({
      ...test,
      ...metrics,
      renderedStamps: metrics.lastWorkerResult?.stamps ?? null,
      preset: 'Codec Damage Trail',
    });
  }
  return results;
}

async function runCancellationCheck(cdp) {
  const points = await stagePoints(cdp, 0.76);
  const before = await canvasHash(cdp, '.work-canvas');
  await evaluate(
    cdp,
    `(() => {
    const stage = document.querySelector('.canvas-stage');
    stage.setPointerCapture = () => {};
    const send = (type, x, y, buttons) => stage.dispatchEvent(new PointerEvent(type, {
      bubbles: true,
      cancelable: true,
      pointerId: 77,
      pointerType: 'mouse',
      isPrimary: true,
      clientX: x,
      clientY: y,
      button: type === 'pointerup' ? 0 : 0,
      buttons
    }));
    const start = ${JSON.stringify(points.start)};
    const end = ${JSON.stringify(points.end)};
    send('pointermove', start.x, start.y, 0);
    send('pointerdown', start.x, start.y, 1);
    for (let index = 1; index <= 80; index += 1) {
      const ratio = index / 80;
      send('pointermove', start.x + (end.x - start.x) * ratio, start.y, 1);
    }
    send('pointerup', end.x, end.y, 0);
    return true;
  })()`,
  );
  await waitExpression(cdp, `Boolean(document.querySelector('.image-brush-progress'))`, 5000);
  const started = performance.now();
  await evaluate(cdp, `document.querySelector('.image-brush-progress button')?.click()`);
  await waitExpression(cdp, `!document.querySelector('.image-brush-progress')`, 5000);
  const cancelMs = performance.now() - started;
  const after = await canvasHash(cdp, '.work-canvas');
  return {
    cancelMs,
    documentUnchanged: after === before,
    notice: await evaluate(
      cdp,
      `document.querySelector('.statusbar')?.innerText.split('\\n').at(0) ?? ''`,
    ),
  };
}

async function run() {
  const profile = mkdtempSync(join(tmpdir(), 'imgfuck-image-brush-acceptance-'));
  const port = 9444;
  const edge = spawn(
    edgePath,
    [
      '--no-first-run',
      '--no-default-browser-check',
      `--remote-debugging-port=${port}`,
      `--user-data-dir=${profile}`,
      '--window-size=1600,1000',
      '--new-window',
      'about:blank',
    ],
    { stdio: 'ignore', windowsHide: false },
  );
  try {
    const page = await waitForEndpoint(port);
    const cdp = new Cdp(page.webSocketDebuggerUrl);
    await cdp.open();
    cdp.on('Page.javascriptDialogOpening', () => {
      void cdp.send('Page.handleJavaScriptDialog', { accept: true });
    });
    await Promise.all([
      cdp.send('Runtime.enable'),
      cdp.send('Page.enable'),
      cdp.send('Log.enable'),
    ]);
    await cdp.send('Page.navigate', { url: appUrl });
    await cdp.send('Page.bringToFront');
    await waitExpression(
      cdp,
      `Boolean(document.querySelector('.brand svg[aria-label="imgfuck"]'))`,
    );
    await evaluate(
      cdp,
      `(() => {
      [...document.querySelectorAll('.inspector-tabs button')].find((button) => button.textContent.includes('Image Brush')).click();
      return true;
    })()`,
    );
    await waitExpression(cdp, `Boolean(document.querySelector('.image-brush-lab'))`);
    await evaluate(
      cdp,
      `(() => {
      [...document.querySelectorAll('.image-brush-interface-level button')]
        .find((button) => button.textContent.trim() === 'ADVANCED')?.click();
      return true;
    })()`,
    );
    await installMetrics(cdp);
    await addBrushAsset(cdp, testIconBase64());
    await setPreset(cdp, 'Glitched Repeat');
    await delay(1200);
    if (codecOnly) {
      const codecMatrix = await runCodecPerformanceMatrix(cdp);
      const screenshot = await cdp.send('Page.captureScreenshot', {
        format: 'png',
        captureBeyondViewport: false,
      });
      const report = {
        browser: 'Visible Edge Chromium',
        appUrl,
        preset: 'Codec Damage Trail',
        codecMatrix,
        passed: codecMatrix.every(
          (entry) =>
            entry.overlayChangedAtMidStroke &&
            entry.pointerUpCommitMs < 15_000 &&
            entry.changedPixels > 0,
        ),
      };
      writeFileSync(
        join(artifactDir, 'codec-visible-edge.png'),
        Buffer.from(screenshot.data, 'base64'),
      );
      writeFileSync(join(artifactDir, 'codec-visible-edge.json'), JSON.stringify(report, null, 2));
      console.log(JSON.stringify(report, null, 2));
      cdp.close();
      await delay(500);
      return;
    }
    await setSelect(cdp, 'FX stage', 'Process Each Stamp');
    await delay(250);
    const previewBefore = await previewDifference(cdp);
    const sliderStarted = performance.now();
    await setFirstFxAmount(cdp, 0.92);
    const sliderDispatchMs = performance.now() - sliderStarted;
    const previewHashBefore = await canvasHash(
      cdp,
      '.image-brush-previews article:nth-child(2) canvas',
    );
    const previewUpdateStarted = performance.now();
    const previewHashAfter = await waitFor(
      async () => {
        const hash = await canvasHash(cdp, '.image-brush-previews article:nth-child(2) canvas');
        return hash !== previewHashBefore ? hash : null;
      },
      30000,
      20,
    ).catch(() => previewHashBefore);
    const previewUpdateMs = performance.now() - previewUpdateStarted;
    const previewAfter = await previewDifference(cdp);
    const previewDiagnostics = await evaluate(
      cdp,
      `document.querySelector('.image-brush-diagnostics')?.innerText ?? ''`,
    );
    await setSelect(cdp, 'Mutation', 'Fixed Glitch');
    await setSelect(cdp, 'FX stage', 'Process Brush Before Stamp');
    const effectAudit = skipEffectAudit
      ? {
          results: JSON.parse(
            await import('node:fs').then(({ readFileSync }) =>
              readFileSync(join(artifactDir, 'stamp-fx-report.json'), 'utf8'),
            ),
          ),
          png: '',
        }
      : await auditStampEffects(cdp);
    if (!skipEffectAudit) {
      writeFileSync(
        join(artifactDir, 'stamp-fx-contact-sheet.png'),
        Buffer.from(effectAudit.png.split(',')[1], 'base64'),
      );
      writeFileSync(
        join(artifactDir, 'stamp-fx-report.json'),
        JSON.stringify(effectAudit.results, null, 2),
      );
    }
    await setPreset(cdp, 'Glitched Repeat');
    await delay(250);
    await setSelect(cdp, 'FX stage', 'Process Each Stamp');
    if (cancelOnly) {
      await loadTestDocument(cdp, 4000);
      await setPreset(cdp, 'Glitched Repeat');
      await setSelect(cdp, 'Unit', 'Pixels');
      await setRangeByLabel(cdp, 'Size', 128);
      await setRangeByLabel(cdp, 'Spacing', 15);
      await setSelect(cdp, 'Mutation', 'Fixed Glitch');
      await setSelect(cdp, 'FX stage', 'Process Trail After Stamp');
      await delay(250);
      const cancellation = await runCancellationCheck(cdp);
      writeFileSync(
        join(artifactDir, 'cancellation-report.json'),
        JSON.stringify(cancellation, null, 2),
      );
      console.log(JSON.stringify({ browser: 'Visible Edge Chromium', cancellation }, null, 2));
      cdp.close();
      await delay(500);
      return;
    }

    await evaluate(
      cdp,
      `(() => {
      const canvas = document.querySelector('.work-canvas');
      window.__imageBrushBaseline.lastCommitted = canvas.getContext('2d').getImageData(0, 0, canvas.width, canvas.height).data.slice();
      return true;
    })()`,
    );
    const modes = [
      ['Fixed Glitch', 0.28],
      ['Per Stamp', 0.43],
      ['Evolving', 0.58],
      ['Stroke Feedback', 0.73],
    ];
    const strokes = [];
    for (const [mode, row] of modes) {
      await setSelect(cdp, 'Mutation', mode);
      await delay(250);
      const metrics = await drawMeasuredStroke(cdp, mode === 'Per Stamp' ? 90 : 60, 7, row);
      strokes.push({ mode, ...metrics });
    }
    const performanceMatrix = await runPerformanceMatrix(cdp);
    const cancellation = await runCancellationCheck(cdp);

    await evaluate(
      cdp,
      `(() => {
      if (!document.querySelector('.image-brush-performance > div')) {
        document.querySelector('.image-brush-performance > button')?.click();
      }
      return true;
    })()`,
    );
    const performanceText = await evaluate(
      cdp,
      `document.querySelector('.image-brush-performance > div')?.innerText ?? ''`,
    );
    const screenshot = await cdp.send('Page.captureScreenshot', {
      format: 'png',
      captureBeyondViewport: false,
    });
    writeFileSync(
      join(artifactDir, 'after-visible-edge.png'),
      Buffer.from(screenshot.data, 'base64'),
    );
    await evaluate(
      cdp,
      `document.querySelector('button[aria-label="Open contextual help"]')?.click()`,
    );
    await delay(200);
    const helpScreenshot = await cdp.send('Page.captureScreenshot', {
      format: 'png',
      captureBeyondViewport: false,
    });
    writeFileSync(
      join(artifactDir, 'help-visible-edge.png'),
      Buffer.from(helpScreenshot.data, 'base64'),
    );
    const helpState = await evaluate(
      cdp,
      `({
      panel: Boolean(document.querySelector('.help-panel')),
      search: Boolean(document.querySelector('.help-search input')),
      registeredButtons: document.querySelectorAll('.help-button[data-help-id]').length
    })`,
    );
    const report = {
      browser: 'Visible Edge Chromium',
      appUrl,
      brush: 'repair-icon-96.png',
      preset: 'Glitched Repeat',
      preview: {
        beforeSlider: previewBefore,
        sliderDispatchMs,
        updateMs: previewUpdateMs,
        hashChanged: previewHashAfter !== previewHashBefore,
        afterSlider: previewAfter,
        diagnostics: previewDiagnostics,
      },
      effects: effectAudit.results,
      strokes,
      performanceMatrix,
      cancellation,
      performancePanel: performanceText,
      help: helpState,
      staticPipelineFindings: {
        interactiveTrail: 'Cached variants are painted into one overlay during pointer movement.',
        fullDocumentCopiesPerStroke: 0,
        fullDocumentLayersPerStroke: 0,
        workerLifecycle:
          'One cancellable final Worker per stroke; only cropped document source and required brush assets are transferred.',
        progressUpdates:
          'Progress is percent/time throttled instead of one React update per stamp.',
        perStampVariants:
          'Bounded deterministic pool; Fixed prepares and processes one reusable tip.',
      },
    };
    writeFileSync(join(artifactDir, 'after-report.json'), JSON.stringify(report, null, 2));
    console.log(JSON.stringify(report, null, 2));
    cdp.close();
    await delay(2500);
  } finally {
    edge.kill();
    await delay(500);
    rmSync(profile, { recursive: true, force: true });
  }
}

await run();
