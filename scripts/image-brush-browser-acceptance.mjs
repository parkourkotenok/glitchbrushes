import { spawn } from 'node:child_process';
import { existsSync, mkdirSync, mkdtempSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join, resolve } from 'node:path';
import { deflateSync } from 'node:zlib';

const edgePath = 'C:\\Program Files (x86)\\Microsoft\\Edge\\Application\\msedge.exe';
const firefoxPath = 'C:\\Program Files\\Mozilla Firefox\\firefox.exe';
const appUrl = process.env.HEX_REDACTOR_URL ?? 'http://127.0.0.1:5174/';
const artifactDir = resolve('browser-artifacts');
const repairArtifactDir = resolve('browser-artifacts', 'image-brush-repair');
mkdirSync(artifactDir, { recursive: true });
mkdirSync(repairArtifactDir, { recursive: true });
const mark = (message) => console.error(`[acceptance] ${message}`);

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

function generatedPngBase64(size, opaque) {
  const stride = size * 4;
  const raw = Buffer.alloc((stride + 1) * size);
  const rectangleStart = Math.floor(size * 0.35);
  const rectangleEnd = Math.ceil(size * 0.65);
  for (let y = 0; y < size; y += 1) {
    const row = y * (stride + 1);
    raw[row] = 0;
    for (let x = 0; x < size; x += 1) {
      const offset = row + 1 + x * 4;
      const inside =
        x >= rectangleStart && x < rectangleEnd && y >= rectangleStart && y < rectangleEnd;
      raw[offset] = inside ? 30 : opaque ? 38 : 0;
      raw[offset + 1] = inside ? 150 : opaque ? 54 : 0;
      raw[offset + 2] = inside ? 210 : opaque ? 75 : 0;
      raw[offset + 3] = inside ? (opaque ? 255 : 191) : opaque ? 255 : 0;
    }
  }
  const header = Buffer.alloc(13);
  header.writeUInt32BE(size, 0);
  header.writeUInt32BE(size, 4);
  header[8] = 8;
  header[9] = 6;
  const png = Buffer.concat([
    Buffer.from([137, 80, 78, 71, 13, 10, 26, 10]),
    pngChunk('IHDR', header),
    pngChunk('IDAT', deflateSync(raw, { level: 6 })),
    pngChunk('IEND', Buffer.alloc(0)),
  ]);
  return png.toString('base64');
}

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

  send(method, params = {}, timeout = 45000) {
    const id = ++this.id;
    return new Promise((resolveSend, reject) => {
      const timer = setTimeout(() => {
        this.pending.delete(id);
        reject(new Error(`CDP ${method} timed out after ${timeout} ms.`));
      }, timeout);
      this.pending.set(id, {
        resolve: (value) => {
          clearTimeout(timer);
          resolveSend(value);
        },
        reject: (error) => {
          clearTimeout(timer);
          reject(error);
        },
      });
      this.socket.send(JSON.stringify({ id, method, params }));
    });
  }

  close() {
    this.socket.close();
  }
}

const delay = (ms) => new Promise((resolveDelay) => setTimeout(resolveDelay, ms));

