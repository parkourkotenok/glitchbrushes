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
const measuredStrokes = Math.max(
  1,
  Number.parseInt(
    process.argv.find((arg) => arg.startsWith('--strokes='))?.split('=')[1] ?? '20',
    10,
  ) || 20,
);
const historyCycles = Math.max(
  1,
  Number.parseInt(
    process.argv.find((arg) => arg.startsWith('--history-cycles='))?.split('=')[1] ?? '1',
    10,
  ) || 1,
);
const warmupStrokes = Math.max(
  1,
  Number.parseInt(
    process.argv.find((arg) => arg.startsWith('--warmups='))?.split('=')[1] ?? '5',
    10,
  ) || 5,
);
const imageFxId = process.argv.find((arg) => arg.startsWith('--image-fx='))?.split('=')[1] ?? '';
const retouchTool = process.argv.find((arg) => arg.startsWith('--retouch='))?.split('=')[1] ?? '';
const moshEffectId = process.argv.find((arg) => arg.startsWith('--mosh-effect='))?.split('=')[1] ?? '';
const moshEffectIds = (
  process.argv.find((arg) => arg.startsWith('--mosh-effects='))?.split('=')[1] ?? moshEffectId
)
  .split(',')
  .map((value) => value.trim())
  .filter(Boolean);
const moshApplies = Math.max(
  1,
  Number.parseInt(
    process.argv.find((arg) => arg.startsWith('--mosh-applies='))?.split('=')[1] ?? '10',
    10,
  ) || 10,
);
const uiAcceptance = process.argv.includes('--ui-acceptance');
const layersAcceptance = process.argv.includes('--layers-acceptance');
const startupOnly = process.argv.includes('--startup');
const headed = process.argv.includes('--headed');
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
  return {
    count: sorted.length,
    p50: at(0.5),
    p95: at(0.95),
    p99: at(0.99),
    max: sorted.at(-1) ?? 0,
  };
}

const performanceSnapshot = (evaluate) =>
  evaluate(`window.__GLITCH_PERF__?.snapshot() ?? null`);

async function resetPerformance(evaluate) {
  const reset = await evaluate(`(async () => {
    window.__GLITCH_PERF__?.reset();
    await new Promise((resolve) => requestAnimationFrame(() => requestAnimationFrame(resolve)));
    return Boolean(window.__GLITCH_PERF__);
  })()`);
  if (!reset) throw new Error('The ?perf=1 diagnostics API is unavailable.');
}

