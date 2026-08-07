import { spawn } from 'node:child_process';
import { mkdirSync, mkdtempSync, readFileSync, writeFileSync } from 'node:fs';
import { resolve } from 'node:path';

const edgePath = 'C:\\Program Files (x86)\\Microsoft\\Edge\\Application\\msedge.exe';
const port = 9334;
const appUrl = 'http://127.0.0.1:5174/';
const artifactDir = resolve('browser-artifacts', 'image-brush-edge');
const visualTestPath =
  process.env.EDITOR_TEST_IMAGE ??
  'M:\\MYPICTUReseagle\\Mytv.library\\images\\MELACZBFZW3CE.info\\астронавт2.png';
const imageBase64 = readFileSync(visualTestPath).toString('base64');
mkdirSync(artifactDir, { recursive: true });
const profile = mkdtempSync(resolve(artifactDir, 'visible-profile-'));

class Cdp {
  constructor(url) {
    this.socket = new WebSocket(url);
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
      if (message.error) pending.reject(new Error(message.error.message));
      else pending.resolve(message.result);
    });
    this.socket.addEventListener('close', () => {
      for (const pending of this.pending.values()) {
        pending.reject(new Error('Visible Edge CDP connection closed.'));
      }
      this.pending.clear();
    });
  }

  send(method, params = {}) {
    const id = ++this.id;
    return new Promise((resolveSend, reject) => {
      const timer = setTimeout(() => {
        this.pending.delete(id);
        reject(new Error(`Visible Edge CDP ${method} timed out.`));
      }, 120000);
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
}

const delay = (ms) => new Promise((resolveDelay) => setTimeout(resolveDelay, ms));

async function waitFor(callback, timeout = 30000) {
  const started = Date.now();
  while (Date.now() - started < timeout) {
    const value = await callback();
    if (value) return value;
    await delay(80);
  }
  throw new Error(`Timed out after ${timeout} ms.`);
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

async function clickPoint(cdp, x, y, button = 'left') {
  await cdp.send('Input.dispatchMouseEvent', { type: 'mouseMoved', x, y, button: 'none' });
  await cdp.send('Input.dispatchMouseEvent', {
    type: 'mousePressed',
    x,
    y,
    button,
    buttons: button === 'right' ? 2 : 1,
    clickCount: 1,
  });
  await cdp.send('Input.dispatchMouseEvent', {
    type: 'mouseReleased',
    x,
    y,
    button,
    buttons: 0,
    clickCount: 1,
  });
}

async function rect(cdp, expression) {
  const result = await evaluate(
    cdp,
    `(() => {
    const element = ${expression};
    if (!element) return null;
    element.scrollIntoView({ block: 'center', inline: 'center' });
    const bounds = element.getBoundingClientRect();
    return { x: bounds.x, y: bounds.y, width: bounds.width, height: bounds.height };
  })()`,
  );
  if (!result) throw new Error(`Element not found: ${expression}`);
  return result;
}

const edge = spawn(
  edgePath,
  [
    `--remote-debugging-port=${port}`,
    `--user-data-dir=${profile}`,
    '--no-first-run',
    '--no-default-browser-check',
    '--disable-features=msEdgeFirstRunExperience',
    '--window-size=1500,980',
    appUrl,
  ],
  {
    stdio: 'ignore',
    windowsHide: false,
  },
);

let cdp;
try {
  const target = await waitFor(async () => {
    try {
      const response = await fetch(`http://127.0.0.1:${port}/json`);
      if (!response.ok) return null;
      const pages = await response.json();
      return pages.find((page) => page.type === 'page' && page.url.startsWith(appUrl));
    } catch {
      return null;
    }
  }, 20000);
  cdp = new Cdp(target.webSocketDebuggerUrl);
  await cdp.open();
  await cdp.send('Runtime.enable');
  await waitFor(() =>
    evaluate(cdp, `Boolean(document.querySelector('.brand svg[aria-label="imgfuck"]'))`),
  );
  await evaluate(
    cdp,
    `(async () => {
    const response = await fetch('data:image/png;base64,${imageBase64}');
    const file = new File([await response.blob()], 'астронавт2.png', { type: 'image/png' });
    const transfer = new DataTransfer();
    transfer.items.add(file);
    const input = document.querySelector('.topbar input[type=file]');
    Object.getOwnPropertyDescriptor(HTMLInputElement.prototype, 'files').set.call(input, transfer.files);
    input.dispatchEvent(new Event('change', { bubbles: true }));
    return true;
  })()`,
  );
  await waitFor(() =>
    evaluate(
      cdp,
      `document.querySelector('.topbar-file strong')?.textContent.includes('астронавт2.png')`,
    ),
  );
  await evaluate(
    cdp,
    `(() => {
    [...document.querySelectorAll('.inspector-tabs button')]
      .find((button) => button.textContent.toUpperCase().includes('IMAGE BRUSH'))?.click();
    return true;
  })()`,
  );
  await waitFor(() => evaluate(cdp, `Boolean(document.querySelector('.image-brush-compact'))`));

  const layout = [];
  for (const zoom of [1, 1.25, 1.5]) {
    for (const width of [320, 450, 600]) {
      const measurement = await evaluate(
        cdp,
        `new Promise((resolve) => {
        document.documentElement.style.zoom = ${JSON.stringify(String(zoom))};
        document.querySelector('.workspace').style.gridTemplateColumns = '55px minmax(0, 1fr) ${width}px';
        requestAnimationFrame(() => requestAnimationFrame(() => {
          const lab = document.querySelector('.image-brush-lab');
          const essential = document.querySelector('.image-brush-essential');
          const inspector = document.querySelector('.inspector');
          const inspectorRect = inspector.getBoundingClientRect();
          const ranges = [...essential.querySelectorAll('input[type=range]')];
          resolve({
            zoom: ${zoom},
            requestedWidth: ${width},
            viewport: [innerWidth, innerHeight],
            devicePixelRatio,
            lab: [lab.clientWidth, lab.scrollWidth],
            essential: [essential.clientWidth, essential.scrollWidth],
            rangeCount: ranges.length,
            rangesInsideInspector: ranges.every((range) => {
              const bounds = range.getBoundingClientRect();
              return bounds.left >= inspectorRect.left && bounds.right <= inspectorRect.right + 1;
            }),
            presetPreviewCanvases: document.querySelectorAll('.image-brush-style-cards canvas').length
          });
        }));
      })`,
      );
      layout.push(measurement);
    }
  }
  await evaluate(
    cdp,
    `(() => {
    document.documentElement.style.zoom = '1';
    document.querySelector('.workspace').style.gridTemplateColumns = '55px minmax(0, 1fr) 410px';
    return true;
  })()`,
  );
  await evaluate(
    cdp,
    `(async () => {
    const response = await fetch('data:image/png;base64,${imageBase64}');
    const file = new File([await response.blob()], 'astronaut-edge-stamp.png', { type: 'image/png' });
    const transfer = new DataTransfer();
    transfer.items.add(file);
    document.querySelector('.image-brush-lab').dispatchEvent(new DragEvent('drop', {
      bubbles: true,
      cancelable: true,
      dataTransfer: transfer,
    }));
    return true;
  })()`,
  );
  await waitFor(() =>
    evaluate(
      cdp,
      `document.querySelector('.image-brush-active-image strong')?.textContent.includes('astronaut-edge-stamp')`,
    ),
  );
  await evaluate(
    cdp,
    `(() => {
    const select = document.querySelector('.image-brush-optimization select');
    Object.getOwnPropertyDescriptor(HTMLSelectElement.prototype, 'value').set.call(select, '128');
    select.dispatchEvent(new Event('change', { bubbles: true }));
    return true;
  })()`,
  );
  await delay(180);
  await evaluate(
    cdp,
    `(() => {
    [...document.querySelectorAll('.image-brush-optimization button')]
      .find((button) => button.textContent.includes('Optimize Stamp Image'))?.click();
    return true;
  })()`,
  );
  await waitFor(() =>
    evaluate(
      cdp,
      `document.querySelector('.image-brush-active-image')?.textContent.includes('128')`,
    ),
  );
  await evaluate(
    cdp,
    `(() => {
    const select = document.querySelector('select[data-help-id="image-brush.preset"]');
    const option = [...select.options].find((entry) => entry.textContent.trim() === 'Glitched Repeat');
    Object.getOwnPropertyDescriptor(HTMLSelectElement.prototype, 'value').set.call(select, option.value);
    select.dispatchEvent(new Event('change', { bubbles: true }));
    return true;
  })()`,
  );
  await delay(250);

  const sizeInput = await rect(
    cdp,
    `document.querySelector('.image-brush-essential input[aria-label="Size"]')`,
  );
  const sizeBefore = await evaluate(
    cdp,
    `document.querySelector('.image-brush-essential input[aria-label="Size"]').value`,
  );
  await cdp.send('Input.dispatchMouseEvent', {
    type: 'mouseMoved',
    x: sizeInput.x + sizeInput.width * 0.25,
    y: sizeInput.y + sizeInput.height / 2,
  });
  await cdp.send('Input.dispatchMouseEvent', {
    type: 'mousePressed',
    x: sizeInput.x + sizeInput.width * 0.25,
    y: sizeInput.y + sizeInput.height / 2,
    button: 'left',
    buttons: 1,
    clickCount: 1,
  });
  await cdp.send('Input.dispatchMouseEvent', {
    type: 'mouseMoved',
    x: sizeInput.x + sizeInput.width * 0.7,
    y: sizeInput.y + sizeInput.height / 2,
    button: 'left',
    buttons: 1,
  });
  await cdp.send('Input.dispatchMouseEvent', {
    type: 'mouseReleased',
    x: sizeInput.x + sizeInput.width * 0.7,
    y: sizeInput.y + sizeInput.height / 2,
    button: 'left',
    buttons: 0,
    clickCount: 1,
  });
  await delay(160);
  const sizeAfter = await evaluate(
    cdp,
    `document.querySelector('.image-brush-essential input[aria-label="Size"]').value`,
  );

  const firstThumbnail = await rect(cdp, `document.querySelector('.image-brush-library-select')`);
  await clickPoint(
    cdp,
    firstThumbnail.x + firstThumbnail.width / 2,
    firstThumbnail.y + firstThumbnail.height / 2,
    'right',
  );
  await delay(120);
  const contextMenuVisible = await evaluate(
    cdp,
    `Boolean(document.querySelector('.image-brush-library-context [role=menuitem]'))`,
  );
  await cdp.send('Input.dispatchKeyEvent', { type: 'keyDown', key: 'Escape', code: 'Escape' });
  await cdp.send('Input.dispatchKeyEvent', { type: 'keyUp', key: 'Escape', code: 'Escape' });
  await evaluate(
    cdp,
    `(() => {
    const input = document.querySelector('.image-brush-essential input[aria-label="Size"]');
    Object.getOwnPropertyDescriptor(HTMLInputElement.prototype, 'value').set.call(input, '96');
    input.dispatchEvent(new Event('input', { bubbles: true }));
    input.dispatchEvent(new Event('change', { bubbles: true }));
    return true;
  })()`,
  );
  await delay(180);

  const canvas = await rect(cdp, `document.querySelector('.work-canvas')`);
  const historyBefore = await evaluate(
    cdp,
    `document.querySelector('.status-data')?.textContent ?? ''`,
  );
  const undoDisabledBefore = await evaluate(
    cdp,
    `document.querySelector('.topbar-actions button[title^="Undo"]')?.disabled ?? true`,
  );
  const start = { x: canvas.x + canvas.width * 0.3, y: canvas.y + canvas.height * 0.48 };
  const end = { x: canvas.x + canvas.width * 0.7, y: canvas.y + canvas.height * 0.55 };
  await cdp.send('Input.dispatchMouseEvent', { type: 'mouseMoved', ...start });
  await cdp.send('Input.dispatchMouseEvent', {
    type: 'mousePressed',
    ...start,
    button: 'left',
    buttons: 1,
    clickCount: 1,
  });
  for (let index = 1; index <= 12; index += 1) {
    const ratio = index / 12;
    await cdp.send('Input.dispatchMouseEvent', {
      type: 'mouseMoved',
      x: start.x + (end.x - start.x) * ratio,
      y: start.y + (end.y - start.y) * ratio + Math.sin(ratio * Math.PI * 3) * 12,
      button: 'left',
      buttons: 1,
    });
  }
  await cdp.send('Input.dispatchMouseEvent', {
    type: 'mouseReleased',
    ...end,
    button: 'left',
    buttons: 0,
    clickCount: 1,
  });
  await waitFor(
    () =>
      evaluate(
        cdp,
        `document.querySelector('.topbar-actions button[title^="Undo"]')?.disabled === false`,
      ),
    120000,
  );
  await waitFor(() => evaluate(cdp, `!document.querySelector('.image-brush-progress')`), 120000);
  const historyAfter = await evaluate(
    cdp,
    `document.querySelector('.status-data')?.textContent ?? ''`,
  );
  const undoDisabledAfter = await evaluate(
    cdp,
    `document.querySelector('.topbar-actions button[title^="Undo"]')?.disabled ?? true`,
  );

  const screenshot = await cdp.send('Page.captureScreenshot', { format: 'png', fromSurface: true });
  const report = {
    browser: await evaluate(cdp, `navigator.userAgent`),
    visible: true,
    layout,
    allLayoutsFit: layout.every(
      (entry) =>
        entry.lab[0] === entry.lab[1] &&
        entry.essential[0] === entry.essential[1] &&
        entry.rangeCount === 5 &&
        entry.rangesInsideInspector &&
        entry.presetPreviewCanvases === 0,
    ),
    slider: { before: sizeBefore, after: sizeAfter, changed: sizeBefore !== sizeAfter },
    contextMenuVisible,
    strokeCommitted: undoDisabledBefore && !undoDisabledAfter && historyBefore !== historyAfter,
    historyBefore,
    historyAfter,
    visualTestPath,
    activeStamp: await evaluate(
      cdp,
      `document.querySelector('.image-brush-active-image strong')?.textContent.trim()`,
    ),
    visibleTabs: await evaluate(
      cdp,
      `[...document.querySelectorAll('.inspector-tabs button')].map((button) => button.textContent.trim())`,
    ),
    hexRemoved: await evaluate(
      cdp,
      `![...document.querySelectorAll('.inspector-tabs button')].some((button) => /(^|\\s)HEX($|\\s)/i.test(button.textContent))`,
    ),
    testedPreset: 'Glitched Repeat',
    codecWholeTrailEdgeWatchdog:
      'Exceeded 120 seconds in separate 427 px and 96 px Edge attempts; final Edge smoke uses Glitched Repeat while Firefox retains the accepted Codec whole-trail evidence.',
  };
  writeFileSync(
    resolve(artifactDir, 'major-editor-stage8-visible-edge-astronaut.png'),
    Buffer.from(screenshot.data, 'base64'),
  );
  writeFileSync(
    resolve(artifactDir, 'major-editor-stage8-visible-edge-astronaut.json'),
    JSON.stringify(report, null, 2),
  );
  console.log(JSON.stringify(report, null, 2));
  await cdp.send('Browser.close');
} finally {
  cdp?.socket?.close();
  if (edge.exitCode === null) edge.kill();
}