async function waitFor(fn, timeout = 20000, interval = 80) {
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
    const response = await fetch(`http://127.0.0.1:${port}/json`);
    if (!response.ok) return null;
    const pages = await response.json();
    return pages.find((page) => page.type === 'page') ?? null;
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

async function waitExpression(cdp, expression, timeout = 20000) {
  return waitFor(() => evaluate(cdp, expression), timeout);
}

async function drawStroke(cdp, start, end, steps = 14) {
  await cdp.send('Input.dispatchMouseEvent', {
    type: 'mouseMoved',
    x: start.x,
    y: start.y,
    button: 'none',
  });
  await cdp.send('Input.dispatchMouseEvent', {
    type: 'mousePressed',
    x: start.x,
    y: start.y,
    button: 'left',
    buttons: 1,
    clickCount: 1,
  });
  for (let index = 1; index <= steps; index += 1) {
    const ratio = index / steps;
    await cdp.send('Input.dispatchMouseEvent', {
      type: 'mouseMoved',
      x: start.x + (end.x - start.x) * ratio,
      y: start.y + (end.y - start.y) * ratio + Math.sin(ratio * Math.PI) * 60,
      button: 'left',
      buttons: 1,
    });
  }
  await cdp.send('Input.dispatchMouseEvent', {
    type: 'mouseReleased',
    x: end.x,
    y: end.y,
    button: 'left',
    buttons: 0,
    clickCount: 1,
  });
}

async function stagePoints(cdp, row = 0.5) {
  return evaluate(
    cdp,
    `(() => {
    const rect = document.querySelector('.canvas-stage').getBoundingClientRect();
    return {
      start: { x: rect.left + rect.width * .18, y: rect.top + rect.height * ${row} },
      end: { x: rect.left + rect.width * .76, y: rect.top + rect.height * ${row} }
    };
  })()`,
  );
}

async function setSelectByLabel(cdp, label, text) {
  return evaluate(
    cdp,
    `(() => {
    const field = [...document.querySelectorAll('.image-brush-select')]
      .find((item) => item.querySelector(':scope > span')?.textContent.trim() === ${JSON.stringify(label)});
    if (!field) return false;
    const select = field.querySelector('select');
    const option = [...select.options].find((entry) => entry.textContent.trim() === ${JSON.stringify(text)});
    if (!option) return false;
    Object.getOwnPropertyDescriptor(HTMLSelectElement.prototype, 'value').set.call(select, option.value);
    select.dispatchEvent(new Event('change', { bubbles: true }));
    return true;
  })()`,
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

async function setRangeByLabel(cdp, label, value) {
  return evaluate(
    cdp,
    `(() => {
    const field = [...document.querySelectorAll('.image-brush-lab .slider-field')]
      .find((item) => item.textContent.includes(${JSON.stringify(label)}));
    const input = field?.querySelector('input[type=range]');
    if (!input) return false;
    Object.getOwnPropertyDescriptor(HTMLInputElement.prototype, 'value').set.call(input, ${JSON.stringify(String(value))});
    input.dispatchEvent(new Event('input', { bubbles: true }));
    input.dispatchEvent(new Event('change', { bubbles: true }));
    return true;
  })()`,
  );
}

async function waitImageBrushIdle(cdp, timeout = 30000) {
  await waitExpression(
    cdp,
    `!document.querySelector('.image-brush-progress') && !document.querySelector('.status-light.busy')`,
    timeout,
  );
}

async function canvasHash(cdp) {
  return evaluate(
    cdp,
    `(() => {
    const canvas = document.querySelector('.work-canvas');
    const data = canvas.getContext('2d').getImageData(0, 0, canvas.width, canvas.height).data;
    let hash = 2166136261 >>> 0;
    for (let index = 0; index < data.length; index += Math.max(4, Math.floor(data.length / 160000 / 4) * 4)) {
      hash = Math.imul(hash ^ data[index], 16777619) >>> 0;
      hash = Math.imul(hash ^ data[index + 1], 16777619) >>> 0;
      hash = Math.imul(hash ^ data[index + 2], 16777619) >>> 0;
      hash = Math.imul(hash ^ data[index + 3], 16777619) >>> 0;
    }
    return hash;
  })()`,
  );
}

async function installDownloadCapture(cdp) {
  await evaluate(
    cdp,
    `(() => {
    window.__capturedDownloads = [];
    const original = HTMLAnchorElement.prototype.click;
    HTMLAnchorElement.prototype.click = function () {
      const name = this.download || 'download';
      const href = this.href;
      fetch(href).then((response) => response.blob()).then(async (blob) => {
        window.__capturedDownloads.push({
          name,
          type: blob.type,
          bytes: await blob.arrayBuffer(),
          text: blob.type.includes('json') ? await blob.text() : null
        });
      });
      if (!href.startsWith('blob:')) original.call(this);
    };
    return true;
  })()`,
  );
}

async function openExport(cdp) {
  await evaluate(
    cdp,
    `(() => {
    [...document.querySelectorAll('.topbar-actions button')].find((button) => button.textContent.includes('Export')).click();
    return true;
  })()`,
  );
  await waitExpression(cdp, `Boolean(document.querySelector('.export-form'))`);
}

async function exportFormat(cdp, format, background = '#ffffff') {
  await openExport(cdp);
  await evaluate(
    cdp,
    `(() => {
    const form = document.querySelector('.export-form');
    const format = form.querySelector('select');
    Object.getOwnPropertyDescriptor(HTMLSelectElement.prototype, 'value').set.call(format, ${JSON.stringify(format)});
    format.dispatchEvent(new Event('change', { bubbles: true }));
    return true;
  })()`,
  );
  await delay(80);
  if (format === 'jpeg') {
    await evaluate(
      cdp,
      `(() => {
      const color = document.querySelector('.export-form input[type=color]');
      Object.getOwnPropertyDescriptor(HTMLInputElement.prototype, 'value').set.call(color, ${JSON.stringify(background)});
      color.dispatchEvent(new Event('input', { bubbles: true }));
      color.dispatchEvent(new Event('change', { bubbles: true }));
      return true;
    })()`,
    );
  }
  const previousCount = await evaluate(cdp, `window.__capturedDownloads.length`);
  await evaluate(
    cdp,
    `(() => {
    [...document.querySelectorAll('.export-form .modal-actions button')].find((button) => button.textContent.includes('Download')).click();
    return true;
  })()`,
  );
  await waitExpression(cdp, `window.__capturedDownloads.length > ${previousCount}`);
  return evaluate(
    cdp,
    `(async () => {
    const item = window.__capturedDownloads.at(-1);
    const bitmap = await createImageBitmap(new Blob([item.bytes], { type: item.type }));
    const canvas = document.createElement('canvas');
    canvas.width = bitmap.width;
    canvas.height = bitmap.height;
    canvas.getContext('2d').drawImage(bitmap, 0, 0);
    bitmap.close();
    const corner = [...canvas.getContext('2d').getImageData(0, 0, 1, 1).data];
    return { name: item.name, type: item.type, width: canvas.width, height: canvas.height, corner };
  })()`,
  );
}

async function loadGeneratedDocument(cdp, size, encodedPng) {
  await evaluate(
    cdp,
    `(async () => {
    const encoded = ${JSON.stringify(encodedPng)};
    const binary = atob(encoded);
    const bytes = new Uint8Array(binary.length);
    for (let index = 0; index < binary.length; index += 1) bytes[index] = binary.charCodeAt(index);
    const file = new File([bytes], 'transparent-${size}.png', { type: 'image/png' });
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
    `document.querySelector('.topbar-file strong')?.textContent.includes('transparent-${size}.png')`,
    30000,
  );
  await waitImageBrushIdle(cdp, 30000);
}

async function projectRoundTrip(cdp) {
  await openExport(cdp);
  await evaluate(
    cdp,
    `(() => {
    [...document.querySelectorAll('.export-form button')].find((button) => button.textContent.includes('Project import')).click();
    return true;
  })()`,
  );
  await waitExpression(cdp, `Boolean(document.querySelector('.project-panel'))`);
  const previousCount = await evaluate(cdp, `window.__capturedDownloads.length`);
  await evaluate(
    cdp,
    `(() => {
    [...document.querySelectorAll('.project-panel button')].find((button) => button.textContent.includes('Export project')).click();
    return true;
  })()`,
  );
  await waitExpression(cdp, `window.__capturedDownloads.length > ${previousCount}`);
  const projectSummary = await evaluate(
    cdp,
    `(() => {
    const item = window.__capturedDownloads.at(-1);
    const project = JSON.parse(item.text);
    return {
      library: project.imageBrush?.library?.length ?? 0,
      active: project.imageBrush?.activeAssetId,
      rack: project.imageBrush?.rack?.length ?? 0
    };
  })()`,
  );
  await evaluate(
    cdp,
    `(async () => {
    const item = window.__capturedDownloads.at(-1);
    const file = new File([item.text], 'roundtrip.hexproject.json', { type: 'application/json' });
    const transfer = new DataTransfer();
    transfer.items.add(file);
    const input = document.querySelector('.project-panel input[type=file]');
    Object.getOwnPropertyDescriptor(HTMLInputElement.prototype, 'files').set.call(input, transfer.files);
    input.dispatchEvent(new Event('change', { bubbles: true }));
    return true;
  })()`,
  );
  await delay(600);
  return {
    ...projectSummary,
    restored: await evaluate(
      cdp,
      `document.querySelectorAll('.image-brush-library article').length`,
    ),
  };
}

async function runEdge() {
  mark('launching Edge');
  const transparent512Png = generatedPngBase64(512, false);
  const opaque4000Png = generatedPngBase64(4000, true);
  const profile = mkdtempSync(join(tmpdir(), 'imgfuck-edge-'));
  const edge = spawn(
    edgePath,
    [
      '--headless=new',
      '--disable-gpu',
      '--no-first-run',
      '--no-default-browser-check',
      '--remote-debugging-port=9333',
      `--user-data-dir=${profile}`,
      '--window-size=1600,1000',
      'about:blank',
    ],
    { stdio: 'ignore', windowsHide: true },
  );
  const exceptions = [];
  const consoleErrors = [];
  try {
    const page = await waitForEndpoint(9333);
    const cdp = new Cdp(page.webSocketDebuggerUrl);
    await cdp.open();
    cdp.on('Runtime.exceptionThrown', (event) =>
      exceptions.push(event.exceptionDetails?.text ?? 'exception'),
    );
    cdp.on('Page.javascriptDialogOpening', () => {
      mark('accepting replace-image confirmation');
      void cdp.send('Page.handleJavaScriptDialog', { accept: true });
    });
    cdp.on('Log.entryAdded', (event) => {
      if (event.entry?.level === 'error') consoleErrors.push(event.entry.text);
    });
    await Promise.all([
      cdp.send('Runtime.enable'),
      cdp.send('Page.enable'),
      cdp.send('Log.enable'),
    ]);
    await cdp.send('Page.navigate', { url: appUrl });
    await waitExpression(
      cdp,
      `Boolean(document.querySelector('.brand svg[aria-label="imgfuck"]'))`,
    );
    mark('app loaded');
    await installDownloadCapture(cdp);
    await evaluate(
      cdp,
      `(() => {
      [...document.querySelectorAll('.inspector-tabs button')].find((button) => button.textContent.includes('Image Brush')).click();
      return true;
    })()`,
    );
    await waitExpression(cdp, `Boolean(document.querySelector('.image-brush-lab'))`);
    mark('IMAGE BRUSH tab opened');

    const initial = await evaluate(
      cdp,
      `(() => ({
      tabs: [...document.querySelectorAll('.inspector-tabs button')].map((button) => button.textContent.trim()),
      assets: document.querySelectorAll('.image-brush-library article').length,
      originalPreview: document.querySelector('.image-brush-previews canvas')?.width,
      processedPreview: document.querySelectorAll('.image-brush-previews canvas')[1]?.width,
      active: document.querySelector('.image-brush-library article.active strong')?.textContent
    }))()`,
    );

    const firstPoints = await stagePoints(cdp, 0.36);
    const before = await canvasHash(cdp);
    await drawStroke(cdp, firstPoints.start, firstPoints.end, 7);
    await waitImageBrushIdle(cdp);
    mark('clean stroke completed');
    const cleanHash = await canvasHash(cdp);
    const cleanHistory = await evaluate(
      cdp,
      `document.querySelector('.history-popover') ? '' : (
      [...document.querySelectorAll('.topbar-actions button')].find((button) => button.title === 'History').click(), ''
    )`,
    );
    await waitExpression(cdp, `Boolean(document.querySelector('.history-list button'))`);
    const cleanLabel = await evaluate(
      cdp,
      `document.querySelector('.history-list button strong')?.textContent`,
    );
    await evaluate(cdp, `document.querySelector('.history-popover .icon-button').click()`);

    await evaluate(
      cdp,
      `[...document.querySelectorAll('.topbar-actions button')].find((button) => button.title.startsWith('Undo')).click()`,
    );
    const undoHash = await canvasHash(cdp);
    await evaluate(
      cdp,
      `[...document.querySelectorAll('.topbar-actions button')].find((button) => button.title.startsWith('Redo')).click()`,
    );
    const redoHash = await canvasHash(cdp);

    const modeResults = [];
    const modePresets = [
      ['Repeated UI Icon', 'fixed'],
      ['Glitched Repeat', 'per-stamp'],
      ['Compression Decay', 'evolving'],
      ['Chroma Echo', 'stroke-feedback'],
      ['Datamosh Ribbon', 'datamosh'],
      ['Pixel Sort Trail', 'post-sort'],
      ['Scattered Fragments', 'scatter'],
      ['Chaotic Image Hose', 'random-hose'],
    ];
    for (let index = 0; index < modePresets.length; index += 1) {
      const [preset, key] = modePresets[index];
      if (!(await setPreset(cdp, preset))) throw new Error(`Preset not found: ${preset}`);
      await delay(120);
      const points = await stagePoints(cdp, 0.22 + (index % 5) * 0.13);
      await drawStroke(cdp, points.start, points.end, 5 + index);
      await waitImageBrushIdle(cdp, 35000);
      modeResults.push({ key, hash: await canvasHash(cdp) });
      mark(`${preset} completed`);
    }

    await setSelectByLabel(cdp, 'Rotation', 'Follow Stroke');
    await setRangeByLabel(cdp, 'Spacing', 18);
    const overlapPoints = await stagePoints(cdp, 0.7);
    await drawStroke(cdp, overlapPoints.start, overlapPoints.end, 22);
    await waitImageBrushIdle(cdp);
    const overlapHash = await canvasHash(cdp);
    await setRangeByLabel(cdp, 'Spacing', 200);
    const gapPoints = await stagePoints(cdp, 0.82);
    await drawStroke(cdp, gapPoints.start, gapPoints.end, 3);
    await waitImageBrushIdle(cdp);
    const gapHash = await canvasHash(cdp);
    mark('spacing and follow-stroke completed');

    const blendModes = [
      'Normal',
      'Multiply',
      'Screen',
      'Overlay',
      'Difference',
      'Lighten',
      'Darken',
      'Hard Light',
      'Color Dodge',
      'Exclusion',
    ];
    for (const blend of blendModes) {
      if (!(await setSelectByLabel(cdp, 'Blend mode', blend)))
        throw new Error(`Blend mode missing: ${blend}`);
    }
    const alphaModes = ['Preserve Alpha', 'Glitch Inside Alpha', 'Alpha Bleed', 'Corrupt Alpha'];
    for (const alpha of alphaModes) {
      if (!(await setSelectByLabel(cdp, 'Alpha mode', alpha)))
        throw new Error(`Alpha mode missing: ${alpha}`);
    }
    await setSelectByLabel(cdp, 'Alpha mode', 'Preserve Alpha');
    mark('blend and alpha controls enumerated');

    await setPreset(cdp, 'Clean Sticker Trail');
    await waitImageBrushIdle(cdp);
    const project = await projectRoundTrip(cdp);
    mark('project round-trip completed');
    mark('closing project modal');
    await evaluate(
      cdp,
      `document.querySelector('.modal[aria-label="Project data"] button[aria-label="Close"]')?.click()`,
    );
    mark('project modal closed');

    mark('selecting clean preset after project import');
    await setPreset(cdp, 'Clean Sticker Trail');
    mark('clean preset selected after project import');
    await setRangeByLabel(cdp, 'Spacing', 96);
    mark('loading transparent 512x512 document');
    await loadGeneratedDocument(cdp, 512, transparent512Png);
    mark('transparent 512x512 document loaded');
    const transparentPoints = await stagePoints(cdp, 0.5);
    await drawStroke(cdp, transparentPoints.start, transparentPoints.end, 12);
    await waitImageBrushIdle(cdp);
    const png = await exportFormat(cdp, 'png');
    mark('PNG export decoded');
    await evaluate(
      cdp,
      `document.querySelector('.modal[aria-label="Export image"] button[aria-label="Close"]')?.click()`,
    );
    const jpeg = await exportFormat(cdp, 'jpeg', '#ff00ff');
    mark('JPEG export decoded');
    await evaluate(
      cdp,
      `document.querySelector('.modal[aria-label="Export image"] button[aria-label="Close"]')?.click()`,
    );
    const webp = await exportFormat(cdp, 'webp');
    mark('WebP export decoded');
    await evaluate(
      cdp,
      `document.querySelector('.modal[aria-label="Export image"] button[aria-label="Close"]')?.click()`,
    );

    await setPreset(cdp, 'Clean Sticker Trail');
    await setRangeByLabel(cdp, 'Spacing', 200);
    await setRangeByLabel(cdp, 'Size', 96);
    await loadGeneratedDocument(cdp, 4000, opaque4000Png);
    const largePoints = await stagePoints(cdp, 0.5);
    const largeStarted = Date.now();
    await drawStroke(cdp, largePoints.start, largePoints.end, 4);
    const historyToggleMs = await evaluate(
      cdp,
      `(() => {
      const started = performance.now();
      [...document.querySelectorAll('.topbar-actions button')].find((button) => button.title === 'History').click();
      return performance.now() - started;
    })()`,
    );
    await waitImageBrushIdle(cdp, 60000);
    const largeElapsedMs = Date.now() - largeStarted;
    mark('4000x4000 stroke completed');
    await evaluate(cdp, `document.querySelector('.history-popover .icon-button')?.click()`);

    const screenshot = await cdp.send('Page.captureScreenshot', {
      format: 'png',
      captureBeyondViewport: false,
    });
    writeFileSync(
      join(artifactDir, 'image-brush-edge.png'),
      Buffer.from(screenshot.data, 'base64'),
    );

    const report = {
      browser: 'Edge Chromium',
      initial,
      clean: {
        changed: cleanHash !== before,
        history: cleanLabel,
        undoRestored: undoHash === before,
        redoExact: redoHash === cleanHash,
      },
      mutationModes: modeResults,
      spacingDistinct: overlapHash !== gapHash,
      blendModes,
      alphaModes,
      project,
      exports: { png, jpeg, webp },
      largeDocument: { historyToggleMs, elapsedMs: largeElapsedMs },
      exceptions,
      consoleErrors,
    };
    writeFileSync(
      join(artifactDir, 'image-brush-edge-report.json'),
      JSON.stringify(report, null, 2),
    );
    cdp.close();
    return report;
  } finally {
    edge.kill();
    await delay(300);
    rmSync(profile, { recursive: true, force: true });
  }
}

async function runFirefox() {
  mark('launching Firefox screenshot');
  const screenshot = join(repairArtifactDir, 'after-firefox.png');
  const profile = mkdtempSync(join(tmpdir(), 'imgfuck-firefox-'));
  const firefox = spawn(
    firefoxPath,
    [
      '--headless',
      '--no-remote',
      '--profile',
      profile,
      '--window-size=1600,1000',
      '--screenshot',
      screenshot,
      appUrl,
    ],
    { stdio: ['ignore', 'pipe', 'pipe'], windowsHide: true },
  );
  let stdout = '';
  let stderr = '';
  firefox.stdout.on('data', (chunk) => {
    stdout += chunk;
  });
  firefox.stderr.on('data', (chunk) => {
    stderr += chunk;
  });
  try {
    const rendered = await waitFor(() => existsSync(screenshot), 45000, 250);
    if (firefox.exitCode === null) {
      await Promise.race([
        new Promise((resolveExit) => firefox.once('exit', resolveExit)),
        delay(5000),
      ]);
    }
    const report = {
      browser: 'Firefox',
      code: firefox.exitCode,
      stdout,
      stderr,
      screenshot,
      rendered: Boolean(rendered),
    };
    writeFileSync(
      join(repairArtifactDir, 'after-firefox-report.json'),
      JSON.stringify(report, null, 2),
    );
    return report;
  } finally {
    if (firefox.exitCode === null) firefox.kill();
    await delay(300);
    rmSync(profile, { recursive: true, force: true });
  }
}

const firefoxOnly = process.argv.includes('--firefox-only');
const edgeReport = firefoxOnly ? null : await runEdge();
if (edgeReport) mark('Edge acceptance completed');
const firefoxReport = await runFirefox();
mark('Firefox render completed');
console.log(JSON.stringify({ edge: edgeReport, firefox: firefoxReport }, null, 2));