async function exerciseMosh(evaluate, capabilities) {
  const opened = await evaluate(`(() => {
    const button = [...document.querySelectorAll('nav button')].find((entry) => entry.textContent.trim() === 'Mosh');
    button?.click();
    return Boolean(button);
  })()`);
  if (!opened) throw new Error('Could not open Mosh Lab.');
  await waitFor(() => evaluate(`Boolean(document.querySelector('.mosh-lab'))`));
  const moshNames = {
    'pixel-sort': 'Pixel Sorter',
    feedback: 'Feedback Echo',
    'motion-field': 'Motion Field Mosh',
    'motion-transfer': 'Motion Transfer',
    'chroma-drift': 'Luma / Chroma Drift',
    'dct-damage': 'DCT Block Damage',
    'jpeg-resample': 'JPEG Resample',
    'edge-melt': 'Edge Melt',
    'flow-field': 'Flow Field Displace',
  };
  const advancedOpened = await evaluate(`(() => {
    const button = [...document.querySelectorAll('.interface-mode-options button')]
      .find((entry) => entry.textContent.trim() === 'Advanced');
    button?.click();
    return Boolean(button);
  })()`);
  if (!advancedOpened) throw new Error('Could not switch MOSH controls to Advanced.');
  await waitFor(() =>
    evaluate(`Boolean(document.querySelector('.mosh-card .mosh-card-actions button'))`),
  );
  while (await evaluate(`document.querySelectorAll('.mosh-card').length > 0`)) {
    const beforeCards = await evaluate(`document.querySelectorAll('.mosh-card').length`);
    const removed = await evaluate(`(() => {
      const card = document.querySelector('.mosh-card');
      const button = card && [...card.querySelectorAll('.mosh-card-actions button')]
        .find((entry) => entry.textContent.includes('Remove'));
      button?.click();
      return Boolean(button);
    })()`);
    if (!removed) throw new Error('Could not clear the default MOSH rack.');
    await waitFor(() => evaluate(`document.querySelectorAll('.mosh-card').length < ${beforeCards}`));
  }
  await evaluate(`(() => {
    const button = [...document.querySelectorAll('.interface-mode-options button')]
      .find((entry) => entry.textContent.trim() === 'Simple');
    button?.click();
    return Boolean(button);
  })()`);
  for (const effectId of moshEffectIds) {
    const name = moshNames[effectId];
    if (!name) throw new Error(`Unknown MOSH effect id: ${effectId}`);
    const beforeCards = await evaluate(`document.querySelectorAll('.mosh-card').length`);
    await evaluate(`(() => {
      const button = [...document.querySelectorAll('.mosh-rack-toolbar button')]
        .find((entry) => entry.textContent.includes('Add Effect'));
      button?.click();
      return Boolean(button);
    })()`);
    await waitFor(() =>
      evaluate(`document.querySelectorAll('.mosh-add-menu [role="option"]').length > 0`),
    );
    const added = await evaluate(`(() => {
      const option = [...document.querySelectorAll('.mosh-add-menu [role="option"]')]
        .find((entry) => entry.getAttribute('aria-label')?.includes(${JSON.stringify(`${name}.`)}));
      option?.click();
      return Boolean(option);
    })()`);
    if (!added) throw new Error(`Could not add MOSH effect: ${effectId}`);
    await waitFor(() =>
      evaluate(`document.querySelectorAll('.mosh-card').length > ${beforeCards}`),
    );
  }

  const historyCount = () => evaluate(`(() => {
    const history = [...document.querySelectorAll('.status-data span')]
      .find((entry) => entry.textContent.trim().startsWith('HISTORY'));
    return Number.parseInt(history?.querySelector('strong')?.textContent ?? '-1', 10);
  })()`);
  const beforeHistory = await historyCount();
  await resetPerformance(evaluate);
  const before = await performanceSnapshot(evaluate);
  const previewOpened = await evaluate(`(() => {
    const button = [...document.querySelectorAll('.mosh-rack-toolbar button')]
      .find((entry) => entry.textContent.trim() === 'Preview');
    button?.click();
    return Boolean(button);
  })()`);
  if (!previewOpened) throw new Error('MOSH Preview control was not found.');
  await waitFor(() =>
    evaluate(`document.querySelector('.status-message')?.textContent.includes('preview ready')`),
    60000,
  );
  const cancelled = await evaluate(`(() => {
    const button = [...document.querySelectorAll('.mosh-rack-toolbar button')]
      .find((entry) => entry.textContent.includes('Cancel') && !entry.disabled);
    button?.click();
    return Boolean(button);
  })()`);
  if (!cancelled) throw new Error('MOSH preview Cancel was not available.');
  await waitFor(() => evaluate(`document.querySelector('.status-message')?.textContent.includes('preview cancelled')`));
  const cancelKeptHistory = (await historyCount()) === beforeHistory;
  await evaluate(`(() => {
    const button = [...document.querySelectorAll('.mosh-rack-toolbar button')]
      .find((entry) => entry.textContent.trim() === 'Preview');
    if (button?.classList.contains('active')) button.click();
    return Boolean(button);
  })()`);
  await waitFor(() =>
    evaluate(`!document.querySelector('.mosh-rack-toolbar button.active')?.textContent.includes('Preview')`),
  );

  const applyDurations = [];
  let noChangeApplies = 0;
  for (let index = 0; index < moshApplies; index += 1) {
    const fullSyncBeforeApply =
      (await performanceSnapshot(evaluate)).counts['glitchbrushes:canvas-full-sync'] ?? 0;
    const startedAt = performance.now();
    const clicked = await evaluate(`(() => {
      const button = [...document.querySelectorAll('.mosh-rack-toolbar button')]
        .find((entry) => entry.textContent.trim() === 'Apply' && !entry.disabled);
      button?.click();
      return Boolean(button);
    })()`);
    if (!clicked) throw new Error(`MOSH Apply ${index + 1} was not available.`);
    await delay(20);
    try {
      await waitFor(async () => {
        const metrics = await performanceSnapshot(evaluate);
        const fullSyncReady =
          (metrics.counts['glitchbrushes:canvas-full-sync'] ?? 0) > fullSyncBeforeApply;
        const applyReady = await evaluate(`(() => {
          const button = [...document.querySelectorAll('.mosh-rack-toolbar button')]
            .find((entry) => entry.textContent.trim() === 'Apply');
          return Boolean(button && !button.disabled);
        })()`);
        const applied = await evaluate(
          `document.querySelector('.status-message')?.textContent.includes('applied atomically')`,
        );
        const noChange = await evaluate(
          `document.querySelector('.status-message')?.textContent.includes('completed without changing pixels')`,
        );
        return applyReady && ((fullSyncReady && applied) || noChange);
      }, 60000);
    } catch {
      const state = await evaluate(`({
        history: [...document.querySelectorAll('.status-data span')].find((entry) => entry.textContent.trim().startsWith('HISTORY'))?.textContent.trim(),
        notice: document.querySelector('.status-message')?.textContent.trim(),
        progress: document.querySelector('.mosh-progress')?.textContent.trim(),
        cards: [...document.querySelectorAll('.mosh-card')].map((entry) => entry.querySelector('strong')?.textContent.trim()),
        applyDisabled: [...document.querySelectorAll('.mosh-rack-toolbar button')].find((entry) => entry.textContent.trim() === 'Apply')?.disabled
      })`);
      throw new Error(`MOSH Apply ${index + 1} did not commit: ${JSON.stringify(state)}`);
    }
    const noChange = await evaluate(
      `document.querySelector('.status-message')?.textContent.includes('completed without changing pixels')`,
    );
    if (noChange) noChangeApplies += 1;
    applyDurations.push(performance.now() - startedAt);
  }
  const after = await performanceSnapshot(evaluate);
  const delta = (name) => (after.counts[name] ?? 0) - (before.counts[name] ?? 0);
  const scenarioRafGaps = after.rafGaps;
  return {
    browser: capabilities,
    effects: moshEffectIds,
    applies: moshApplies,
    changedApplies: moshApplies - noChangeApplies,
    noChangeApplies,
    previewCancelKeptHistory: cancelKeptHistory,
    historyDelta: (await historyCount()) - beforeHistory,
    canvasFullSyncDelta: delta('glitchbrushes:canvas-full-sync'),
    fitToScreenDelta: delta('glitchbrushes:fit-to-screen'),
    applyLatency: summarize(applyDurations),
    rafGaps: summarize(scenarioRafGaps),
    rafGapsOver50ms: scenarioRafGaps.filter((gap) => gap >= 50).length,
  };
}

