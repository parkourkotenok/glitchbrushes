import { spawn } from 'node:child_process';
import { existsSync, mkdirSync, mkdtempSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join, resolve } from 'node:path';

const phase = process.env.VISUAL_PHASE ?? 'baseline';
const port = Number(process.env.VISUAL_PORT ?? 5174);
const appUrl = `http://127.0.0.1:${port}/`;
const edgePath = 'C:\\Program Files (x86)\\Microsoft\\Edge\\Application\\msedge.exe';
const artifactDir = resolve('browser-artifacts', 'imgfuck-redesign', phase);
const profileDir = mkdtempSync(join(tmpdir(), `imgfuck-${phase}-edge-`));
const viewport = { width: 1440, height: 900 };
mkdirSync(artifactDir, { recursive: true });

const delay = (ms) => new Promise((resolveDelay) => setTimeout(resolveDelay, ms));

async function waitFor(fn, timeout = 30000, interval = 100) {
  const started = Date.now();
  let lastError;
  while (Date.now() - started < timeout) {
    try {
      const result = await fn();
      if (result) return result;
    } catch (error) {
      lastError = error;
    }
    await delay(interval);
  }
  throw lastError ?? new Error(`Timed out after ${timeout} ms.`);
}

class Cdp {
  constructor(url) {
    this.socket = new WebSocket(url);
    this.nextId = 0;
    this.pending = new Map();
  }

