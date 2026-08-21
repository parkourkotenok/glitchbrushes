import { spawn, spawnSync } from 'node:child_process';
import { mkdirSync, mkdtempSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join, resolve } from 'node:path';

const appUrl = process.env.GLITCHBRUSHES_URL ?? 'http://127.0.0.1:4173/?perf=1&tool=glitch-brushes&controls=simple';
const outputDir = resolve('artifacts/interface-redesign');
const profile = mkdtempSync(join(tmpdir(), 'glitchbrushes-ui-'));
const port = 9343;
const delay = (ms) => new Promise((done) => setTimeout(done, ms));

class Rpc {
  constructor(url) {
    this.socket = new WebSocket(url);
    this.id = 0;
    this.pending = new Map();
  }
  async open() {
    await new Promise((accept, reject) => {
      this.socket.addEventListener('open', accept, { once: true });
      this.socket.addEventListener('error', reject, { once: true });
    });
    this.socket.addEventListener('message', (event) => {
      const message = JSON.parse(event.data);
      const pending = this.pending.get(message.id);
      if (!pending) return;
      this.pending.delete(message.id);
      message.error ? pending.reject(new Error(message.error.message)) : pending.resolve(message.result);
    });
  }
  send(method, params = {}) {
    const id = ++this.id;
    return new Promise((accept, reject) => {
      this.pending.set(id, { resolve: accept, reject });
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
      // The browser or lazy panel is still settling.
    }
    await delay(80);
  }
  throw new Error(`Timed out after ${timeout} ms.`);
}

async function stopBrowser(child) {
  if (child.exitCode !== null) return;
  child.kill();
  await Promise.race([new Promise((done) => child.once('exit', done)), delay(1500)]);
  if (child.exitCode === null && process.platform === 'win32') {
    spawnSync('taskkill', ['/PID', String(child.pid), '/T', '/F'], { stdio: 'ignore', windowsHide: true });
  }
}

mkdirSync(outputDir, { recursive: true });
const browser = spawn(
  'C:\\Program Files (x86)\\Microsoft\\Edge\\Application\\msedge.exe',
  [
    '--headless=new',
    `--remote-debugging-port=${port}`,
    `--user-data-dir=${profile}`,
    '--no-first-run',
    '--disable-features=msEdgeFirstRunExperience',
    appUrl,
  ],
  { stdio: 'ignore', windowsHide: true },
);

let rpc;
try {
  const target = await waitFor(async () => {
    const response = await fetch(`http://127.0.0.1:${port}/json`);
    const pages = await response.json();
    return pages.find((page) => page.type === 'page' && page.url.startsWith(appUrl.split('?')[0]));
  });
  rpc = new Rpc(target.webSocketDebuggerUrl);
  await rpc.open();
  await rpc.send('Runtime.enable');
  await rpc.send('Page.enable');
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
  const key = async (keyName, code = keyName) => {
    await rpc.send('Input.dispatchKeyEvent', { type: 'keyDown', key: keyName, code });
    await rpc.send('Input.dispatchKeyEvent', { type: 'keyUp', key: keyName, code });
    await delay(80);
  };
  const setViewport = async (width, height) => {
    await rpc.send('Emulation.setDeviceMetricsOverride', {
      width,
      height,
      deviceScaleFactor: 1,
      mobile: false,
    });
    await delay(200);
  };
  const load = async () => {
    await rpc.send('Page.navigate', { url: appUrl });
    await waitFor(() => evaluate(`document.readyState === 'complete' && document.querySelector('.work-canvas')?.width > 1`));
    await waitFor(() => evaluate(`document.querySelector('.topbar-file')?.textContent.includes('parkour-kotenok-road.jpg')`));
    await delay(450);
  };
  const capture = async (name) => {
    await evaluate(`(document.activeElement instanceof HTMLElement && document.activeElement.blur(), true)`);
    await rpc.send('Input.dispatchMouseEvent', { type: 'mouseMoved', x: 700, y: 110 });
    await delay(80);
    const shot = await rpc.send('Page.captureScreenshot', { format: 'png', fromSurface: true, captureBeyondViewport: false });
    writeFileSync(join(outputDir, `${name}.png`), Buffer.from(shot.data, 'base64'));
  };
  const layout = async () =>
    evaluate(`(() => {
      const inspector = document.querySelector('.inspector-scroll');
      const layers = document.querySelector('.layers-dock');
      const popovers = [...document.querySelectorAll('.image-brush-popover,.compact-menu-popover,.effect-picker-menu')];
      return {
        viewport: [innerWidth, innerHeight],
        documentOverflowX: document.documentElement.scrollWidth > document.documentElement.clientWidth,
        inspectorOverflowX: inspector ? inspector.scrollWidth > inspector.clientWidth + 1 : null,
        popoverOverflow: popovers.some((node) => { const r=node.getBoundingClientRect(); return r.left < 0 || r.right > innerWidth || r.top < 0 || r.bottom > innerHeight; }),
        inspectorHeight: inspector?.clientHeight ?? null,
        inspectorScrollHeight: inspector?.scrollHeight ?? null,
        layersTop: layers?.getBoundingClientRect().top ?? null,
      };
    })()`);

  const report = { screenshots: [], layouts: [], keyboard: {} };
  for (const [width, height] of [[1366, 768], [1440, 900], [1920, 1080]]) {
    await setViewport(width, height);
    await load();
    const effectName = `effect-${width}x${height}`;
    await capture(effectName);
    report.screenshots.push(`${effectName}.png`);
    report.layouts.push({ state: effectName, ...(await layout()) });

    await evaluate(`([...document.querySelectorAll('nav button')].find((button) => button.textContent.trim() === 'Image Brush')?.click(), true)`);
    await waitFor(() => evaluate(`document.querySelector('.image-brush-source-copy strong')?.textContent.trim() === 'Astronaut demo'`));
    await delay(300);
    const imageName = `image-brush-${width}x${height}`;
    await capture(imageName);
    report.screenshots.push(`${imageName}.png`);
    report.layouts.push({ state: imageName, ...(await layout()) });
  }

  await setViewport(1440, 900);
  await load();
  await evaluate(`(document.querySelector('.effect-fine-tuning').open = true, document.querySelector('.effect-fine-tuning').scrollIntoView({block:'center'}), true)`);
  await delay(200);
  await capture('effect-fine-tuning-1440x900');
  report.screenshots.push('effect-fine-tuning-1440x900.png');

  await evaluate(`(document.querySelector('.inspector-scroll').scrollTop = 0, document.querySelector('.effect-picker-trigger').click(), true)`);
  await delay(200);
  await evaluate(`(document.querySelector('.effect-picker-options').scrollTop = 0, true)`);
  await capture('effect-picker-new-effects-1440x900');
  report.screenshots.push('effect-picker-new-effects-1440x900.png');
  await key('Escape');
  report.keyboard.effectPickerFocusReturned = await evaluate(`document.activeElement === document.querySelector('.effect-picker-trigger')`);

  await evaluate(`([...document.querySelectorAll('nav button')].find((button) => button.textContent.trim() === 'Image Brush')?.click(), true)`);
  await waitFor(() => evaluate(`document.querySelector('.image-brush-source-copy strong')?.textContent.trim() === 'Astronaut demo'`));
  await evaluate(`(document.querySelector('[id$="-tab-placement"]').focus(), true)`);
  await key('ArrowRight');
  report.keyboard.tabsArrowRight = await evaluate(`document.querySelector('[id$="-tab-evolution"]')?.getAttribute('aria-selected') === 'true'`);
  await capture('image-brush-evolution-1440x900');
  report.screenshots.push('image-brush-evolution-1440x900.png');

  await evaluate(`(document.querySelector('[id$="-tab-fx"]').click(), true)`);
  await delay(150);
  await capture('image-brush-fx-1440x900');
  report.screenshots.push('image-brush-fx-1440x900.png');

  await evaluate(`([...document.querySelectorAll('.interface-mode-options button')]
    .find((button) => button.textContent.trim() === 'Advanced')?.click(), true)`);
  await waitFor(() => evaluate(`document.querySelector('.app')?.dataset.interfaceMode === 'advanced'`));
  await evaluate(`(() => {
    const master = document.querySelector('.image-brush-master-advanced');
    master.open = true;
    master.dispatchEvent(new Event('toggle'));
    for (const details of master.querySelectorAll('.image-brush-advanced-group')) {
      details.open = true;
      details.dispatchEvent(new Event('toggle'));
    }
    master.scrollIntoView({block:'start'});
    return true;
  })()`);
  await delay(150);
  await capture('image-brush-advanced-1440x900');
  report.screenshots.push('image-brush-advanced-1440x900.png');

  await evaluate(`([...document.querySelectorAll('.interface-mode-options button')]
    .find((button) => button.textContent.trim() === 'Simple')?.click(), true)`);
  await waitFor(() => evaluate(`document.querySelector('.app')?.dataset.interfaceMode === 'simple'`));

  await evaluate(`(document.querySelector('.inspector-scroll').scrollTop = 0, document.querySelector('.image-brush-source-choose').click(), true)`);
  await delay(150);
  await capture('image-brush-source-picker-1440x900');
  report.screenshots.push('image-brush-source-picker-1440x900.png');
  report.layouts.push({ state: 'source-picker', ...(await layout()) });
  await key('Escape');
  report.keyboard.sourceFocusReturned = await evaluate(`document.activeElement === document.querySelector('.image-brush-source-choose')`);

  await evaluate(`(document.querySelector('button[aria-label="More randomize options"]').click(), true)`);
  await delay(150);
  await capture('image-brush-randomize-menu-1440x900');
  report.screenshots.push('image-brush-randomize-menu-1440x900.png');
  report.layouts.push({ state: 'randomize-menu', ...(await layout()) });
  await key('Escape');
  report.keyboard.randomizeFocusReturned = await evaluate(`document.activeElement === document.querySelector('button[aria-label="More randomize options"]')`);

  await evaluate(`(document.querySelector('button[aria-label="Style actions"]').click(), true)`);
  await delay(150);
  await capture('image-brush-style-menu-1440x900');
  report.screenshots.push('image-brush-style-menu-1440x900.png');
  report.layouts.push({ state: 'style-menu', ...(await layout()) });
  await key('Escape');
  report.keyboard.styleFocusReturned = await evaluate(`document.activeElement === document.querySelector('button[aria-label="Style actions"]')`);

  report.workflow = {};
  await evaluate(`(() => {
    window.__stylePromptQueue = ['UI Saved Style', 'UI Renamed Style'];
    window.prompt = () => window.__stylePromptQueue.shift() ?? null;
    window.confirm = () => true;
    window.__lastDownload = null;
    HTMLAnchorElement.prototype.click = function () { window.__lastDownload = this.href; };
    return true;
  })()`);
  await evaluate(`document.querySelector('button[aria-label="Style actions"]').click()`);
  await waitFor(() => evaluate(`Boolean(document.querySelector('.image-brush-style-menu'))`));
  report.workflow.styleActionsGrouped = await evaluate(`(() => {
    const text = document.querySelector('.image-brush-style-menu')?.textContent ?? '';
    return ['Save current as new style','Rename current style','Delete current style','Import style','Export style'].every((label) => text.includes(label));
  })()`);
  await evaluate(`([...document.querySelectorAll('.image-brush-style-menu button')].find((button) => button.textContent.includes('Save current'))?.click(), true)`);
  await waitFor(() => evaluate(`[...document.querySelectorAll('select[aria-label="Image Brush style"] option')].some((option) => option.textContent === 'UI Saved Style')`));
  await evaluate(`([...document.querySelectorAll('.image-brush-style-menu button')].find((button) => button.textContent.includes('Rename current'))?.click(), true)`);
  await waitFor(() => evaluate(`[...document.querySelectorAll('select[aria-label="Image Brush style"] option')].some((option) => option.textContent === 'UI Renamed Style')`));
  await evaluate(`(window.__lastDownload = null, [...document.querySelectorAll('.image-brush-style-menu button')].find((button) => button.textContent.includes('Export style'))?.click(), true)`);
  await waitFor(() => evaluate(`Boolean(window.__lastDownload)`));
  await evaluate(`(async () => { window.__styleJson = await fetch(window.__lastDownload).then((response) => response.text()); return true; })()`);
  await evaluate(`([...document.querySelectorAll('.image-brush-style-menu button')].find((button) => button.textContent.includes('Delete current'))?.click(), true)`);
  await waitFor(() => evaluate(`![...document.querySelectorAll('select[aria-label="Image Brush style"] option')].some((option) => option.textContent === 'UI Renamed Style')`));
  await evaluate(`(async () => {
    const input = document.querySelector('input[aria-label="Import Image Brush style"]');
    const transfer = new DataTransfer();
    transfer.items.add(new File([window.__styleJson], 'roundtrip.image-brush.json', {type:'application/json'}));
    Object.defineProperty(input, 'files', { configurable: true, value: transfer.files });
    input.dispatchEvent(new Event('change', { bubbles: true }));
    return true;
  })()`);
  await waitFor(() => evaluate(`[...document.querySelectorAll('select[aria-label="Image Brush style"] option')].some((option) => option.textContent === 'UI Renamed Style')`));
  report.workflow.styleRoundTrip = await evaluate(`(() => {
    const exported = JSON.parse(window.__styleJson);
    const stored = JSON.parse(localStorage.getItem('hex-redactor:image-brush-presets:v1') ?? '[]').find((item) => item.name === 'UI Renamed Style');
    return Boolean(stored) && JSON.stringify(stored.settings) === JSON.stringify(exported.settings) && JSON.stringify(stored.rack) === JSON.stringify(exported.rack);
  })()`);
  if (await evaluate(`Boolean(document.querySelector('.image-brush-style-menu'))`)) await key('Escape');

  await evaluate(`document.querySelector('button[aria-label="Source image actions"]').click()`);
  await waitFor(() => evaluate(`Boolean(document.querySelector('[aria-label="Source image actions"][role="dialog"]'))`));
  await evaluate(`([...document.querySelectorAll('[aria-label="Source image actions"] button')].find((button) => button.textContent.includes('Duplicate image'))?.click(), true)`);
  await waitFor(() => evaluate(`document.querySelector('.image-brush-source-section > header span')?.textContent.trim() === '2 images'`));
  await evaluate(`([...document.querySelectorAll('[aria-label="Source image actions"] button')].find((button) => button.textContent.includes('Remove image'))?.click(), true)`);
  await waitFor(() => evaluate(`document.querySelector('.image-brush-source-section > header span')?.textContent.trim() === '1 image'`));
  report.workflow.assetDuplicateRemove = true;

  await evaluate(`document.querySelector('button[aria-label="More randomize options"]').click()`);
  await waitFor(() => evaluate(`Boolean(document.querySelector('[aria-label="Randomize brush"][role="dialog"]'))`));
  await evaluate(`(() => { const input=[...document.querySelectorAll('.image-brush-randomize-menu label')].find((label) => label.textContent.includes('Lock recipe'))?.querySelector('input'); if (input && !input.checked) input.click(); return Boolean(input); })()`);
  await key('Escape');
  const brushSnapshot = `(() => ({
    values: [...document.querySelectorAll('.image-brush-lab input:not([type="file"]),.image-brush-lab select')].map((entry) => entry.type === 'checkbox' ? entry.checked : entry.value),
    essentials: [...document.querySelectorAll('.image-brush-essential input')].map((entry) => entry.value),
    orientation: [...document.querySelectorAll('.image-brush-orientation-control button')].find((button) => button.getAttribute('aria-pressed') === 'true')?.textContent.trim()
  }))()`;
  const beforeRandomize = await evaluate(brushSnapshot);
  await evaluate(`document.querySelector('.image-brush-randomize-main').click()`);
  await delay(250);
  const firstRandomize = await evaluate(brushSnapshot);
  await evaluate(`document.querySelector('.image-brush-randomize-main').click()`);
  await delay(250);
  const secondRandomize = await evaluate(brushSnapshot);
  report.workflow.lockedRandomizeDeterministic = JSON.stringify(firstRandomize.values) === JSON.stringify(secondRandomize.values);
  report.workflow.balancedRandomizePreservesEssentials =
    JSON.stringify(beforeRandomize.essentials) === JSON.stringify(firstRandomize.essentials) &&
    beforeRandomize.orientation === firstRandomize.orientation;

  await evaluate(`(window.__lastDownload = null, [...document.querySelectorAll('button')].find((button) => button.textContent.trim() === 'Export')?.click(), true)`);
  await waitFor(() => evaluate(`Boolean([...document.querySelectorAll('button')].find((button) => button.textContent.includes('Project import / export')))`));
  await evaluate(`([...document.querySelectorAll('button')].find((button) => button.textContent.includes('Project import / export'))?.click(), true)`);
  await waitFor(() => evaluate(`Boolean([...document.querySelectorAll('button')].find((button) => button.textContent.includes('Export project')))`));
  await evaluate(`([...document.querySelectorAll('button')].find((button) => button.textContent.includes('Export project'))?.click(), true)`);
  await waitFor(() => evaluate(`Boolean(window.__lastDownload)`));
  await evaluate(`(async () => { window.__projectJson = await fetch(window.__lastDownload).then((response) => response.text()); return true; })()`);
  const importProjectJson = async (expression) => {
    await evaluate(`(async () => {
      const projectText = ${expression};
      const input = document.querySelector('.project-panel input[type="file"]');
      const transfer = new DataTransfer();
      transfer.items.add(new File([projectText], 'roundtrip.glitch-brush.json', {type:'application/json'}));
      Object.defineProperty(input, 'files', { configurable: true, value: transfer.files });
      input.dispatchEvent(new Event('change', { bubbles: true }));
      return true;
    })()`);
    await waitFor(() => evaluate(`document.querySelector('.status-message')?.textContent.includes('Project imported')`));
  };
  await importProjectJson('window.__projectJson');
  report.workflow.projectV3RoundTrip = await evaluate(`JSON.parse(window.__projectJson).version === 3 && Boolean(JSON.parse(window.__projectJson).imageBrush)`);
  await importProjectJson(`(() => { const project=JSON.parse(window.__projectJson); project.version=2; if (project.imageBrush) project.imageBrush.version=1; return JSON.stringify(project); })()`);
  report.workflow.legacyProjectImport = true;

  await key('Escape');
  await evaluate(`document.querySelector('[id$="-tab-evolution"]')?.click()`);
  await waitFor(() => evaluate(`document.querySelector('[id$="-tab-evolution"]')?.getAttribute('aria-selected') === 'true'`));
  await rpc.send('Page.reload', { ignoreCache: false });
  await waitFor(() => evaluate(`document.readyState === 'complete' && document.querySelector('.work-canvas')?.width > 1`));
  await evaluate(`([...document.querySelectorAll('nav button')].find((button) => button.textContent.trim() === 'Image Brush')?.click(), true)`);
  await waitFor(() => evaluate(`Boolean(document.querySelector('[id$="-tab-evolution"]'))`));
  report.workflow.tabReloadPersistence = await evaluate(`document.querySelector('[id$="-tab-evolution"]')?.getAttribute('aria-selected') === 'true'`);

  report.ok =
    report.layouts.every((entry) => !entry.documentOverflowX && !entry.inspectorOverflowX && !entry.popoverOverflow) &&
    Object.values(report.keyboard).every(Boolean) &&
    Object.values(report.workflow).every(Boolean);
  writeFileSync(join(outputDir, 'acceptance.json'), `${JSON.stringify(report, null, 2)}\n`);
  console.log(JSON.stringify(report, null, 2));
  if (!report.ok) process.exitCode = 1;
} finally {
  rpc?.close();
  await stopBrowser(browser);
  const resolvedProfile = resolve(profile);
  const resolvedTemp = resolve(tmpdir());
  if (resolvedProfile.startsWith(`${resolvedTemp}\\`)) rmSync(resolvedProfile, { recursive: true, force: true });
}