async function exerciseUi(evaluate, stroke, capabilities) {
  const openEffects = async () => {
    await evaluate(`document.querySelector('.effect-picker-trigger')?.click()`);
    await waitFor(() =>
      evaluate(`document.querySelectorAll('.compact-effect-picker-menu [role="option"]').length > 0`),
    );
  };
  await openEffects();
  const effectAudit = await evaluate(`(() => {
    const options = [...document.querySelectorAll('.compact-effect-picker-menu [role="option"]')];
    const labels = options.map((entry) => entry.getAttribute('aria-label'));
    const experimental = [...document.querySelectorAll('.compact-icon-browser-group[aria-label="NEW / EXPERIMENTAL"] [role="option"]')]
      .map((entry) => entry.getAttribute('aria-label'));
    return {
      labels,
      experimental,
      tooltipCount: document.querySelectorAll('.compact-effect-picker-menu [role="tooltip"]').length,
      legacyInitiallyCollapsed: !document.querySelector('.compact-icon-browser-group[aria-label="LEGACY EFFECTS"] .compact-icon-browser-grid'),
      halftoneAbsent: !labels.some((label) => label?.includes('Halftone Collapse')),
      experimentalUnique: experimental.every((label) => labels.filter((entry) => entry === label).length === 1),
    };
  })()`);
  const previewFocus = await evaluate(`(() => {
    const jpeg = [...document.querySelectorAll('.compact-effect-picker-menu [role="option"]')]
      .find((entry) => entry.getAttribute('aria-label')?.includes('JPEG Resample.'));
    jpeg?.focus();
    return document.activeElement?.getAttribute('aria-label');
  })()`);
  await waitFor(() =>
    evaluate(`[...document.querySelectorAll('.shared-effect-preview img')].some((entry) => entry.src.includes('jpeg-resample-brush'))`),
  );
  const previewAndKeyboard = await evaluate(`(() => {
    const before = document.activeElement?.getAttribute('aria-label');
    document.activeElement?.dispatchEvent(new KeyboardEvent('keydown', { key: 'ArrowRight', bubbles: true }));
    const after = document.activeElement?.getAttribute('aria-label');
    return { previewFocus: ${JSON.stringify(previewFocus)}, before, after, moved: before !== after };
  })()`);
  await evaluate(`document.activeElement?.dispatchEvent(new KeyboardEvent('keydown', { key: 'Escape', bubbles: true }))`);
  await waitFor(() => evaluate(`!document.querySelector('.compact-effect-picker-menu')`));

  const selectedExperimental = [];
  for (const name of ['Mirror Fold', 'Raster Loom', 'Contour Crawl', 'JPEG Resample']) {
    await openEffects();
    const selected = await evaluate(`(() => {
      const option = [...document.querySelectorAll('.compact-effect-picker-menu [role="option"]')]
        .find((entry) => entry.getAttribute('aria-label')?.includes(${JSON.stringify(`${name}.`)}));
      option?.click();
      return Boolean(option);
    })()`);
    if (!selected) throw new Error(`Could not select NEW effect: ${name}`);
    await waitFor(() =>
      evaluate(`document.querySelector('.effect-picker-trigger')?.textContent.includes(${JSON.stringify(name)})`),
    );
    selectedExperimental.push(name);
  }

  await evaluate(`([...document.querySelectorAll('nav button')].find((entry) => entry.textContent.trim() === 'Mosh'))?.click()`);
  await waitFor(() => evaluate(`Boolean(document.querySelector('.mosh-lab'))`));
  await evaluate(`([...document.querySelectorAll('.mosh-rack-toolbar button')].find((entry) => entry.textContent.includes('Add Effect')))?.click()`);
  await waitFor(() => evaluate(`Boolean(document.querySelector('.mosh-add-menu .compact-icon-browser'))`));
  const moshAudit = await evaluate(`(() => {
    const jpeg = [...document.querySelectorAll('.mosh-add-menu [role="option"]')]
      .find((entry) => entry.getAttribute('aria-label')?.includes('JPEG Resample.'));
    return { sameBrowser: Boolean(document.querySelector('.mosh-add-menu .compact-icon-browser')), jpegLabel: jpeg?.getAttribute('aria-label') };
  })()`);
  await evaluate(`document.querySelector('.mosh-add-menu [role="listbox"]')?.dispatchEvent(new KeyboardEvent('keydown', { key: 'Escape', bubbles: true }))`);
  await waitFor(() => evaluate(`!document.querySelector('.mosh-add-menu')`));

  await evaluate(`([...document.querySelectorAll('nav button')].find((entry) => entry.textContent.trim() === 'Image Brush'))?.click()`);
  await waitFor(() => evaluate(`Boolean(document.querySelector('.image-brush-lab'))`));
  await evaluate(`document.querySelector('.image-brush-style-browser-trigger')?.click()`);
  await waitFor(() => evaluate(`Boolean(document.querySelector('.image-brush-style-browser .compact-icon-browser'))`));
  const styleAudit = await evaluate(`(() => {
    const browser = document.querySelector('.image-brush-style-browser');
    const options = [...browser.querySelectorAll('[role="option"]')];
    const next = options.find((entry) => entry.getAttribute('aria-selected') !== 'true' && !entry.disabled);
    const name = next?.querySelector('[role="tooltip"] strong')?.textContent;
    next?.click();
    return { noPreviewImages: browser.querySelectorAll('img, canvas').length === 0, optionCount: options.length, selectedName: name };
  })()`);
  await waitFor(() => evaluate(`!document.querySelector('.image-brush-style-browser')`));

  await waitFor(() =>
    evaluate(`Number(document.querySelector('.controls-layers-splitter')?.getAttribute('aria-valuenow')) > 0`),
  );
  const splitterBefore = await evaluate(`Number(document.querySelector('.controls-layers-splitter')?.getAttribute('aria-valuenow'))`);
  const splitterRect = await evaluate(`(() => { const rect = document.querySelector('.controls-layers-splitter').getBoundingClientRect(); return { x: rect.x, y: rect.y, width: rect.width, height: rect.height }; })()`);
  await stroke(
    { x: splitterRect.x + splitterRect.width / 2, y: splitterRect.y + splitterRect.height / 2 },
    { x: splitterRect.x + splitterRect.width / 2, y: splitterRect.y - 52 },
  );
  await waitFor(() =>
    evaluate(`Number(document.querySelector('.controls-layers-splitter')?.getAttribute('aria-valuenow')) !== ${splitterBefore}`),
  );
  const draggedHeight = await evaluate(`Number(document.querySelector('.controls-layers-splitter')?.getAttribute('aria-valuenow'))`);
  const persistedHeight = await evaluate(`Number(localStorage.getItem('glitch-brushes.controls-pane-height.v1'))`);
  await evaluate(`location.reload()`);
  await waitFor(() => evaluate(`document.readyState === 'complete' && Boolean(document.querySelector('.controls-layers-splitter'))`));
  await waitFor(() =>
    evaluate(`Number(document.querySelector('.controls-layers-splitter')?.getAttribute('aria-valuenow')) === ${persistedHeight}`),
  );
  const reloadedHeight = await evaluate(`Number(document.querySelector('.controls-layers-splitter')?.getAttribute('aria-valuenow'))`);
  const resized = await evaluate(`(async () => {
    const pane = document.querySelector('.controls-layers-pane');
    pane.style.height = '360px';
    pane.style.minHeight = '360px';
    pane.style.maxHeight = '360px';
    await new Promise((resolve) => setTimeout(resolve, 100));
    return {
      clientHeight: pane.clientHeight,
      controlsHeight: Number(document.querySelector('.controls-layers-splitter')?.getAttribute('aria-valuenow')),
    };
  })()`);
  await evaluate(`(() => {
    const pane = document.querySelector('.controls-layers-pane');
    pane.style.height = '';
    pane.style.minHeight = '';
    pane.style.maxHeight = '';
  })()`);
  await evaluate(`document.querySelector('.controls-layers-splitter')?.dispatchEvent(new MouseEvent('dblclick', { bubbles: true }))`);
  await waitFor(() => evaluate(`Number(localStorage.getItem('glitch-brushes.controls-pane-height.v1')) !== ${persistedHeight}`));
  const resetHeight = await evaluate(`Number(document.querySelector('.controls-layers-splitter')?.getAttribute('aria-valuenow'))`);

  return {
    browser: capabilities,
    effectAudit,
    previewAndKeyboard,
    selectedExperimental,
    moshAudit,
    styleAudit,
    splitter: {
      before: splitterBefore,
      dragged: draggedHeight,
      persisted: persistedHeight,
      reloaded: reloadedHeight,
      resizeClientHeight: resized.clientHeight,
      resizeClamped: resized.controlsHeight,
      reset: resetHeight,
    },
  };
}