  async open() {
    await new Promise((resolveOpen, rejectOpen) => {
      this.socket.addEventListener('open', resolveOpen, { once: true });
      this.socket.addEventListener('error', rejectOpen, { once: true });
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
  }

  send(method, params = {}, timeout = 45000) {
    const id = ++this.nextId;
    return new Promise((resolveSend, rejectSend) => {
      const timer = setTimeout(() => {
        this.pending.delete(id);
        rejectSend(new Error(`${method} timed out after ${timeout} ms.`));
      }, timeout);
      this.pending.set(id, {
        resolve: (value) => {
          clearTimeout(timer);
          resolveSend(value);
        },
        reject: (error) => {
          clearTimeout(timer);
          rejectSend(error);
        },
      });
      this.socket.send(JSON.stringify({ id, method, params }));
    });
  }

  close() {
    this.socket.close();
  }
}

async function evaluate(cdp, expression) {
  const response = await cdp.send('Runtime.evaluate', {
    expression,
    awaitPromise: true,
    returnByValue: true,
    userGesture: true,
  });
  if (response.exceptionDetails) {
    throw new Error(
      response.exceptionDetails.exception?.description ?? response.exceptionDetails.text,
    );
  }
  return response.result.value;
}

async function waitExpression(cdp, expression, timeout = 30000) {
  return waitFor(() => evaluate(cdp, `Boolean(${expression})`), timeout);
}

async function capture(cdp, name) {
  await delay(250);
  const result = await cdp.send('Page.captureScreenshot', {
    format: 'png',
    captureBeyondViewport: false,
    fromSurface: true,
  });
  const path = join(artifactDir, `${name}.png`);
  writeFileSync(path, Buffer.from(result.data, 'base64'));
  return path;
}

async function clickText(cdp, selector, text) {
  const clicked = await evaluate(
    cdp,
    `(() => {
      const target = [...document.querySelectorAll(${JSON.stringify(selector)})]
        .find((element) => element.textContent.trim().toLowerCase().includes(${JSON.stringify(text.toLowerCase())}));
      if (!target) return false;
      target.click();
      return true;
    })()`,
  );
  if (!clicked) throw new Error(`Could not click ${selector} containing ${text}.`);
}

async function resetInspector(cdp) {
  await evaluate(
    cdp,
    `(() => {
    const scroller = document.querySelector('.inspector-scroll');
    if (scroller) scroller.scrollTop = 0;
    return true;
  })()`,
  );
  await delay(120);
}

async function main() {
  if (!existsSync(edgePath)) throw new Error(`Microsoft Edge not found at ${edgePath}.`);

  const vite = spawn(
    process.execPath,
    [
      resolve('node_modules', 'vite', 'bin', 'vite.js'),
      '--host',
      '127.0.0.1',
      '--port',
      String(port),
    ],
    {
      cwd: process.cwd(),
      windowsHide: true,
      stdio: ['ignore', 'pipe', 'pipe'],
    },
  );
  const edge = spawn(
    edgePath,
    [
      '--headless=new',
      '--disable-gpu',
      '--no-first-run',
      '--no-default-browser-check',
      '--disable-background-networking',
      '--disable-features=msEdgeSidebarV2',
      `--remote-debugging-port=${port + 4000}`,
      `--user-data-dir=${profileDir}`,
      `--window-size=${viewport.width},${viewport.height}`,
      'about:blank',
    ],
    { windowsHide: true, stdio: 'ignore' },
  );

  let cdp;
  try {
    await waitFor(async () => {
      const response = await fetch(appUrl);
      return response.ok;
    });
    const page = await waitFor(async () => {
      const response = await fetch(`http://127.0.0.1:${port + 4000}/json`);
      if (!response.ok) return null;
      const pages = await response.json();
      return pages.find((entry) => entry.type === 'page') ?? null;
    });
    cdp = new Cdp(page.webSocketDebuggerUrl);
    await cdp.open();
    await cdp.send('Page.enable');
    await cdp.send('Runtime.enable');
    await cdp.send('Emulation.setDeviceMetricsOverride', {
      width: viewport.width,
      height: viewport.height,
      deviceScaleFactor: 1,
      mobile: false,
    });
    await cdp.send('Page.navigate', { url: appUrl });
    await waitExpression(
      cdp,
      `document.querySelector('.app') && document.querySelector('.canvas-stage')`,
    );
    await delay(700);

    const screenshots = [];
    screenshots.push(await capture(cdp, '01-effect-workspace'));
    screenshots.push(await capture(cdp, '02-demo-state'));

    await clickText(cdp, '.inspector-tabs button', 'retouch');
    await waitExpression(cdp, `document.querySelector('.retouch-panel, .retouch-tool-grid')`);
    screenshots.push(await capture(cdp, '03-retouch'));

    await clickText(cdp, '.inspector-tabs button', 'mosh lab');
    await waitExpression(cdp, `document.querySelector('.mosh-lab')`);
    screenshots.push(await capture(cdp, '04-mosh-lab'));

    await clickText(cdp, '.inspector-tabs button', 'image brush');
    await waitExpression(cdp, `document.querySelector('.image-brush-lab')`);
    screenshots.push(await capture(cdp, '05-image-brush'));

    await clickText(cdp, '.inspector-tabs button', 'file corruption');
    await waitExpression(cdp, `document.querySelector('.raw-panel')`);
    screenshots.push(await capture(cdp, '06-file-corruption'));

    await clickText(cdp, '.inspector-tabs button', 'effect');
    await waitExpression(cdp, `document.querySelector('.algorithm-card')`);
    await resetInspector(cdp);
    screenshots.push(await capture(cdp, '07-effect-configuration-card'));

    await evaluate(
      cdp,
      `(() => {
      const target = document.querySelector('.layer-stack');
      const scroller = document.querySelector('.inspector-scroll');
      if (!target || !scroller) return false;
      scroller.scrollTop = target.getBoundingClientRect().top - scroller.getBoundingClientRect().top + scroller.scrollTop - 120;
      return true;
    })()`,
    );
    screenshots.push(await capture(cdp, '08-layers-panel'));

    await resetInspector(cdp);
    await evaluate(cdp, `document.querySelector('.effect-picker-trigger').click()`);
    await waitExpression(cdp, `document.querySelector('.effect-picker-menu')`);
    screenshots.push(await capture(cdp, '09-dropdown-open'));
    await evaluate(cdp, `document.querySelector('.effect-picker-trigger').click()`);

    await clickText(cdp, '.topbar-actions button', 'export');
    await waitExpression(cdp, `document.querySelector('.modal-backdrop')`);
    screenshots.push(await capture(cdp, '10-export-dialog'));
    await evaluate(cdp, `document.querySelector('.modal .icon-button').click()`);

    await evaluate(
      cdp,
      `document.querySelector('.topbar-actions button[title="History"]').click()`,
    );
    await waitExpression(cdp, `document.querySelector('.history-popover')`);
    screenshots.push(await capture(cdp, '11-history'));
    await evaluate(
      cdp,
      `document.querySelector('.history-popover button[title="Close history"]')?.click()`,
    );

    await evaluate(
      cdp,
      `document.querySelector('button[aria-label="Open contextual help"]')?.click()`,
    );
    await waitExpression(cdp, `document.querySelector('.help-about')`);
    screenshots.push(await capture(cdp, '12-help-about'));
    await evaluate(
      cdp,
      `document.querySelector('.help-panel button[aria-label="Close help panel"]')?.click()`,
    );

    const report = await evaluate(
      cdp,
      `(() => {
      const app = document.querySelector('.app');
      const inspector = document.querySelector('.inspector');
      const scroll = document.querySelector('.inspector-scroll');
      const style = getComputedStyle(document.documentElement);
      return {
        title: document.title,
        brand: document.querySelector('.brand')?.innerText ?? '',
        viewport: { width: innerWidth, height: innerHeight, dpr: devicePixelRatio },
        app: app ? { width: app.clientWidth, scrollWidth: app.scrollWidth } : null,
        inspector: inspector ? { width: inspector.clientWidth, scrollWidth: inspector.scrollWidth } : null,
        inspectorScroll: scroll ? { width: scroll.clientWidth, scrollWidth: scroll.scrollWidth } : null,
        cssTokenCount: [...style].filter((name) => name.startsWith('--')).length,
        screenshotCount: ${screenshots.length},
      };
    })()`,
    );
    writeFileSync(
      join(artifactDir, 'report.json'),
      JSON.stringify({ phase, screenshots, ...report }, null, 2),
    );
    process.stdout.write(`${JSON.stringify({ artifactDir, ...report }, null, 2)}\n`);
  } finally {
    cdp?.close();
    edge.kill('SIGTERM');
    vite.kill('SIGTERM');
    await delay(300);
    rmSync(profileDir, { recursive: true, force: true });
  }
}

await main();