async function exerciseLayers(evaluate, capabilities) {
  const layerVersion = () =>
    evaluate(
      `Number(document.querySelector('.layer-stack')?.getAttribute('data-layer-version') ?? -1)`,
    );
  const runVersionedAction = async (expression) => {
    const beforeVersion = await layerVersion();
    const startedAt = performance.now();
    const clicked = await evaluate(expression);
    if (!clicked) throw new Error(`Layer action was unavailable: ${expression}`);
    await waitFor(async () => (await layerVersion()) > beforeVersion, 15000);
    return performance.now() - startedAt;
  };

  // Let the editor's initial fit/layout effects settle before isolating layer actions.
  await delay(500);
  await resetPerformance(evaluate);
  const heapBefore = await evaluate(`performance.memory?.usedJSHeapSize ?? null`);
  const duplicate = [];
  for (let index = 0; index < 29; index += 1) {
    duplicate.push(
      await runVersionedAction(`(() => {
        const button = document.querySelector('button[aria-label="Duplicate layer"]');
        button?.click();
        return Boolean(button && !button.disabled);
      })()`),
    );
  }
  const layerCount = await evaluate(`document.querySelectorAll('.layer-stack-row:not(.original-layer)').length`);

  const selection = [];
  for (let index = 0; index < 20; index += 1) {
    selection.push(
      await runVersionedAction(`(() => {
        const buttons = [...document.querySelectorAll('.layer-stack-row:not(.original-layer) .layer-select-button')];
        const button = buttons[${index} % buttons.length];
        button?.click();
        return Boolean(button);
      })()`),
    );
  }

  const visibility = [];
  for (let index = 0; index < 20; index += 1) {
    visibility.push(
      await runVersionedAction(`(() => {
        const buttons = [...document.querySelectorAll('.layer-stack-row:not(.original-layer) .layer-visibility')];
        const button = buttons[${index} % buttons.length];
        button?.click();
        return Boolean(button);
      })()`),
    );
  }

  const reorder = [];
  for (let index = 0; index < 20; index += 1) {
    reorder.push(
      await runVersionedAction(`(() => {
        const button = document.querySelector('button[aria-label="${index % 2 === 0 ? 'Move layer down' : 'Move layer up'}"]');
        button?.click();
        return Boolean(button && !button.disabled);
      })()`),
    );
  }

  const opacity = [];
  for (let index = 0; index < 20; index += 1) {
    opacity.push(
      await runVersionedAction(`(async () => {
        const input = document.querySelector('input[aria-label="Layer opacity"]');
        if (!input || input.disabled) return false;
        Object.getOwnPropertyDescriptor(HTMLInputElement.prototype, 'value').set.call(input, ${index % 2 === 0 ? 80 : 100});
        input.dispatchEvent(new Event('input', { bubbles: true }));
        input.dispatchEvent(new Event('change', { bubbles: true }));
        await new Promise((resolve) => requestAnimationFrame(resolve));
        input.dispatchEvent(new PointerEvent('pointerup', { bubbles: true }));
        return true;
      })()`),
    );
  }

  const allLayers = [];
  for (let index = 0; index < 20; index += 1) {
    const before = await evaluate(`document.querySelector('.layers-sample-all')?.getAttribute('aria-pressed')`);
    const startedAt = performance.now();
    await evaluate(`document.querySelector('.layers-sample-all')?.click()`);
    await waitFor(
      () =>
        evaluate(`document.querySelector('.layers-sample-all')?.getAttribute('aria-pressed')`) .then(
          (value) => value !== before,
        ),
      10000,
    );
    allLayers.push(performance.now() - startedAt);
  }

  await delay(500);
  const metrics = await performanceSnapshot(evaluate);
  const heapAfter = await evaluate(`performance.memory?.usedJSHeapSize ?? null`);
  return {
    browser: capabilities,
    scenario: 'layers-30',
    layerCount,
    operations: {
      duplicate: summarize(duplicate),
      selection: summarize(selection),
      visibility: summarize(visibility),
      reorder: summarize(reorder),
      opacity: summarize(opacity),
      allLayers: summarize(allLayers),
    },
    reactCommits: metrics.summaries['glitchbrushes:react-post-commit'] ?? null,
    fullCanvasSync: metrics.counts['glitchbrushes:canvas-full-sync'] ?? 0,
    fitToScreen: metrics.counts['glitchbrushes:fit-to-screen'] ?? 0,
    longTasks: metrics.summaries['glitchbrushes:long-main-task'] ?? null,
    raf: metrics.raf,
    heap:
      heapBefore === null || heapAfter === null
        ? { supported: false }
        : { supported: true, before: heapBefore, after: heapAfter, delta: heapAfter - heapBefore },
  };
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
  if (startupOnly) {
    await delay(350);
    const metrics = await performanceSnapshot(evaluate);
    const navigation = await evaluate(
      `performance.getEntriesByType('navigation')[0]?.toJSON() ?? null`,
    );
    return {
      browser: capabilities,
      scenario: 'cold-start',
      document: await evaluate(`document.querySelector('.topbar-file')?.textContent.trim() ?? ''`),
      navigation: navigation
        ? {
            domContentLoaded: navigation.domContentLoadedEventEnd,
            load: navigation.loadEventEnd,
            responseEnd: navigation.responseEnd,
          }
        : null,
      adoption: metrics.summaries['glitchbrushes:document-adoption'] ?? null,
      decodeRoundTrip: metrics.summaries['glitchbrushes:document-decode-roundtrip'] ?? null,
      initialCompose: metrics.summaries['glitchbrushes:document-initial-compose'] ?? null,
      moduleReady: metrics.summaries['glitchbrushes:app-module-ready'] ?? null,
      firstPaint: metrics.summaries['glitchbrushes:react-first-paint'] ?? null,
      longTasks: metrics.summaries['glitchbrushes:long-main-task'] ?? null,
      longTaskEvents: metrics.events
        .filter((entry) => entry.name === 'glitchbrushes:long-main-task')
        .map((entry) => ({ at: entry.at, duration: entry.duration, metadata: entry.metadata })),
      measuredStartupWork: Object.fromEntries(
        Object.entries(metrics.summaries).filter(([name]) => name !== 'glitchbrushes:raf-gap'),
      ),
      raf: metrics.raf,
    };
  }
  if (layersAcceptance) return exerciseLayers(evaluate, capabilities);
  if (uiAcceptance) return exerciseUi(evaluate, stroke, capabilities);
  if (moshEffectIds.length) return exerciseMosh(evaluate, capabilities);
  if (retouchTool) {
    const openedRetouch = await evaluate(`(() => {
      const button = [...document.querySelectorAll('nav button')]
        .find((entry) => entry.textContent.trim() === 'Retouch');
      button?.click();
      return Boolean(button);
    })()`);
    if (!openedRetouch) throw new Error('Could not open Retouch.');
    await waitFor(() => evaluate(`Boolean(document.querySelector('.retouch-panel'))`));
    const selectedRetouch = await evaluate(`(() => {
      const button = [...document.querySelectorAll('.retouch-tool-switcher button')]
        .find((entry) => entry.textContent.trim().toLowerCase() === ${JSON.stringify(retouchTool.toLowerCase())});
      button?.click();
      return Boolean(button);
    })()`);
    if (!selectedRetouch) throw new Error(`Could not select Retouch tool: ${retouchTool}`);
    await waitFor(() =>
      evaluate(`document.querySelector('.retouch-panel')?.getAttribute('data-retouch-tool') === ${JSON.stringify(retouchTool)}`),
    );
  } else if (imageFxId) {
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
      evaluate(`document.querySelectorAll('.compact-effect-picker-menu [role="option"]').length > 0`),
    );
    const selected = await evaluate(`(() => {
    const option = [...document.querySelectorAll('.compact-effect-picker-menu [role="option"]')]
      .find((button) => button.getAttribute('aria-label')?.includes(${JSON.stringify(`${effectName}.`)}));
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
    `(() => {
      const r = document.querySelector('.work-canvas').getBoundingClientRect();
      const left = Math.max(0, r.left);
      const top = Math.max(0, r.top);
      const right = Math.min(innerWidth - 1, r.right);
      const bottom = Math.min(innerHeight - 1, r.bottom);
      return { x: left, y: top, width: Math.max(1, right - left), height: Math.max(1, bottom - top) };
    })()`,
  );
  const warmupStart = { x: canvas.x + canvas.width * 0.18, y: canvas.y + canvas.height * 0.55 };
  for (let index = 0; index < warmupStrokes; index += 1) {
    const uploadMetric = imageFxId
      ? 'glitchbrushes:image-brush-canvas-upload'
      : 'glitchbrushes:canvas-dirty-upload';
    const beforeWarmup = (await performanceSnapshot(evaluate)).counts[uploadMetric] ?? 0;
    await stroke(
      { ...warmupStart, y: warmupStart.y + index * 4 },
      { x: warmupStart.x + canvas.width * 0.09, y: warmupStart.y + index * 4 + 6 },
    );
    await waitFor(async () => {
      const metrics = await performanceSnapshot(evaluate);
      return (metrics.counts[uploadMetric] ?? 0) > beforeWarmup;
    }, imageFxId ? 60000 : 10000);
  }
  await delay(1000);
  await resetPerformance(evaluate);
  const before = await performanceSnapshot(evaluate);
  const heapBefore = await evaluate(`performance.memory?.usedJSHeapSize ?? null`);
  const heapCheckpoints = [{ stroke: 0, heap: heapBefore }];
  const zoomBefore = await evaluate(`document.querySelector('.zoom-readout')?.textContent ?? ''`);
  for (let index = 0; index < measuredStrokes; index += 1) {
    const uploadMetric = imageFxId
      ? 'glitchbrushes:image-brush-canvas-upload'
      : 'glitchbrushes:canvas-dirty-upload';
    const previousCanvasUploads = (await performanceSnapshot(evaluate)).counts[uploadMetric] ?? 0;
    const start = {
      x: canvas.x + canvas.width * 0.2,
      y: canvas.y + canvas.height * (0.44 + (index % 10) * 0.032),
    };
    const end = {
      x: start.x + canvas.width * (strokeProfile === 'long' ? 0.48 : 0.09),
      y: start.y + (strokeProfile === 'long' ? 34 : 6),
    };
    await stroke(start, end);
    try {
      await waitFor(async () => {
        const metrics = await performanceSnapshot(evaluate);
        return (metrics.counts[uploadMetric] ?? 0) > previousCanvasUploads;
      }, imageFxId ? 60000 : 10000);
      await delay(imageFxId ? 80 : 30);
    } catch {
      if (imageFxId) {
        const state = await evaluate(`({
          notice: document.querySelector('.status-message')?.textContent.trim(),
          progress: document.querySelector('.image-brush-progress')?.textContent.trim(),
          rack: document.querySelector('.image-brush-fx-rack')?.textContent.trim().slice(0, 180),
          mutation: [...document.querySelectorAll('.image-brush-lab select')].find((select) => select.closest('label')?.textContent.includes('Evolution mode'))?.value
        })`);
        throw new Error(`Image Brush stroke ${index + 1} did not commit: ${JSON.stringify(state)}`);
      }
      throw new Error(`Effect stroke ${index + 1} did not commit.`);
    }
    if ((index + 1) % 40 === 0 || index + 1 === measuredStrokes) {
      heapCheckpoints.push({
        stroke: index + 1,
        heap: await evaluate(`performance.memory?.usedJSHeapSize ?? null`),
      });
    }
  }
  await delay(900);
  const after = await performanceSnapshot(evaluate);
  const zoomAfter = await evaluate(`document.querySelector('.zoom-readout')?.textContent ?? ''`);
  const hashCanvas = async () =>
    evaluate(`(async () => {
    const canvas = document.querySelector('.work-canvas');
    const bytes = canvas.getContext('2d').getImageData(0, 0, canvas.width, canvas.height).data;
    const digest = await crypto.subtle.digest('SHA-256', bytes);
    return [...new Uint8Array(digest)].map((value) => value.toString(16).padStart(2, '0')).join('');
  })()`);
  const committedHash = await hashCanvas();
  let undoneHash = '';
  let redoneHash = '';
  for (let cycle = 0; cycle < historyCycles; cycle += 1) {
    const historyReady = await evaluate(
      `(() => { const button = document.querySelector('button[aria-label="Undo"]'); if (!button || button.disabled) return false; button.click(); return true; })()`,
    );
    if (!historyReady) {
      const state = await evaluate(`({
        notice: document.querySelector('.status-message')?.textContent.trim(),
        activeLayer: document.querySelector('.layer-row.active, .layer-row[aria-selected="true"]')?.textContent.trim(),
        pointerEvents: getComputedStyle(document.querySelector('.work-canvas')).pointerEvents,
        metrics: window.__GLITCH_PERF__?.snapshot()
      })`);
      throw new Error(`Undo was not available after the acceptance strokes: ${JSON.stringify(state)}`);
    }
    await delay(historyCycles > 1 ? 35 : 350);
    if (cycle === 0) undoneHash = await hashCanvas();
    const redoReady = await evaluate(
      `(() => { const button = document.querySelector('button[aria-label="Redo"]'); if (!button || button.disabled) return false; button.click(); return true; })()`,
    );
    if (!redoReady) throw new Error('Redo was not available after Undo.');
    await delay(historyCycles > 1 ? 35 : 350);
  }
  redoneHash = await hashCanvas();
  await delay(historyCycles > 1 ? 750 : 100);
  const afterHistory = await performanceSnapshot(evaluate);
  const heapAfter = await evaluate(`performance.memory?.usedJSHeapSize ?? null`);
  heapCheckpoints.push({ stroke: measuredStrokes, phase: 'after-history', heap: heapAfter });
  const delta = (name) => (after.counts[name] ?? 0) - (before.counts[name] ?? 0);
  const scenarioRafGaps = after.rafGaps;
  return {
    browser: capabilities,
    effect: retouchTool || imageFxId || effectName,
    mutationMode: imageFxId ? mutationMode : undefined,
    strokeProfile,
    document: await evaluate(`document.querySelector('.topbar-file')?.textContent.trim() ?? ''`),
    warmups: warmupStrokes,
    strokes: measuredStrokes,
    historyCycles,
    canvasDirtyUploadDelta: delta('glitchbrushes:canvas-dirty-upload'),
    canvasFullSyncDelta: delta('glitchbrushes:canvas-full-sync'),
    fitToScreenDelta: delta('glitchbrushes:fit-to-screen'),
    zoomStable: zoomBefore === zoomAfter,
    historyByteExact: committedHash !== undoneHash && committedHash === redoneHash,
    heap:
      heapBefore === null || heapAfter === null
        ? { supported: false }
        : {
            supported: true,
            before: heapBefore,
            after: heapAfter,
            delta: heapAfter - heapBefore,
            checkpoints: heapCheckpoints,
          },
    workerRoundTrip: summarize(
      (
        after.samples[
          retouchTool
            ? 'glitchbrushes:retouch-worker-roundtrip'
            : 'glitchbrushes:pointer-up-to-result'
        ] ?? []
      ).slice(-measuredStrokes),
    ),
    sourcePrep: retouchTool
      ? summarize(
          (after.samples['glitchbrushes:retouch-source-prep'] ?? []).slice(-measuredStrokes),
        )
      : undefined,
    adoption: summarize(
      (
        after.samples[
          retouchTool
            ? 'glitchbrushes:retouch-result-adoption'
            : 'glitchbrushes:worker-result-adoption'
        ] ?? []
      ).slice(-measuredStrokes),
    ),
    layerCommit: summarize(
      (
        after.samples[
          imageFxId ? 'glitchbrushes:layer-commit' : 'glitchbrushes:commit-current-buffer'
        ] ?? []
      ).slice(-measuredStrokes),
    ),
    canvasUpload: summarize(
      (
        after.samples[
          imageFxId
            ? 'glitchbrushes:image-brush-canvas-upload'
            : 'glitchbrushes:canvas-dirty-upload'
        ] ?? []
      ).slice(-measuredStrokes),
    ),
    rafGaps: summarize(scenarioRafGaps),
    rafGapsOver50ms: scenarioRafGaps.filter((gap) => gap >= 50).length,
    totalRaf: afterHistory.raf,
  };
}

async function runEdge() {
  const executable = 'C:\\Program Files (x86)\\Microsoft\\Edge\\Application\\msedge.exe';
  const port = 30_000 + (process.pid % 10_000);
  const launchArguments = [
    `--remote-debugging-port=${port}`,
    `--user-data-dir=${profile}`,
    '--no-first-run',
    '--no-default-browser-check',
    '--disable-features=msEdgeFirstRunExperience',
    '--window-size=1500,980',
    appUrl,
  ];
  if (!headed) launchArguments.splice(5, 0, '--headless=new');
  const browserProcess = spawn(
    executable,
    launchArguments,
    { stdio: 'ignore', windowsHide: !headed },
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
    if (headed) {
      await rpc.send('Page.enable');
      await rpc.send('Page.bringToFront');
      await rpc.send('Emulation.setFocusEmulationEnabled', { enabled: true });
    }
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
      headed,
    });
  } finally {
    rpc?.close();
    await stopBrowser(browserProcess);
    await delay(500);
  }
}

async function runFirefox() {
  const executable = 'C:\\Program Files\\Mozilla Firefox\\firefox.exe';
  const port = 20_000 + (process.pid % 10_000);
  const launchArguments = [
    '--no-remote',
    '--wait-for-browser',
    '--profile',
    profile,
    `--remote-debugging-port=${port}`,
    '--width=1500',
    '--height=980',
    appUrl,
  ];
  if (!headed) launchArguments.splice(2, 0, '--headless');
  const browserProcess = spawn(
    executable,
    launchArguments,
    { stdio: 'ignore', windowsHide: !headed },
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
      headed,
    });
    await rpc.send('session.end', {});
    return report;
  } finally {
    rpc?.close();
    await stopBrowser(browserProcess);
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
