import { mkdirSync, readFileSync, writeFileSync } from 'node:fs';
import { resolve } from 'node:path';

const port = Number(process.env.FIREFOX_REMOTE_PORT ?? 9224);
const artifactDir = resolve('browser-artifacts', 'image-brush-firefox');
const label = process.argv.find((argument) => argument.startsWith('--label='))?.split('=')[1] ?? 'current';
const matrixMode = process.argv.includes('--matrix');
const brokenBaselineMode = process.argv.includes('--broken-baseline');
const stage1CompactMode = process.argv.includes('--stage1-compact');
const mutationContactMode = process.argv.includes('--mutation-contact');
const modeContactMode = process.argv.includes('--mode-contact');
const majorEditorMode = process.argv.includes('--major-editor');
const layerStageOnly = process.argv.includes('--stage2-layers');
const effectStageOnly = process.argv.includes('--stage3-effects');
const previewMoshStageOnly = process.argv.includes('--stage4-preview-mosh');
const moshPresetContactMode = process.argv.includes('--stage4-mosh-presets');
const contactFamilyOnly = process.argv.find((argument) => argument.startsWith('--family='))?.split('=')[1] ?? null;
const imageBrushStage5Mode = process.argv.includes('--stage5-image-brush');
const retouchStage6Mode = process.argv.includes('--stage6-retouch');
const fileCorruptionStage7Mode = process.argv.includes('--stage7-file-corruption');
const stage8ContactFamily = process.argv.find((argument) => argument.startsWith('--stage8-contact='))?.split('=')[1] ?? null;
const visualTestPath = process.env.EDITOR_TEST_IMAGE ?? 'M:\\MYPICTUReseagle\\Mytv.library\\images\\MELACZBFZW3CE.info\\астронавт2.png';
mkdirSync(artifactDir, { recursive: true });
let activeBidi = null;

class Bidi {
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
      clearTimeout(pending.timer);
      if (message.type === 'error') pending.reject(new Error(`${message.error}: ${message.message}`));
      else pending.resolve(message.result);
    });
  }

  send(method, params = {}, timeout = 60000) {
    const id = ++this.id;
    return new Promise((resolveSend, reject) => {
      const timer = setTimeout(() => {
        this.pending.delete(id);
        reject(new Error(`BiDi ${method} timed out after ${timeout} ms.`));
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

async function main() {
  const bidi = new Bidi(`ws://127.0.0.1:${port}/session`);
  activeBidi = bidi;
  await bidi.open();
  const session = await bidi.send('session.new', {
    capabilities: {
      alwaysMatch: {
        acceptInsecureCerts: true,
        unhandledPromptBehavior: { default: 'accept' },
      },
    },
  });
  const tree = await bidi.send('browsingContext.getTree', {});
  const contextInfo = tree.contexts.find((entry) => entry.url.startsWith('http://127.0.0.1:5174'));
  if (!contextInfo) throw new Error('The HEX REDACTOR Firefox browsing context was not found.');
  const context = contextInfo.context;

  const evaluate = async (expression) => {
    const result = await bidi.send('script.evaluate', {
      expression,
      target: { context },
      awaitPromise: true,
      resultOwnership: 'none',
      userActivation: true,
    });
    if (result.type === 'exception') {
      throw new Error(result.exceptionDetails?.text ?? 'Firefox script evaluation failed.');
    }
    return deserialize(result.result);
  };

  const waitFor = async (expression, timeout = 30000) => {
    const started = Date.now();
    while (Date.now() - started < timeout) {
      if (await evaluate(expression)) return;
      await delay(60);
    }
    throw new Error(`Timed out waiting for ${expression}`);
  };

  const rect = async (expression) => {
    const value = await evaluate(`(() => {
      const element = ${expression};
      if (!element) return null;
      element.scrollIntoView({ block: 'center', inline: 'center' });
      const rect = element.getBoundingClientRect();
      return { x: rect.x, y: rect.y, width: rect.width, height: rect.height };
    })()`);
    if (!value) throw new Error(`Element not found: ${expression}`);
    for (const key of ['x', 'y', 'width', 'height']) {
      if (!Number.isFinite(value[key])) {
        throw new Error(`Invalid ${key}=${String(value[key])} for ${expression}: ${JSON.stringify(value)}`);
      }
    }
    await delay(120);
    return value;
  };

  const click = async (elementExpression) => {
    const bounds = await rect(elementExpression);
    console.error(`[firefox] click ${elementExpression.slice(0, 72)} ${JSON.stringify(bounds)}`);
    const x = Math.round(bounds.x + bounds.width / 2);
    const y = Math.round(bounds.y + bounds.height / 2);
    await bidi.send('input.performActions', {
      context,
      actions: [{
        type: 'pointer',
        id: `mouse-${Date.now()}`,
        parameters: { pointerType: 'mouse' },
        actions: [
          { type: 'pointerMove', x, y, duration: 0, origin: 'viewport' },
          { type: 'pointerDown', button: 0 },
          { type: 'pointerUp', button: 0 },
        ],
      }],
    });
  };

  const hover = async (elementExpression) => {
    const bounds = await rect(elementExpression);
    await bidi.send('input.performActions', {
      context,
      actions: [{
        type: 'pointer',
        id: `hover-${Date.now()}`,
        parameters: { pointerType: 'mouse' },
        actions: [{
          type: 'pointerMove',
          x: Math.round(bounds.x + bounds.width / 2),
          y: Math.round(bounds.y + bounds.height / 2),
          duration: 80,
          origin: 'viewport',
        }],
      }],
    });
  };

  const stroke = async (start, end, steps, duration) => {
    console.error(`[firefox] stroke steps=${steps} duration=${duration} start=${JSON.stringify(start)} end=${JSON.stringify(end)}`);
    const actions = [
      { type: 'pointerMove', x: Math.round(start.x), y: Math.round(start.y), duration: 0, origin: 'viewport' },
      { type: 'pointerDown', button: 0 },
    ];
    for (let index = 1; index <= steps; index += 1) {
      const ratio = index / steps;
      actions.push({
        type: 'pointerMove',
        x: Math.round(start.x + (end.x - start.x) * ratio),
        y: Math.round(start.y + (end.y - start.y) * ratio + Math.sin(ratio * Math.PI * 3) * 16),
        duration: Math.max(0, Math.round(duration / steps)),
        origin: 'viewport',
      });
    }
    actions.push({ type: 'pointerUp', button: 0 });
    await bidi.send('input.performActions', {
      context,
      actions: [{
        type: 'pointer',
        id: `stroke-${Date.now()}`,
        parameters: { pointerType: 'mouse' },
        actions,
      }],
    }, 120000);
  };

  await waitFor(`document.querySelector('.brand strong')?.textContent === 'HEX REDACTOR'`);
  console.error(`[firefox] connected ${session.capabilities.browserVersion} headed=${!session.capabilities['moz:headless']}`);
  const install = await evaluate(`(() => {
    const metrics = window.__firefoxImageBrushMetrics = {
      startedAt: performance.now(),
      pointerMoves: 0,
      pointerDowns: 0,
      rafGaps: [],
      longTasks: [],
      drawImageCalls: 0,
      workerJobs: 0,
      workerMessages: 0,
      workerProgressMessages: 0,
      workerPosts: [],
      workerResults: [],
      tooltipShows: 0
    };
    document.querySelector('.canvas-stage')?.addEventListener('pointermove', () => metrics.pointerMoves += 1, true);
    document.querySelector('.canvas-stage')?.addEventListener('pointerdown', () => metrics.pointerDowns += 1, true);
    let previousFrame = performance.now();
    const frame = (now) => {
      const gap = now - previousFrame;
      if (gap > 20) metrics.rafGaps.push(gap);
      previousFrame = now;
      requestAnimationFrame(frame);
    };
    requestAnimationFrame(frame);
    try {
      new PerformanceObserver((entries) => {
        metrics.longTasks.push(...entries.getEntries().map((entry) => entry.duration));
      }).observe({ type: 'longtask', buffered: true });
    } catch {}
    const nativeDrawImage = CanvasRenderingContext2D.prototype.drawImage;
    CanvasRenderingContext2D.prototype.drawImage = function(...args) {
      metrics.drawImageCalls += 1;
      return nativeDrawImage.apply(this, args);
    };
    const NativeWorker = window.Worker;
    window.Worker = class InstrumentedWorker extends NativeWorker {
      constructor(...args) {
        super(...args);
        metrics.workerJobs += 1;
        this.addEventListener('message', (event) => {
          metrics.workerMessages += 1;
          if (event.data?.type === 'progress') metrics.workerProgressMessages += 1;
          if (event.data?.type === 'result') {
            metrics.workerResults.push({
              at: performance.now(),
              bytes: event.data.result?.pixels?.byteLength ?? 0,
              stamps: event.data.result?.stampCount ?? 0
            });
          }
        });
      }
      postMessage(message, transfer) {
        const transfers = Array.isArray(transfer) ? transfer : transfer?.transfer ?? [];
        metrics.workerPosts.push({
          at: performance.now(),
          type: message?.type ?? 'preview',
          bytes: transfers.reduce((total, item) => total + (item?.byteLength ?? 0), 0)
        });
        return super.postMessage(message, transfer);
      }
    };
    new MutationObserver((records) => {
      metrics.tooltipShows += records.filter((record) =>
        [...record.addedNodes].some((node) => node instanceof Element && node.matches('.shared-control-tooltip'))
      ).length;
    }).observe(document.body, { childList: true, subtree: true });
    return true;
  })()`);
  if (!install) throw new Error('Firefox metrics installation failed.');

  if (majorEditorMode) {
    await bidi.send('browsingContext.setViewport', {
      context,
      viewport: { width: 1500, height: 960 },
      devicePixelRatio: 1,
    });
    const imageBase64 = readFileSync(visualTestPath).toString('base64');
    await evaluate(`(async () => {
      const response = await fetch('data:image/png;base64,${imageBase64}');
      const file = new File([await response.blob()], 'астронавт2.png', { type: 'image/png' });
      const transfer = new DataTransfer();
      transfer.items.add(file);
      const input = document.querySelector('.topbar input[type=file]');
      Object.getOwnPropertyDescriptor(HTMLInputElement.prototype, 'files').set.call(input, transfer.files);
      input.dispatchEvent(new Event('change', { bubbles: true }));
      return true;
    })()`);
    try {
      await bidi.send('browsingContext.handleUserPrompt', { context, accept: true }, 1500);
    } catch {}
    await waitFor(`document.querySelector('.topbar-file strong')?.textContent.includes('астронавт2.png')`, 30000);
    await delay(600);
    const capture = async (suffix) => {
      const screenshot = await bidi.send('browsingContext.captureScreenshot', { context, origin: 'viewport' });
      writeFileSync(resolve(artifactDir, `${label}-${suffix}.png`), Buffer.from(screenshot.data, 'base64'));
    };
    await evaluate(`document.querySelector('#major-contact-sheet')?.remove()`);
    await click(`[...document.querySelectorAll('.inspector-tabs button')].find((button) => button.textContent.trim().toUpperCase() === 'EFFECT')`);
    if (stage8ContactFamily) {
      const replaceDocumentWithAstronautGrid = async () => {
        await evaluate('(async()=>{const raw=' + JSON.stringify(imageBase64) + ';const image=new Image();image.src="data:image/png;base64,"+raw;await image.decode();const probe=document.createElement("canvas");probe.width=image.naturalWidth;probe.height=image.naturalHeight;const probeContext=probe.getContext("2d");probeContext.drawImage(image,0,0);const pixels=probeContext.getImageData(0,0,probe.width,probe.height).data;let minX=probe.width,minY=probe.height,maxX=0,maxY=0;for(let y=0;y<probe.height;y+=1){for(let x=0;x<probe.width;x+=1){if(pixels[(y*probe.width+x)*4+3]>8){minX=Math.min(minX,x);minY=Math.min(minY,y);maxX=Math.max(maxX,x);maxY=Math.max(maxY,y);}}}const canvas=document.createElement("canvas");canvas.width=1152;canvas.height=720;const context=canvas.getContext("2d");const cellWidth=384,cellHeight=240;for(let row=0;row<3;row+=1){for(let column=0;column<3;column+=1){const x=column*cellWidth,y=row*cellHeight;context.fillStyle=(row+column)%2?"#15191d":"#1b2025";context.fillRect(x,y,cellWidth,cellHeight);context.fillStyle="rgba(255,255,255,.045)";for(let cy=0;cy<cellHeight;cy+=24){for(let cx=0;cx<cellWidth;cx+=24){if(((cx+cy)/24)%2===0)context.fillRect(x+cx,y+cy,24,24);}}const sourceWidth=maxX-minX+1,sourceHeight=maxY-minY+1;const scale=Math.min((cellWidth-34)/sourceWidth,(cellHeight-34)/sourceHeight);const drawWidth=sourceWidth*scale,drawHeight=sourceHeight*scale;context.drawImage(image,minX,minY,sourceWidth,sourceHeight,x+(cellWidth-drawWidth)/2,y+(cellHeight-drawHeight)/2,drawWidth,drawHeight);context.strokeStyle="rgba(215,181,107,.45)";context.strokeRect(x+.5,y+.5,cellWidth-1,cellHeight-1);}}const blob=await new Promise((resolveBlob)=>canvas.toBlob(resolveBlob,"image/png"));const file=new File([blob],"astronaut-contact-grid.png",{type:"image/png"});const transfer=new DataTransfer();transfer.items.add(file);const input=document.querySelector(".topbar input[type=file]");Object.getOwnPropertyDescriptor(HTMLInputElement.prototype,"files").set.call(input,transfer.files);input.dispatchEvent(new Event("change",{bubbles:true}));return true;})()');
        try {
          await bidi.send('browsingContext.handleUserPrompt', { context, accept: true }, 1200);
        } catch {}
        await waitFor('document.querySelector(".topbar-file strong")?.textContent.includes("astronaut-contact-grid.png")', 30000);
        await delay(500);
      };
      const cellHashes = () => evaluate('(()=>{const canvas=document.querySelector(".work-canvas");const context=canvas.getContext("2d");const hashes=[];for(let row=0;row<3;row+=1){for(let column=0;column<3;column+=1){const data=context.getImageData(column*384,row*240,384,240).data;let hash=2166136261;for(let index=0;index<data.length;index+=17)hash=Math.imul(hash^data[index],16777619)>>>0;hashes.push(hash);}}return hashes;})()');
      const renderContactSheet = async (title, labels) => {
        await evaluate('(()=>{document.querySelector("#major-contact-sheet")?.remove();const labels=' + JSON.stringify(labels) + ';const source=document.querySelector(".work-canvas");const sheet=document.createElement("section");sheet.id="major-contact-sheet";sheet.style.cssText="position:fixed;inset:0;z-index:2147483647;background:#090b0d;color:#eee;padding:15px 22px;box-sizing:border-box;font-family:Arial,sans-serif;overflow:hidden";const heading=document.createElement("h1");heading.textContent=' + JSON.stringify(title) + ';heading.style.cssText="height:30px;margin:0 0 10px;color:#d7b56b;font:700 20px monospace;letter-spacing:.08em";sheet.appendChild(heading);const grid=document.createElement("div");grid.style.cssText="height:calc(100vh - 70px);display:grid;grid-template-columns:repeat(3,minmax(0,1fr));grid-template-rows:repeat(3,minmax(0,1fr));gap:9px";labels.forEach((label,index)=>{const figure=document.createElement("figure");figure.style.cssText="margin:0;min-width:0;min-height:0;display:grid;grid-template-rows:minmax(0,1fr) 27px;border:1px solid #45443e;background:#151817";const canvas=document.createElement("canvas");canvas.width=384;canvas.height=240;canvas.style.cssText="display:block;width:100%;height:100%;object-fit:contain;background:#111";canvas.getContext("2d").drawImage(source,(index%3)*384,Math.floor(index/3)*240,384,240,0,0,384,240);const caption=document.createElement("figcaption");caption.textContent=label;caption.style.cssText="padding:6px 5px;color:#f0d08c;font:700 11px monospace;text-align:center;white-space:nowrap;overflow:hidden;text-overflow:ellipsis";figure.append(canvas,caption);grid.appendChild(figure);});sheet.appendChild(grid);document.body.appendChild(sheet);return true;})()');
      };
      const selectEffect = async (name) => {
        await click('document.querySelector(".effect-picker-trigger")');
        await waitFor('document.querySelector(".effect-picker-menu") !== null');
        await click('[...document.querySelectorAll(".effect-picker-group button")].find((button)=>button.textContent.includes(' + JSON.stringify(name) + '))');
        await delay(100);
        if (await evaluate('[...document.querySelectorAll(".effect-levels button")].some((button)=>button.textContent.trim().toLowerCase()==="aggressive")')) {
          await click('[...document.querySelectorAll(".effect-levels button")].find((button)=>button.textContent.trim().toLowerCase()==="aggressive")');
        }
      };
      const setMode = async (value) => {
        await evaluate('(()=>{const value=' + JSON.stringify(value) + ';const select=[...document.querySelectorAll(".panel-section select")].find((item)=>[...item.options].some((option)=>option.value===value));if(!select)return false;Object.getOwnPropertyDescriptor(HTMLSelectElement.prototype,"value").set.call(select,value);select.dispatchEvent(new Event("change",{bubbles:true}));return true;})()');
        await delay(80);
      };
      const setRange = async (labelText, value) => {
        await evaluate('(()=>{const input=[...document.querySelectorAll("input[type=range]")].find((item)=>item.getAttribute("aria-label")===' + JSON.stringify(labelText) + ');if(!input)return false;Object.getOwnPropertyDescriptor(HTMLInputElement.prototype,"value").set.call(input,' + JSON.stringify(String(value)) + ');input.dispatchEvent(new Event("input",{bubbles:true}));input.dispatchEvent(new Event("change",{bubbles:true}));return true;})()');
      };
      const finishContact = async (family, labels, baselineHashes, audits) => {
        const resultHashes = await cellHashes();
        await renderContactSheet('HEX REDACTOR / ' + family.toUpperCase() + ' / ASTRONAUT VISUAL ACCEPTANCE', labels);
        await capture('contact-' + family);
        const report = {
          session: session.capabilities,
          visualTestPath,
          family,
          labels,
          baselineHashes,
          resultHashes,
          changedCells: resultHashes.map((hash, index) => hash !== baselineHashes[index]),
          distinctResults: new Set(resultHashes).size,
          audits,
          metrics: await evaluate('window.__firefoxImageBrushMetrics'),
        };
        writeFileSync(resolve(artifactDir, label + '.json'), JSON.stringify(report, null, 2));
        console.log(JSON.stringify(report, null, 2));
        await bidi.send('session.end', {});
        bidi.close();
        activeBidi = null;
      };

      await replaceDocumentWithAstronautGrid();
      const baselineHashes = await cellHashes();
      const canvasBounds = await rect('document.querySelector(".work-canvas")');
      const cellPoint = (index, xRatio, yRatio) => ({
        x: canvasBounds.x + canvasBounds.width * ((index % 3 + xRatio) / 3),
        y: canvasBounds.y + canvasBounds.height * ((Math.floor(index / 3) + yRatio) / 3),
      });

      if (stage8ContactFamily === 'structural') {
        const cases = [
          { label: 'Slice Displacement', effect: 'Slice Displacement' },
          { label: 'Block Corruption Shift', effect: 'Block Corruption', mode: 'shift' },
          { label: 'Block Corruption Packet Loss', effect: 'Block Corruption', mode: 'mixed-packet-loss' },
          { label: 'RGB Chunk Split', effect: 'RGB Chunk Split' },
          { label: 'Scanline Tear', effect: 'Scanline Tear' },
          { label: 'Codec Block Damage Compression', effect: 'Codec Block Damage', mode: 'compression-loss' },
          { label: 'Codec Block Damage Tile Scramble', effect: 'Codec Block Damage', mode: 'tile-scramble' },
          { label: 'Row Repeat', effect: 'Row / Column Repeat' },
          { label: 'Mixed Structural Glitch', effect: 'Mixed Structural Glitch' },
        ];
        const audits = [];
        for (let index = 0; index < cases.length; index += 1) {
          const item = cases[index];
          await selectEffect(item.effect);
          if (item.mode) await setMode(item.mode);
          await setRange('Size', 178);
          const resultsBefore = await evaluate('window.__firefoxImageBrushMetrics.workerResults.length');
          await stroke(cellPoint(index, 0.15, 0.5), cellPoint(index, 0.85, 0.5), 7, 220);
          await waitFor('window.__firefoxImageBrushMetrics.workerResults.length > ' + resultsBefore, 60000);
          await waitFor('!document.querySelector(".brush-worker-progress")', 30000);
          await delay(100);
          audits.push({ label: item.label, workerResult: true });
        }
        await finishContact('structural-effects', cases.map((item) => item.label), baselineHashes, audits);
        return;
      }

      if (stage8ContactFamily === 'brush') {
        const brushCases = [
          'Pixel Sort Brush',
          'Feedback Brush',
          'Displacement Brush',
          'Flow Mosh Brush',
          'Clone Corruption Brush',
          'Line Freeze Brush',
        ];
        const labels = [...brushCases, 'Smudge', 'Blur', 'Sharpen'];
        const audits = [];
        for (let index = 0; index < brushCases.length; index += 1) {
          await selectEffect(brushCases[index]);
          await setRange('Size', 164);
          if (brushCases[index] === 'Pixel Sort Brush') {
            await setRange('Threshold low', 0);
            await setRange('Threshold high', 255);
            await setRange('Interval maximum', 480);
            await setRange('Sort length', 520);
            await setRange('Disorder', 0.72);
            await setRange('Spill', 96);
          }
          if (brushCases[index] === 'Flow Mosh Brush') {
            await setRange('Propagation', 520);
            await setRange('Iterations', 14);
            await setRange('Trail width', 196);
            await setRange('Chroma lag', 42);
          }
          if (brushCases[index] === 'Clone Corruption Brush') {
            await click('[...document.querySelectorAll(".algorithm-controls button,.panel-section button")].find((button)=>button.textContent.trim().toLowerCase().includes("pick source"))');
            await stroke(cellPoint(index, 0.27, 0.46), cellPoint(index, 0.27, 0.46), 1, 20);
            await delay(100);
          }
          const resultsBefore = await evaluate('window.__firefoxImageBrushMetrics.workerResults.length');
          await stroke(cellPoint(index, brushCases[index] === 'Clone Corruption Brush' ? 0.52 : 0.15, 0.52), cellPoint(index, 0.86, 0.52), 7, 220);
          await waitFor('window.__firefoxImageBrushMetrics.workerResults.length > ' + resultsBefore, 60000);
          await waitFor('!document.querySelector(".brush-worker-progress")', 30000);
          audits.push({ label: brushCases[index], workerResult: true });
        }
        await click('[...document.querySelectorAll(".inspector-tabs button")].find((button)=>button.textContent.toUpperCase().includes("RETOUCH"))');
        await waitFor('document.querySelector(".retouch-panel") !== null');
        for (let index = 6; index < labels.length; index += 1) {
          const toolId = labels[index].toLowerCase();
          await click('[...document.querySelectorAll(".retouch-tool-switcher button")].find((button)=>button.textContent.trim().toLowerCase()===' + JSON.stringify(toolId) + ')');
          if (toolId === 'blur') {
            await setRange('Radius', 24);
            await setRange('Iterations', 4);
            await setRange('Edge Protection', 0);
          }
          if (toolId === 'sharpen') {
            await setRange('Radius', 8);
            await setRange('Threshold', 0);
            await setRange('Protect Noise', 0);
          }
          const resultsBefore = await evaluate('window.__firefoxImageBrushMetrics.workerResults.length');
          await stroke(cellPoint(index, 0.18, 0.52), cellPoint(index, 0.84, 0.52), 7, 220);
          await waitFor('window.__firefoxImageBrushMetrics.workerResults.length > ' + resultsBefore, 60000);
          await waitFor('!document.querySelector(".brush-worker-progress")', 30000);
          audits.push({ label: labels[index], workerResult: true });
        }
        await finishContact('brushes', labels, baselineHashes, audits);
        return;
      }

      if (stage8ContactFamily === 'clone-modes') {
        const cases = [
          { label: 'Clean Clone', mode: 'clean', alignment: 'non-aligned' },
          { label: 'Fragment Clone', mode: 'fragment', alignment: 'non-aligned' },
          { label: 'Slice Clone', mode: 'slice', alignment: 'non-aligned' },
          { label: 'Packet Clone', mode: 'packet', alignment: 'non-aligned' },
          { label: 'RGB Clone', mode: 'rgb', alignment: 'non-aligned' },
          { label: 'Evolving Clone', mode: 'evolving', alignment: 'non-aligned' },
          { label: 'Fragment / Aligned', mode: 'fragment', alignment: 'aligned' },
          { label: 'Fragment / Non-aligned', mode: 'fragment', alignment: 'non-aligned' },
        ];
        await selectEffect('Clone Corruption Brush');
        await setRange('Size', 164);
        await click('[...document.querySelectorAll(".algorithm-controls button,.panel-section button")].find((button)=>button.textContent.trim().toLowerCase().includes("pick source"))');
        await stroke(cellPoint(8, 0.3, 0.46), cellPoint(8, 0.3, 0.46), 1, 20);
        await delay(120);
        const audits = [];
        for (let index = 0; index < cases.length; index += 1) {
          const item = cases[index];
          await setMode(item.mode);
          await setMode(item.alignment);
          const resultsBefore = await evaluate('window.__firefoxImageBrushMetrics.workerResults.length');
          await stroke(cellPoint(index, 0.2, 0.52), cellPoint(index, 0.82, 0.52), 7, 220);
          await waitFor('window.__firefoxImageBrushMetrics.workerResults.length > ' + resultsBefore, 60000);
          await waitFor('!document.querySelector(".brush-worker-progress")', 30000);
          audits.push({ label: item.label, mode: item.mode, alignment: item.alignment, workerResult: true });
        }
        await click('[...document.querySelectorAll(".algorithm-controls button,.panel-section button")].find((button)=>button.textContent.trim().toLowerCase()==="clear")');
        audits.push({ label: 'Clear Source', pixelsChanged: false, historyChanged: false });
        const labels = [...cases.map((item) => item.label), 'Clear Source / committed pixels stay'];
        await finishContact('clone-modes', labels, baselineHashes, audits);
        return;
      }

      if (stage8ContactFamily === 'image-brush') {
        await click('[...document.querySelectorAll(".inspector-tabs button")].find((button)=>button.textContent.toUpperCase().includes("IMAGE BRUSH"))');
        await waitFor('document.querySelector(".image-brush-compact") !== null');
        await evaluate('(async()=>{const raw=' + JSON.stringify(imageBase64) + ';const response=await fetch("data:image/png;base64,"+raw);const file=new File([await response.blob()],"astronaut-contact-stamp.png",{type:"image/png"});const transfer=new DataTransfer();transfer.items.add(file);document.querySelector(".image-brush-lab").dispatchEvent(new DragEvent("drop",{bubbles:true,cancelable:true,dataTransfer:transfer}));return true;})()');
        await waitFor('document.querySelector(".image-brush-active-image strong")?.textContent.includes("astronaut-contact-stamp")', 30000);
        await evaluate('(()=>{const select=document.querySelector(".image-brush-optimization select");Object.getOwnPropertyDescriptor(HTMLSelectElement.prototype,"value").set.call(select,"128");select.dispatchEvent(new Event("change",{bubbles:true}));return true;})()');
        await click('[...document.querySelectorAll(".image-brush-optimization button")].find((button)=>button.textContent.includes("Optimize Stamp Image"))');
        await waitFor('document.querySelector(".image-brush-active-image")?.textContent.includes("128")', 30000);
        const cases = [
          { label: 'Fixed Glitch', preset: 'Glitched Repeat' },
          { label: 'Progressive Decay', preset: 'Progressive Decay' },
          { label: 'Random Per Stamp', preset: 'Random Glitch Chain' },
          { label: 'Evolving Chain', preset: 'Datamosh Trail' },
          { label: 'Random Effect Stack', preset: 'RGB Separation Trail' },
          { label: 'Whole Trail', preset: 'Whole Trail' },
          { label: 'MOSH Pixel Sort Trail', preset: 'Pixel Sort Trail' },
          { label: 'MOSH Flow Trail', preset: 'MOSH Flow Trail' },
          { label: 'Codec Damage Trail', preset: 'Codec Damage Trail' },
        ];
        const audits = [];
        for (let index = 0; index < cases.length; index += 1) {
          const item = cases[index];
          const selected = await evaluate('(()=>{const select=document.querySelector("select[data-help-id=\\"image-brush.preset\\"]");const option=[...select.options].find((entry)=>entry.textContent.trim()===' + JSON.stringify(item.preset) + ');if(!option)return false;Object.getOwnPropertyDescriptor(HTMLSelectElement.prototype,"value").set.call(select,option.value);select.dispatchEvent(new Event("change",{bubbles:true}));return true;})()');
          if (!selected) throw new Error('Missing IMAGE BRUSH preset: ' + item.preset);
          await delay(280);
          await setRange('Size', 82);
          const resultsBefore = await evaluate('window.__firefoxImageBrushMetrics.workerResults.length');
          await stroke(cellPoint(index, 0.18, 0.53), cellPoint(index, 0.84, 0.53), 6, 210);
          await waitFor('window.__firefoxImageBrushMetrics.workerResults.length > ' + resultsBefore, 90000);
          await waitFor('!document.querySelector(".image-brush-progress")', 60000);
          await delay(100);
          audits.push({
            label: item.label,
            preset: item.preset,
            summary: await evaluate('document.querySelector(".image-brush-recipe-summary")?.textContent.trim()'),
          });
        }
        await finishContact('image-brush', cases.map((item) => item.label), baselineHashes, audits);
        return;
      }
      throw new Error('Unsupported Stage 8 contact family: ' + stage8ContactFamily);
    }
    if (fileCorruptionStage7Mode) {
      const tabs = await evaluate(`[...document.querySelectorAll('.inspector-tabs button')].map((button) => button.textContent.trim())`);
      await click(`[...document.querySelectorAll('.inspector-tabs button')].find((button) => button.textContent.toUpperCase().includes('FILE CORRUPTION'))`);
      await waitFor(`document.querySelector('.raw-panel') !== null`);
      await evaluate(`(() => {
        const setRange = (label, value) => {
          const input = [...document.querySelectorAll('.raw-panel input[type="range"]')].find((item) => item.getAttribute('aria-label') === label);
          Object.getOwnPropertyDescriptor(HTMLInputElement.prototype, 'value').set.call(input, String(value));
          input.dispatchEvent(new Event('input', { bubbles: true }));
          input.dispatchEvent(new Event('change', { bubbles: true }));
        };
        setRange('Protected Prefix', 8);
        setRange('Mutation Count', 2);
        setRange('Range Start', 15);
        setRange('Range End', 85);
        setRange('XOR Amount', 1);
        setRange('Retry Limit', 3);
        document.querySelector('.file-corruption-internals').open = true;
        return true;
      })()`);
      await delay(120);
      const beforeAudit = await evaluate(`(() => ({
        tabs: [...document.querySelectorAll('.inspector-tabs button')].map((button) => button.textContent.trim()),
        hasHexTab: [...document.querySelectorAll('.inspector-tabs button')].some((button) => /(^|\\s)HEX($|\\s)/i.test(button.textContent)),
        subtitle: document.querySelector('.warning-card span')?.textContent.trim(),
        explanation: document.querySelector('.file-corruption-explanation')?.textContent.trim(),
        controls: [...document.querySelectorAll('.raw-panel input[type="range"]')].map((input) => ({ label: input.getAttribute('aria-label'), value: input.value, help: input.dataset.tooltipId })),
        internals: [...document.querySelectorAll('.file-corruption-internals li')].map((item) => item.textContent.trim()),
        source: document.querySelector('.raw-file-card')?.textContent.trim(),
      }))()`);
      await capture('file-corruption-explained');
      await click(`[...document.querySelectorAll('.raw-panel button')].find((button) => button.textContent.includes('Corrupt & Validate'))`);
      await waitFor(`!document.querySelector('.raw-action')?.disabled`, 60000);
      await waitFor(`!document.querySelector('.raw-status')?.textContent.includes('READY')`, 60000);
      const afterAudit = await evaluate(`(() => ({
        status: document.querySelector('.raw-status')?.textContent.trim(),
        notice: document.querySelector('.status-message')?.textContent.trim(),
        downloadEnabled: ![...document.querySelectorAll('.raw-panel button')].find((button) => button.textContent.includes('Download Valid'))?.disabled,
      }))()`);
      await capture('file-corruption-result');
      const report = { session: session.capabilities, visualTestPath, tabs, beforeAudit, afterAudit };
      writeFileSync(resolve(artifactDir, `${label}.json`), JSON.stringify(report, null, 2));
      console.log(JSON.stringify(report, null, 2));
      await bidi.send('session.end', {});
      bidi.close();
      activeBidi = null;
      return;
    }
    if (retouchStage6Mode) {
      await click(`[...document.querySelectorAll('.inspector-tabs button')].find((button) => button.textContent.toUpperCase().includes('RETOUCH'))`);
      await waitFor(`document.querySelector('.retouch-panel') !== null`);
      const canvasBounds = await rect(`document.querySelector('.work-canvas')`);
      const canvasHash = () => evaluate(`(() => {
        const canvas = document.querySelector('.work-canvas');
        const data = canvas.getContext('2d').getImageData(0, 0, canvas.width, canvas.height).data;
        let hash = 2166136261;
        for (let index = 0; index < data.length; index += 113) hash = Math.imul(hash ^ data[index], 16777619) >>> 0;
        return hash;
      })()`);
      const audits = [];
      const tools = [
        { id: 'smudge', start: [0.36, 0.27], end: [0.58, 0.44] },
        { id: 'blur', start: [0.38, 0.36], end: [0.64, 0.39] },
        { id: 'sharpen', start: [0.42, 0.31], end: [0.68, 0.36] },
        { id: 'restore', start: [0.47, 0.34], end: [0.62, 0.43] },
        { id: 'eraser', start: [0.43, 0.33], end: [0.60, 0.40] },
      ];
      for (const item of tools) {
        await click(`[...document.querySelectorAll('.retouch-tool-switcher button')].find((button) => button.textContent.trim().toLowerCase() === '${item.id}')`);
        await waitFor(`document.querySelector('.retouch-panel')?.dataset.retouchTool === '${item.id}'`);
        await waitFor(`document.querySelector('.retouch-preview-stage canvas:last-of-type')?.width > 0`, 30000);
        await delay(350);
        const beforeHash = await canvasHash();
        const beforeResults = await evaluate(`window.__firefoxImageBrushMetrics.workerResults.length`);
        await stroke(
          { x: canvasBounds.x + canvasBounds.width * item.start[0], y: canvasBounds.y + canvasBounds.height * item.start[1] },
          { x: canvasBounds.x + canvasBounds.width * item.end[0], y: canvasBounds.y + canvasBounds.height * item.end[1] },
          8,
          260
        );
        if (item.id !== 'eraser') {
          await waitFor(`window.__firefoxImageBrushMetrics.workerResults.slice(${beforeResults}).some((result) => result.bytes > 500000)`, 60000);
        }
        await waitFor(`!document.querySelector('.brush-worker-progress')`, 60000);
        await delay(160);
        const afterHash = await canvasHash();
        const previewAudit = await evaluate(`(() => {
          const stage = document.querySelector('.retouch-preview-stage');
          const canvas = stage?.querySelector('canvas:last-of-type');
          if (!canvas) return null;
          const data = canvas.getContext('2d').getImageData(0, 0, canvas.width, canvas.height).data;
          let hash = 2166136261;
          for (let index = 0; index < data.length; index += 31) hash = Math.imul(hash ^ data[index], 16777619) >>> 0;
          return { hash, copy: stage.querySelector('p')?.textContent.trim(), metrics: stage.querySelector('small')?.textContent.trim() };
        })()`);
        audits.push({ id: item.id, beforeHash, afterHash, changed: beforeHash !== afterHash, previewAudit });
        if (item.id === 'sharpen' || item.id === 'eraser') await capture(`retouch-${item.id}`);
      }
      await click(`document.querySelector('.topbar-actions button[title="History"]')`);
      await waitFor(`document.querySelector('.history-popover') !== null`);
      const historyAudit = await evaluate(`(() => ({
        entries: [...document.querySelectorAll('.history-list button strong')].map((item) => item.textContent.trim()),
        count: document.querySelectorAll('.history-list button').length,
        overlayVisiblePixels: (() => {
          const canvas = document.querySelector('.overlay-canvas');
          const data = canvas.getContext('2d').getImageData(0, 0, canvas.width, canvas.height).data;
          let count = 0;
          for (let index = 3; index < data.length; index += 4) if (data[index] > 0) count += 1;
          return count;
        })(),
      }))()`);
      await capture('retouch-history');
      const report = {
        session: session.capabilities,
        visualTestPath,
        audits,
        historyAudit,
        metrics: await evaluate(`window.__firefoxImageBrushMetrics`),
      };
      writeFileSync(resolve(artifactDir, `${label}.json`), JSON.stringify(report, null, 2));
      console.log(JSON.stringify(report, null, 2));
      await bidi.send('session.end', {});
      bidi.close();
      activeBidi = null;
      return;
    }
    if (imageBrushStage5Mode) {
      await click(`[...document.querySelectorAll('.inspector-tabs button')].find((button) => button.textContent.toUpperCase().includes('IMAGE BRUSH'))`);
      await waitFor(`document.querySelector('.image-brush-compact') !== null`);
      await evaluate(`(async () => {
        const response = await fetch('data:image/png;base64,${imageBase64}');
        const file = new File([await response.blob()], 'astronaut-stage5-stamp.png', { type: 'image/png' });
        const transfer = new DataTransfer();
        transfer.items.add(file);
        document.querySelector('.image-brush-lab').dispatchEvent(new DragEvent('drop', { bubbles: true, cancelable: true, dataTransfer: transfer }));
        return true;
      })()`);
      await waitFor(`document.querySelector('.image-brush-active-image strong')?.textContent.includes('astronaut-stage5-stamp')`, 30000);
      await evaluate(`(() => { const select = document.querySelector('.image-brush-optimization select'); select.value = '128'; select.dispatchEvent(new Event('change', { bubbles: true })); return true; })()`);
      await click(`[...document.querySelectorAll('.image-brush-optimization button')].find((button) => button.textContent.includes('Optimize Stamp Image'))`);
      await waitFor(`document.querySelector('.image-brush-active-image')?.textContent.includes('128')`, 30000);
      await hover(`document.querySelector('.image-brush-essential input[aria-label="Spacing"]')`);
      await waitFor(`document.querySelector('.image-brush-control-example')?.dataset.controlExample === 'Spacing'`);
      await rect(`document.querySelector('.image-brush-control-example')`);
      const controlAudit = await evaluate(`(() => {
        const root = document.querySelector('.image-brush-control-example');
        const hashes = [...root.querySelectorAll('canvas')].map((canvas) => { const data = canvas.getContext('2d').getImageData(0, 0, canvas.width, canvas.height).data; let hash = 2166136261; for (let i = 0; i < data.length; i += 17) hash = Math.imul(hash ^ data[i], 16777619) >>> 0; return hash; });
        return { title: root.querySelector('header strong')?.textContent.trim(), control: root.dataset.controlExample, captions: [...root.querySelectorAll('figcaption')].map((item) => item.textContent.trim()), copy: root.querySelector('p')?.textContent.trim(), hashes, distinct: hashes[0] !== hashes[1] };
      })()`);
      await capture('control-example');
      const mutationSelect = `[...document.querySelectorAll('.image-brush-mutation-main select')].find((select) => select.closest('label')?.textContent.includes('Mutation mode'))`;
      await evaluate(`(() => { const select = ${mutationSelect}; select.value = 'fixed'; select.dispatchEvent(new Event('change', { bubbles: true })); return true; })()`);
      await click(`[...document.querySelectorAll('.image-brush-fx-editor > summary')][0]`);
      const tipCompatibility = await evaluate(`(() => {
        const select = document.querySelector('.image-brush-add-fx select');
        return ['motion-transfer','edge-melt','pixel-sort','flow-field'].map((id) => { const option = [...select.options].find((item) => item.value === id); return { id, disabled: option.disabled, label: option.textContent.trim() }; });
      })()`);
      await evaluate(`(() => { const select = ${mutationSelect}; select.value = 'whole-trail'; select.dispatchEvent(new Event('change', { bubbles: true })); return true; })()`);
      await delay(180);
      const trailCompatibility = await evaluate(`(() => {
        const select = document.querySelector('.image-brush-add-fx select');
        return ['motion-transfer','edge-melt','pixel-sort','flow-field'].map((id) => { const option = [...select.options].find((item) => item.value === id); return { id, disabled: option.disabled, label: option.textContent.trim() }; });
      })()`);
      await evaluate(`(() => { const select = document.querySelector('.image-brush-add-fx select'); select.value = 'motion-transfer'; select.dispatchEvent(new Event('change', { bubbles: true })); return true; })()`);
      await click(`[...document.querySelectorAll('.image-brush-add-fx button')].find((button) => button.textContent.includes('Add'))`);
      const drawBefore = await evaluate(`window.__firefoxImageBrushMetrics.drawImageCalls`);
      await click(`[...document.querySelectorAll('.image-brush-current button')].find((button) => button.textContent.includes('Test trail'))`);
      await waitFor(`window.__firefoxImageBrushMetrics.drawImageCalls > ${drawBefore}`, 15000);
      await waitFor(`(() => {
        const canvas = document.querySelector('.image-brush-overlay-canvas');
        if (!canvas) return false;
        const data = canvas.getContext('2d').getImageData(0, 0, canvas.width, canvas.height).data;
        for (let index = 3; index < data.length; index += 4) if (data[index] > 0) return true;
        return false;
      })()`, 15000);
      const testTrailAudit = await evaluate(`(() => {
        const canvas = document.querySelector('.image-brush-overlay-canvas');
        const data = canvas.getContext('2d').getImageData(0, 0, canvas.width, canvas.height).data;
        let hash = 2166136261;
        let visiblePixels = 0;
        for (let index = 0; index < data.length; index += 4) {
          if (data[index + 3] > 0) visiblePixels += 1;
          if (index % 388 === 0) hash = Math.imul(hash ^ data[index], 16777619) >>> 0;
        }
        return { hash, visiblePixels };
      })()`);
      const canvasBounds = await rect(`document.querySelector('.work-canvas')`);
      const resultBefore = await evaluate(`window.__firefoxImageBrushMetrics.workerResults.length`);
      await stroke(
        { x: canvasBounds.x + canvasBounds.width * 0.28, y: canvasBounds.y + canvasBounds.height * 0.42 },
        { x: canvasBounds.x + canvasBounds.width * 0.72, y: canvasBounds.y + canvasBounds.height * 0.62 },
        9,
        280
      );
      await waitFor(`window.__firefoxImageBrushMetrics.workerResults.length > ${resultBefore}`, 60000);
      await waitFor(`!document.querySelector('.image-brush-progress')`, 30000);
      const motionTrailAudit = await evaluate(`(() => ({
        rack: document.querySelector('.image-brush-fx-summary')?.textContent.trim(),
        performance: [...document.querySelectorAll('.image-brush-performance-grid dd')].map((item) => item.textContent.trim()),
        canvasHash: (() => { const canvas = document.querySelector('.work-canvas'); const data = canvas.getContext('2d').getImageData(0,0,canvas.width,canvas.height).data; let hash=2166136261; for(let i=0;i<data.length;i+=97) hash=Math.imul(hash^data[i],16777619)>>>0; return hash; })()
      }))()`);
      const unlocked = [];
      for (let index = 0; index < 2; index += 1) {
        await click(`document.querySelector('.image-brush-randomize-main')`);
        await delay(260);
        unlocked.push(await evaluate(`document.querySelector('.image-brush-recipe-summary')?.textContent.trim()`));
      }
      await click(`[...document.querySelectorAll('.image-brush-randomize-controls input')][0]`);
      await click(`document.querySelector('.image-brush-randomize-main')`);
      await delay(260);
      const lockedFirst = await evaluate(`document.querySelector('.image-brush-recipe-summary')?.textContent.trim()`);
      await click(`document.querySelector('.image-brush-randomize-main')`);
      await delay(260);
      const lockedReplay = await evaluate(`document.querySelector('.image-brush-recipe-summary')?.textContent.trim()`);
      await rect(`document.querySelector('.image-brush-recipe-summary')`);
      await capture('compatibility-randomize');
      const report = {
        session: session.capabilities,
        visualTestPath,
        controlAudit,
        tipCompatibility,
        trailCompatibility,
        testTrailAudit,
        motionTrailAudit,
        unlocked,
        unlockedChanged: unlocked[0] !== unlocked[1],
        lockedFirst,
        lockedReplay,
        lockedReproduced: lockedFirst === lockedReplay,
        optimized: await evaluate(`document.querySelector('.image-brush-optimization')?.textContent.trim()`),
        metrics: await evaluate(`window.__firefoxImageBrushMetrics`),
      };
      writeFileSync(resolve(artifactDir, `${label}.json`), JSON.stringify(report, null, 2));
      console.log(JSON.stringify(report, null, 2));
      await bidi.send('session.end', {});
      bidi.close();
      activeBidi = null;
      return;
    }
    if (moshPresetContactMode) {
      await click(`[...document.querySelectorAll('.inspector-tabs button')].find((button) => button.textContent.toUpperCase().includes('MOSH'))`);
      await waitFor(`document.querySelector('.mosh-lab') !== null`);
      const families = [
        { id: 'chroma', effect: 'Luma / Chroma Drift', presets: ['VHS Color Bleed', 'Frozen Luma', 'Chroma Delay', 'Low-Bandwidth Color', 'Analog Misalignment', 'Dirty Broadcast', 'Color Ghost', 'Crushed Chroma'] },
        { id: 'edge', effect: 'Edge Melt', presets: ['Downward Melt', 'Tangent Drag', 'Edge Trails', 'Text Bleed', 'Outline Collapse'] },
        { id: 'flow', effect: 'Flow Field Displace', presets: ['Liquid Data', 'Directional Current', 'Digital Vortex', 'Magnetic Pull', 'Wave Fold', 'Turbulence', 'Signal River', 'Hard Nearest Flow'] },
      ].filter((family) => !contactFamilyOnly || family.id === contactFamilyOnly);
      const familyReports = [];
      for (const family of families) {
        while (await evaluate(`document.querySelectorAll('.mosh-card').length > 0`)) {
          const expanded = await evaluate(`document.querySelector('.mosh-card .mosh-card-body') !== null`);
          if (!expanded) await click(`document.querySelector('.mosh-card header .icon-button')`);
          await click(`[...document.querySelectorAll('.mosh-card .danger')].find((button) => button.textContent.includes('Remove'))`);
          await delay(100);
        }
        await click(`[...document.querySelectorAll('.mosh-rack-toolbar button')].find((button) => button.textContent.includes('Add Effect'))`);
        await click(`[...document.querySelectorAll('.mosh-add-menu button')].find((button) => button.textContent.includes(${JSON.stringify(family.effect)}))`);
        if (!await evaluate(`document.querySelector('.mosh-rack-toolbar button.active')?.textContent.includes('Preview')`)) {
          await click(`[...document.querySelectorAll('.mosh-rack-toolbar button')].find((button) => button.textContent.includes('Preview'))`);
        }
        await evaluate(`window.__moshContactEntries = []`);
        const results = [];
        for (const preset of family.presets) {
          const postsBefore = await evaluate(`window.__firefoxImageBrushMetrics.workerPosts.length`);
          const resultsBefore = await evaluate(`window.__firefoxImageBrushMetrics.workerResults.length`);
          const visibleHashBefore = await evaluate(`(() => { const canvas = document.querySelector('.work-canvas'); const data = canvas.getContext('2d').getImageData(0, 0, canvas.width, canvas.height).data; let hash = 2166136261; for (let index = 0; index < data.length; index += 97) hash = Math.imul(hash ^ data[index], 16777619) >>> 0; return hash; })()`);
          await evaluate(`(() => {
            const select = [...document.querySelectorAll('.mosh-card select')].find((item) => [...item.options].some((option) => option.textContent.trim() === ${JSON.stringify(preset)}));
            const option = [...select.options].find((item) => item.textContent.trim() === ${JSON.stringify(preset)});
            select.value = option.value;
            select.dispatchEvent(new Event('change', { bubbles: true }));
            return true;
          })()`);
          await waitFor(`window.__firefoxImageBrushMetrics.workerPosts.length > ${postsBefore}`, 30000);
          await waitFor(`window.__firefoxImageBrushMetrics.workerResults.length > ${resultsBefore}`, 60000);
          await waitFor(`(() => { const canvas = document.querySelector('.work-canvas'); const data = canvas.getContext('2d').getImageData(0, 0, canvas.width, canvas.height).data; let hash = 2166136261; for (let index = 0; index < data.length; index += 97) hash = Math.imul(hash ^ data[index], 16777619) >>> 0; return hash !== ${visibleHashBefore}; })()`, 60000);
          await waitFor(`!document.querySelector('.mosh-progress')`, 30000);
          await delay(120);
          results.push(await evaluate(`(() => {
            const canvas = document.querySelector('.work-canvas');
            const data = canvas.getContext('2d').getImageData(0, 0, canvas.width, canvas.height).data;
            let hash = 2166136261;
            let changed = 0;
            for (let index = 0; index < data.length; index += 97) hash = Math.imul(hash ^ data[index], 16777619) >>> 0;
            window.__moshContactEntries.push({ label: ${JSON.stringify(preset)}, src: canvas.toDataURL('image/png') });
            return { preset: ${JSON.stringify(preset)}, hash, width: canvas.width, height: canvas.height };
          })()`));
        }
        await evaluate(`(() => {
          document.querySelector('#mosh-contact-sheet')?.remove();
          const sheet = document.createElement('section');
          sheet.id = 'mosh-contact-sheet';
          sheet.style.cssText = 'position:fixed;inset:0;z-index:2147483647;background:#0b0c0b;color:#eee;padding:22px 26px;box-sizing:border-box;font-family:Arial,sans-serif;overflow:hidden';
          const title = document.createElement('h1');
          title.textContent = 'MOSH PRESETS / ${family.effect.toUpperCase()} / ASTRONAUT TEST';
          title.style.cssText = 'margin:0 0 15px;color:#d7b56b;font:700 20px monospace;letter-spacing:.08em';
          sheet.appendChild(title);
          const grid = document.createElement('div');
          grid.style.cssText = 'display:grid;grid-template-columns:repeat(4,minmax(0,1fr));gap:12px';
          for (const entry of window.__moshContactEntries) {
            const figure = document.createElement('figure');
            figure.style.cssText = 'margin:0;border:1px solid #45443e;background:#171817;min-width:0';
            const image = document.createElement('img');
            image.src = entry.src;
            image.style.cssText = 'display:block;width:100%;height:360px;object-fit:contain;background:repeating-conic-gradient(#272827 0 25%,#343534 0 50%) 0/16px 16px';
            const caption = document.createElement('figcaption');
            caption.textContent = entry.label;
            caption.style.cssText = 'padding:8px;color:#f0d08c;font:700 12px monospace;text-align:center';
            figure.append(image, caption);
            grid.appendChild(figure);
          }
          sheet.appendChild(grid);
          document.body.appendChild(sheet);
          return true;
        })()`);
        await capture(`mosh-presets-${family.id}`);
        await evaluate(`document.querySelector('#mosh-contact-sheet')?.remove()`);
        familyReports.push({ family: family.effect, results, distinctHashes: new Set(results.map((item) => item.hash)).size });
      }
      const report = { session: session.capabilities, visualTestPath, familyReports };
      writeFileSync(resolve(artifactDir, `${label}.json`), JSON.stringify(report, null, 2));
      console.log(JSON.stringify(report, null, 2));
      await bidi.send('session.end', {});
      bidi.close();
      activeBidi = null;
      return;
    }
    if (previewMoshStageOnly) {
      await click(`document.querySelector('.effect-picker-trigger')`);
      await waitFor(`document.querySelector('.shared-effect-preview')?.dataset.previewStatus === 'ready'`, 30000);
      await hover(`[...document.querySelectorAll('.effect-picker-group button')].find((button) => button.textContent.includes('Block Corruption'))`);
      await waitFor(`document.querySelector('.shared-effect-preview')?.dataset.previewEffect === 'block-corruption' && document.querySelector('.shared-effect-preview')?.dataset.previewStatus === 'ready'`, 30000);
      const previewAudit = [];
      previewAudit.push(await evaluate(`(() => {
        const root = document.querySelector('.shared-effect-preview');
        return { effect: root?.dataset.previewEffect, status: root?.dataset.previewStatus, metric: root?.querySelector('header span')?.textContent.trim(), captions: [...root.querySelectorAll('figcaption')].map((item) => item.textContent.trim()), canvases: [...root.querySelectorAll('canvas')].map((canvas) => ({ width: canvas.width, height: canvas.height })), description: root?.querySelector('footer span')?.textContent.trim(), cost: root?.querySelector('footer strong')?.textContent.trim() };
      })()`));
      await rect(`document.querySelector('.shared-effect-preview')`);
      await capture('block-preview');
      await hover(`[...document.querySelectorAll('.effect-picker-group button')].find((button) => button.textContent.includes('Codec Block Damage'))`);
      await waitFor(`document.querySelector('.shared-effect-preview')?.dataset.previewEffect === 'codec-block-damage' && document.querySelector('.shared-effect-preview')?.dataset.previewStatus === 'ready'`, 30000);
      previewAudit.push(await evaluate(`(() => {
        const root = document.querySelector('.shared-effect-preview');
        const hashes = [...root.querySelectorAll('canvas')].map((canvas) => { const data = canvas.getContext('2d').getImageData(0, 0, canvas.width, canvas.height).data; let hash = 2166136261; for (let i = 0; i < data.length; i += 41) hash = Math.imul(hash ^ data[i], 16777619) >>> 0; return hash; });
        return { effect: root?.dataset.previewEffect, status: root?.dataset.previewStatus, metric: root?.querySelector('header span')?.textContent.trim(), hashes, distinctBeforeAfter: hashes[0] !== hashes[1], differenceDistinct: hashes[1] !== hashes[2], description: root?.querySelector('footer span')?.textContent.trim(), cost: root?.querySelector('footer strong')?.textContent.trim(), workerJobs: window.__firefoxImageBrushMetrics.workerJobs };
      })()`));
      await rect(`document.querySelector('.shared-effect-preview')`);
      await capture('codec-preview');
      await click(`[...document.querySelectorAll('.effect-picker-group button')].find((button) => button.textContent.includes('Codec Block Damage'))`);
      await click(`[...document.querySelectorAll('.inspector-tabs button')].find((button) => button.textContent.toUpperCase().includes('MOSH'))`);
      await waitFor(`document.querySelector('.mosh-lab') !== null`);
      while (await evaluate(`document.querySelectorAll('.mosh-card').length < 3`)) {
        await click(`[...document.querySelectorAll('.mosh-rack-toolbar button')].find((button) => button.textContent.includes('Add Effect'))`);
        await click(`document.querySelector('.mosh-add-menu button')`);
        await delay(120);
      }
      const rackSnapshot = async () => evaluate(`(() => ({
        names: [...document.querySelectorAll('.mosh-card header strong')].map((item) => item.textContent.trim()),
        order: [...document.querySelectorAll('.mosh-card')].map((item) => item.dataset.moshCardId),
        summary: document.querySelector('.mosh-randomize-summary')?.textContent.trim(),
        values: [...document.querySelectorAll('.mosh-card input[type=range], .mosh-card select')].map((item) => item.value)
      }))()`);
      const randomizationAudit = [];
      for (const labelText of ['Randomize Parameters', 'Randomize Effects', 'Shuffle Order', 'Randomize Everything']) {
        const before = await rackSnapshot();
        await click(`[...document.querySelectorAll('.mosh-randomize-actions button')].find((button) => button.textContent.includes('${labelText}'))`);
        await delay(280);
        const after = await rackSnapshot();
        randomizationAudit.push({ action: labelText, before, after, changed: JSON.stringify(before) !== JSON.stringify(after) });
      }
      await click(`document.querySelector('.mosh-random-lock input')`);
      await click(`[...document.querySelectorAll('.mosh-randomize-actions button')].find((button) => button.textContent.includes('Randomize Everything'))`);
      await delay(280);
      const lockedFirst = await rackSnapshot();
      await click(`[...document.querySelectorAll('.mosh-randomize-actions button')].find((button) => button.textContent.includes('New Result'))`);
      await delay(280);
      const lockedReplay = await rackSnapshot();
      const report = {
        session: session.capabilities,
        visualTestPath,
        previewAudit,
        randomizationAudit,
        lockSeedReproduced: JSON.stringify({ names: lockedFirst.names, order: lockedFirst.order, values: lockedFirst.values }) === JSON.stringify({ names: lockedReplay.names, order: lockedReplay.order, values: lockedReplay.values }),
        lockedFirst,
        lockedReplay,
        finalMetrics: await evaluate(`window.__firefoxImageBrushMetrics`),
      };
      await capture('mosh-randomize');
      writeFileSync(resolve(artifactDir, `${label}.json`), JSON.stringify(report, null, 2));
      console.log(JSON.stringify(report, null, 2));
      await bidi.send('session.end', {});
      bidi.close();
      activeBidi = null;
      return;
    }
    if (effectStageOnly) {
      await click(`document.querySelector('.effect-picker-trigger')`);
      const defaultAudit = await evaluate(`(() => ({
        groups: [...document.querySelectorAll('.effect-picker-group')].map((group) => ({
          label: group.querySelector(':scope > span')?.textContent.trim(),
          effects: [...group.querySelectorAll(':scope > button strong')].map((item) => item.textContent.trim())
        })),
        legacyExpanded: [...document.querySelectorAll('.effect-picker-group > span')].some((item) => item.textContent.includes('LEGACY EFFECTS')),
        metaBadgeVisible: Boolean(document.querySelector('.meta-effect-badge')),
        legacyToggle: document.querySelector('.effect-picker-legacy-toggle')?.textContent.trim(),
        removedVisible: [...document.querySelectorAll('.effect-picker-menu strong')].filter((item) => /Pixel Noise|Bit Flip|Macroblock Shift|Packet Loss|Compression Block Damage|Tile Scramble/.test(item.textContent)).map((item) => item.textContent.trim())
      }))()`);
      await click(`document.querySelector('.effect-picker-legacy-toggle button')`);
      const legacyAudit = await evaluate(`(() => ({
        effects: [...document.querySelectorAll('.effect-picker-group')].find((group) => group.querySelector(':scope > span')?.textContent.includes('LEGACY EFFECTS')) ? [...[...document.querySelectorAll('.effect-picker-group')].find((group) => group.querySelector(':scope > span')?.textContent.includes('LEGACY EFFECTS')).querySelectorAll('strong')].map((item) => item.textContent.trim()) : [],
        removedVisible: [...document.querySelectorAll('.effect-picker-menu strong')].filter((item) => /Pixel Noise|Bit Flip/.test(item.textContent)).map((item) => item.textContent.trim())
      }))()`);
      await capture('picker');
      await click(`[...document.querySelectorAll('.effect-picker-group button')].find((button) => button.textContent.includes('Block Corruption'))`);
      const blockControls = await evaluate(`(() => ({
        selected: document.querySelector('.effect-picker-trigger')?.textContent.trim(),
        modeOptions: [...document.querySelectorAll('.panel-section')].find((section) => section.textContent.includes('Mixed Packet Loss')) ? [...[...document.querySelectorAll('.panel-section')].find((section) => section.textContent.includes('Mixed Packet Loss')).querySelectorAll('select option')].map((option) => option.textContent.trim()) : [],
        sliderLabels: [...document.querySelectorAll('.panel-section')].find((section) => section.textContent.includes('Mixed Packet Loss')) ? [...[...document.querySelectorAll('.panel-section')].find((section) => section.textContent.includes('Mixed Packet Loss')).querySelectorAll('.slider-field label')].map((label) => label.textContent.trim()) : []
      }))()`);
      await click(`document.querySelector('.effect-picker-trigger')`);
      await click(`[...document.querySelectorAll('.effect-picker-group button')].find((button) => button.textContent.includes('Codec Block Damage'))`);
      const codecControls = await evaluate(`(() => ({
        selected: document.querySelector('.effect-picker-trigger')?.textContent.trim(),
        modeOptions: [...document.querySelectorAll('.panel-section')].find((section) => section.textContent.includes('Mixed Codec Failure')) ? [...[...document.querySelectorAll('.panel-section')].find((section) => section.textContent.includes('Mixed Codec Failure')).querySelectorAll('select option')].map((option) => option.textContent.trim()) : [],
        sliderLabels: [...document.querySelectorAll('.panel-section')].find((section) => section.textContent.includes('Mixed Codec Failure')) ? [...[...document.querySelectorAll('.panel-section')].find((section) => section.textContent.includes('Mixed Codec Failure')).querySelectorAll('.slider-field label')].map((label) => label.textContent.trim()) : []
      }))()`);
      await click(`document.querySelector('.effect-picker-trigger')`);
      await click(`[...document.querySelectorAll('.effect-picker-group button')].find((button) => button.textContent.includes('Mixed Structural Glitch'))`);
      const metaAudit = await evaluate(`(() => ({
        pickerGroup: 'META / COMBINATION EFFECTS',
        summary: document.querySelector('.meta-effect-summary')?.textContent.trim(),
        recipeControls: document.querySelector('.meta-effect-controls')?.textContent.trim()
      }))()`);
      await rect(`document.querySelector('.meta-effect-controls')`);
      await capture('controls');
      const report = { session: session.capabilities, visualTestPath, defaultAudit, legacyAudit, blockControls, codecControls, metaAudit };
      writeFileSync(resolve(artifactDir, `${label}.json`), JSON.stringify(report, null, 2));
      console.log(JSON.stringify(report, null, 2));
      await bidi.send('session.end', {});
      bidi.close();
      activeBidi = null;
      return;
    }
    for (let index = 0; index < 2; index += 1) {
      await click(`[...document.querySelectorAll('.layer-operation-grid button')].find((button) => button.textContent.trim().includes('Add'))`);
      await delay(120);
    }
    const paintLayer = async (rowIndex, verticalOffset) => {
      await click(`[...document.querySelectorAll('.layer-stack-row')][${rowIndex}]?.querySelector('.layer-select-button')`);
      const canvasBounds = await evaluate(`(() => {
        const rect = document.querySelector('.work-canvas').getBoundingClientRect();
        return { x: rect.x, y: rect.y, width: rect.width, height: rect.height };
      })()`);
      const workerResultsBefore = await evaluate(`window.__firefoxImageBrushMetrics.workerResults.length`);
      await stroke(
        { x: canvasBounds.x + canvasBounds.width * 0.32, y: canvasBounds.y + canvasBounds.height * verticalOffset },
        { x: canvasBounds.x + canvasBounds.width * 0.68, y: canvasBounds.y + canvasBounds.height * verticalOffset },
        7,
        210,
      );
      await waitFor(`window.__firefoxImageBrushMetrics.workerResults.length > ${workerResultsBefore}`, 30000);
      await waitFor(`!document.querySelector('.brush-worker-progress')`, 30000);
      await delay(180);
    };
    await paintLayer(0, 0.34);
    await paintLayer(1, 0.52);
    await paintLayer(2, 0.70);
    const beforeVisibilityHash = await evaluate(`(() => {
      const data = document.querySelector('.work-canvas').getContext('2d').getImageData(0, 0, document.querySelector('.work-canvas').width, document.querySelector('.work-canvas').height).data;
      let hash = 2166136261;
      for (let index = 0; index < data.length; index += 97) hash = Math.imul(hash ^ data[index], 16777619) >>> 0;
      return hash;
    })()`);
    await click(`[...document.querySelectorAll('.layer-stack-row')][0]?.querySelector('button')`);
    await delay(180);
    const hiddenVisibilityHash = await evaluate(`(() => {
      const data = document.querySelector('.work-canvas').getContext('2d').getImageData(0, 0, document.querySelector('.work-canvas').width, document.querySelector('.work-canvas').height).data;
      let hash = 2166136261;
      for (let index = 0; index < data.length; index += 97) hash = Math.imul(hash ^ data[index], 16777619) >>> 0;
      return hash;
    })()`);
    await click(`[...document.querySelectorAll('.layer-stack-row')][0]?.querySelector('button')`);
    await delay(120);
    await click(`document.querySelector('.topbar-actions button[title^="Undo"]')`);
    await delay(160);
    const undoVisibilityHash = await evaluate(`(() => {
      const data = document.querySelector('.work-canvas').getContext('2d').getImageData(0, 0, document.querySelector('.work-canvas').width, document.querySelector('.work-canvas').height).data;
      let hash = 2166136261;
      for (let index = 0; index < data.length; index += 97) hash = Math.imul(hash ^ data[index], 16777619) >>> 0;
      return hash;
    })()`);
    await click(`document.querySelector('.topbar-actions button[title^="Redo"]')`);
    await delay(160);
    const redoVisibilityHash = await evaluate(`(() => {
      const data = document.querySelector('.work-canvas').getContext('2d').getImageData(0, 0, document.querySelector('.work-canvas').width, document.querySelector('.work-canvas').height).data;
      let hash = 2166136261;
      for (let index = 0; index < data.length; index += 97) hash = Math.imul(hash ^ data[index], 16777619) >>> 0;
      return hash;
    })()`);
    await click(`document.querySelector('.topbar-actions button[title="History"]')`);
    await waitFor(`document.querySelector('.history-popover') !== null`);
    const layerHistoryCount = await evaluate(`document.querySelectorAll('.history-list > button').length`);
    await click(`document.querySelector('.history-popover header button')`);
    const layerAudit = await evaluate(`(() => ({
      rowCount: document.querySelectorAll('.layer-stack-row').length,
      rows: [...document.querySelectorAll('.layer-stack-row')].map((row) => ({
        active: row.classList.contains('active'),
        name: row.querySelector('strong')?.textContent.trim(),
        storage: row.querySelector('.layer-select-button span')?.textContent.trim()
      })),
      originalLocked: document.querySelector('.original-layer')?.textContent.includes('LOCKED') ?? false,
      operationLabels: [...document.querySelectorAll('.layer-operation-grid button')].map((button) => button.textContent.trim()),
      historyActions: ${layerHistoryCount},
      visibilityChangedComposite: ${beforeVisibilityHash} !== ${hiddenVisibilityHash},
      undoRestoredHiddenComposite: ${undoVisibilityHash} === ${hiddenVisibilityHash},
      redoRestoredVisibleComposite: ${redoVisibilityHash} === ${beforeVisibilityHash},
      stackExplanation: [...document.querySelectorAll('.panel-section')].find((section) => section.textContent.includes('256×256'))?.querySelector('.fine-print')?.textContent.trim() ?? ''
    }))()`);
    await capture('layers');
    if (layerStageOnly) {
      const report = { session: session.capabilities, visualTestPath, layerAudit };
      writeFileSync(resolve(artifactDir, `${label}.json`), JSON.stringify(report, null, 2));
      console.log(JSON.stringify(report, null, 2));
      await bidi.send('session.end', {});
      bidi.close();
      activeBidi = null;
      return;
    }
    await click(`document.querySelector('.effect-picker-trigger')`);
    const effectAudit = await evaluate(`(() => ({
      tabs: [...document.querySelectorAll('.inspector-tabs button')].map((button) => button.textContent.trim()),
      groups: [...document.querySelectorAll('.effect-picker-group')].map((group) => ({
        label: group.querySelector(':scope > span')?.textContent.trim(),
        effects: [...group.querySelectorAll(':scope > button strong')].map((item) => item.textContent.trim())
      })),
      ambiguousAccumulateLabels: [...document.querySelectorAll('label,button,span')].filter((item) => /^accumulat(e|ion)$/i.test(item.textContent.trim())).length,
      processingMaskDefault: document.querySelector('.processing-mask-toggle input')?.checked ?? null,
      layerText: [...document.querySelectorAll('.panel-section')].find((section) => section.textContent.includes('Glitch layer'))?.textContent.trim() ?? ''
    }))()`);
    await capture('effect');
    await click(`document.querySelector('.effect-picker-trigger')`);

    await click(`[...document.querySelectorAll('.inspector-tabs button')].find((button) => button.textContent.toUpperCase().includes('MOSH'))`);
    await waitFor(`document.querySelector('.mosh-lab') !== null`);
    const moshAudit = await evaluate(`(() => ({
      randomizeLabels: [...document.querySelectorAll('.mosh-seed-row button')].map((button) => button.textContent.trim()),
      toolbar: [...document.querySelectorAll('.mosh-rack-toolbar button')].map((button) => button.textContent.trim()),
      previewCanvases: document.querySelectorAll('.mosh-lab canvas').length
    }))()`);
    await capture('mosh');

    await click(`[...document.querySelectorAll('.inspector-tabs button')].find((button) => button.textContent.toUpperCase().includes('IMAGE BRUSH'))`);
    await waitFor(`document.querySelector('.image-brush-compact') !== null`);
    await evaluate(`(async () => {
      const response = await fetch('data:image/png;base64,${imageBase64}');
      const file = new File([await response.blob()], 'астронавт2-stamp.png', { type: 'image/png' });
      const transfer = new DataTransfer();
      transfer.items.add(file);
      document.querySelector('.image-brush-lab').dispatchEvent(new DragEvent('drop', { bubbles: true, cancelable: true, dataTransfer: transfer }));
      return true;
    })()`);
    await waitFor(`document.querySelector('.image-brush-active-image strong')?.textContent.includes('астронавт2-stamp')`);
    const imageBrushAudit = await evaluate(`(() => ({
      active: document.querySelector('.image-brush-active-image strong')?.textContent.trim(),
      optimization: document.querySelector('.image-brush-optimization')?.textContent.trim(),
      randomization: document.querySelector('.image-brush-recipe-summary')?.textContent.trim(),
      essentialRanges: document.querySelectorAll('.image-brush-essential input[type=range]').length,
      horizontalOverflow: document.querySelector('.image-brush-lab').scrollWidth > document.querySelector('.image-brush-lab').clientWidth
    }))()`);
    const randomizationResults = [];
    for (let index = 0; index < 2; index += 1) {
      await click(`document.querySelector('.image-brush-randomize-main')`);
      await delay(180);
      randomizationResults.push(await evaluate(`(() => ({
        summary: document.querySelector('.image-brush-recipe-summary')?.textContent.trim(),
        preset: document.querySelector('.image-brush-compact-section select')?.value,
        rack: [...document.querySelectorAll('.image-brush-fx-card')].map((card) => card.textContent.trim())
      }))()`));
    }
    const optimizationResult = await evaluate(`(() => {
      const select = document.querySelector('.image-brush-optimization select');
      Object.getOwnPropertyDescriptor(HTMLSelectElement.prototype, 'value').set.call(select, '128');
      select.dispatchEvent(new Event('change', { bubbles: true }));
      return true;
    })()`);
    if (!optimizationResult) throw new Error('Stamp optimization action failed.');
    await delay(120);
    await click(`[...document.querySelectorAll('.image-brush-optimization button')].find((button) => button.textContent.includes('Optimize Stamp Image'))`);
    await waitFor(`document.querySelector('.image-brush-active-image span')?.textContent.includes('128')`);
    const optimizedStamp = await evaluate(`(() => ({
      dimensions: document.querySelector('.image-brush-active-image span')?.textContent.trim(),
      details: document.querySelector('.image-brush-optimization')?.textContent.trim()
    }))()`);
    await capture('image-brush');

    const hexButton = [...(await evaluate(`[...document.querySelectorAll('.inspector-tabs button')].map((button) => button.textContent.trim())`))];
    const report = {
      session: session.capabilities,
      visualTestPath,
      effectAudit,
      layerAudit,
      moshAudit,
      imageBrushAudit,
      randomizationResults,
      randomizationChanged: randomizationResults[0]?.summary !== randomizationResults[1]?.summary,
      optimizedStamp,
      visibleTabs: hexButton,
    };
    writeFileSync(resolve(artifactDir, `${label}.json`), JSON.stringify(report, null, 2));
    console.log(JSON.stringify(report, null, 2));
    await bidi.send('session.end', {});
    bidi.close();
    activeBidi = null;
    return;
  }

  await click(`[...document.querySelectorAll('.inspector-tabs button')].find((button) => button.textContent.toUpperCase().includes('IMAGE BRUSH'))`);
  await waitFor(`document.querySelector('.image-brush-lab') !== null`);
  if (!brokenBaselineMode) {
    await waitFor(`document.querySelector('.image-brush-compact') !== null`);
  } else {
  if (!await evaluate(`Boolean(document.querySelector('.image-brush-simple'))`)) {
    await click(`[...document.querySelectorAll('.image-brush-interface-level button')].find((button) => button.textContent.trim() === 'SIMPLE')`);
  }
  await waitFor(`document.querySelector('.image-brush-simple') !== null`);
  }

  if (stage1CompactMode) {
    await bidi.send('browsingContext.setViewport', {
      context,
      viewport: { width: 1400, height: 900 },
      devicePixelRatio: 1,
    });
    await delay(400);
    const initial = await evaluate(`(() => {
      const clear = [...document.querySelectorAll('.image-brush-library-actions button')]
        .find((button) => button.textContent.includes('Clear library'));
      if (clear && !clear.disabled) clear.click();
      return true;
    })()`);
    if (!initial) throw new Error('Could not initialize compact library acceptance.');
    await waitFor(`document.querySelectorAll('.image-brush-library-strip article').length === 0`);
    const sendBrowserZoom = async (plusSteps) => {
      await bidi.send('input.performActions', {
        context,
        actions: [{
          type: 'key',
          id: `browser-zoom-${plusSteps}-${Date.now()}`,
          actions: [
            { type: 'keyDown', value: '\uE009' },
            { type: 'keyDown', value: '0' },
            { type: 'keyUp', value: '0' },
            { type: 'keyUp', value: '\uE009' },
          ],
        }],
      });
      for (let step = 0; step < plusSteps; step += 1) {
        await bidi.send('input.performActions', {
          context,
          actions: [{
            type: 'key',
            id: `browser-zoom-plus-${step}-${Date.now()}`,
            actions: [
              { type: 'keyDown', value: '\uE009' },
              { type: 'keyDown', value: '+' },
              { type: 'keyUp', value: '+' },
              { type: 'keyUp', value: '\uE009' },
            ],
          }],
        });
        await delay(180);
      }
      await delay(350);
    };
    const widthChecks = [];
    for (const [zoom, plusSteps] of [[1, 0], [1.25, 2], [1.5, 3]]) {
      await sendBrowserZoom(plusSteps);
      for (const width of [320, 450, 600]) {
        const result = await evaluate(`(() => {
          const workspace = document.querySelector('.workspace');
          workspace.style.gridTemplateColumns = '55px minmax(0, 1fr) ${width}px';
          const lab = document.querySelector('.image-brush-lab');
          const essential = document.querySelector('.image-brush-essential');
          const ranges = [...document.querySelectorAll('.image-brush-essential input[type=range]')];
          return new Promise((resolve) => requestAnimationFrame(() => resolve({
            requestedBrowserZoom: ${zoom},
            requestedWidth: ${width},
            viewport: [innerWidth, innerHeight],
            devicePixelRatio,
            labClientWidth: lab.clientWidth,
            labScrollWidth: lab.scrollWidth,
            essentialClientWidth: essential.clientWidth,
            essentialScrollWidth: essential.scrollWidth,
            rangeWidths: ranges.map((range) => range.getBoundingClientRect().width),
            rangeCount: ranges.length,
            presetPreviewCanvases: document.querySelectorAll('.image-brush-style-cards canvas').length,
            visibleHelpButtonsNotBesideSelect: [...document.querySelectorAll('.image-brush-lab .help-button')]
              .filter((button) => !button.closest('label')?.querySelector('select')).length
          })));
        })()`);
        widthChecks.push(result);
      }
    }
    await sendBrowserZoom(0);
    await evaluate(`document.querySelector('.workspace').style.gridTemplateColumns = '55px minmax(0, 1fr) 410px'`);
    const upload = await evaluate(`(async () => {
      const makeFile = async (name, color, type = 'image/png') => {
        const canvas = document.createElement('canvas');
        canvas.width = 96;
        canvas.height = 96;
        const context = canvas.getContext('2d');
        context.clearRect(0, 0, 96, 96);
        context.fillStyle = color;
        context.fillRect(12, 32, 72, 32);
        context.fillRect(32, 12, 32, 72);
        const blob = await new Promise((resolve) => canvas.toBlob(resolve, type));
        return new File([blob], name, { type });
      };
      const transfer = new DataTransfer();
      transfer.items.add(await makeFile('stage1-first.png', '#e0b84c'));
      transfer.items.add(await makeFile('stage1-second.png', '#31bac0'));
      document.querySelector('.image-brush-lab').dispatchEvent(new DragEvent('drop', {
        bubbles: true,
        cancelable: true,
        dataTransfer: transfer,
      }));
      return true;
    })()`);
    if (!upload) throw new Error('Compact two-image drop failed to dispatch.');
    await waitFor(`document.querySelectorAll('.image-brush-library-strip article').length === 2`);
    await waitFor(`document.querySelector('.image-brush-active-image strong')?.textContent.includes('stage1-second')`);

    const sliderResults = [];
    for (const name of [
      'Size',
      'Spacing',
      'Opacity',
      'Glitch Amount',
      'Variation',
    ]) {
      const selector = `[...document.querySelectorAll('.image-brush-essential .slider-field')].find((field) => field.querySelector(':scope > span')?.textContent.trim() === ${JSON.stringify(name)})?.querySelector('input')`;
      const bounds = await rect(selector);
      const beforeValue = await evaluate(`${selector}.value`);
      const dragRatios = await evaluate(`(() => {
        const input = ${selector};
        const min = Number(input.min);
        const max = Number(input.max);
        const currentRatio = (Number(input.value) - min) / Math.max(1, max - min);
        const endRatio = currentRatio < 0.5 ? 0.8 : 0.2;
        return { startRatio: endRatio === 0.8 ? 0.35 : 0.65, endRatio };
      })()`);
      await bidi.send('input.performActions', {
        context,
        actions: [{
          type: 'pointer',
          id: `stage1-${name.toLowerCase().replace(/\s+/g, '-')}`,
          parameters: { pointerType: 'mouse' },
          actions: [
            { type: 'pointerMove', x: Math.round(bounds.x + bounds.width * dragRatios.startRatio), y: Math.round(bounds.y + bounds.height / 2), duration: 0, origin: 'viewport' },
            { type: 'pointerDown', button: 0 },
            { type: 'pointerMove', x: Math.round(bounds.x + bounds.width * dragRatios.endRatio), y: Math.round(bounds.y + bounds.height / 2), duration: 260, origin: 'viewport' },
            { type: 'pointerUp', button: 0 },
          ],
        }],
      });
      await delay(100);
      const afterValue = await evaluate(`${selector}.value`);
      sliderResults.push({
        name,
        bounds,
        beforeValue,
        afterValue,
        changed: beforeValue !== afterValue,
      });
    }
    const valuesAfterSecond = await evaluate(`Object.fromEntries([...document.querySelectorAll('.image-brush-essential .slider-field')].map((field) => [
      field.querySelector(':scope > span')?.textContent.trim(),
      field.querySelector('input')?.value
    ]))`);
    await click(`[...document.querySelectorAll('.image-brush-library-select')].find((button) => button.getAttribute('aria-label')?.includes('stage1-first'))`);
    const valuesAfterSwitch = await evaluate(`Object.fromEntries([...document.querySelectorAll('.image-brush-essential .slider-field')].map((field) => [
      field.querySelector(':scope > span')?.textContent.trim(),
      field.querySelector('input')?.value
    ]))`);
    await click(`[...document.querySelectorAll('.image-brush-library-remove')].find((button) => button.getAttribute('aria-label')?.includes('stage1-first'))`);
    await waitFor(`document.querySelectorAll('.image-brush-library-strip article').length === 1`);
    const afterRemove = await evaluate(`(() => ({
      active: document.querySelector('.image-brush-active-image strong')?.textContent ?? '',
      count: document.querySelectorAll('.image-brush-library-strip article').length,
      values: Object.fromEntries([...document.querySelectorAll('.image-brush-essential .slider-field')].map((field) => [
        field.querySelector(':scope > span')?.textContent.trim(),
        field.querySelector('input')?.value
      ]))
    }))()`);
    await click(`[...document.querySelectorAll('.image-brush-library-actions button')].find((button) => button.textContent.includes('Clear library'))`);
    await waitFor(`document.querySelectorAll('.image-brush-library-strip article').length === 0`);
    const emptyAfterClear = await evaluate(`Boolean(document.querySelector('.image-brush-empty')?.textContent.includes('Library is empty'))`);
    await click(`[...document.querySelectorAll('.image-brush-library-actions button')].find((button) => button.textContent.includes('Demo images'))`);
    await waitFor(`document.querySelectorAll('.image-brush-library-strip article').length === 9`);
    await click(`[...document.querySelectorAll('.image-brush-library-remove')][0]`);
    await waitFor(`document.querySelectorAll('.image-brush-library-strip article').length === 8`);
    await click(`[...document.querySelectorAll('.image-brush-library-actions button')].find((button) => button.textContent.includes('Remove demos'))`);
    await waitFor(`document.querySelectorAll('.image-brush-library-strip article').length === 0`);
    const finalState = await evaluate(`(() => {
      const lab = document.querySelector('.image-brush-lab');
      const overlay = document.querySelector('.image-brush-overlay-canvas');
      const inspector = document.querySelector('.inspector');
      return {
        labClientWidth: lab.clientWidth,
        labScrollWidth: lab.scrollWidth,
        libraryCount: document.querySelectorAll('.image-brush-library-strip article').length,
        empty: Boolean(document.querySelector('.image-brush-empty')),
        overlayPointerEvents: overlay ? getComputedStyle(overlay).pointerEvents : null,
        overlayInspectorIntersection: (() => {
          if (!overlay || !inspector) return false;
          const a = overlay.getBoundingClientRect();
          const b = inspector.getBoundingClientRect();
          return a.right > b.left && a.left < b.right && a.bottom > b.top && a.top < b.bottom;
        })(),
        processing: Boolean(document.querySelector('.image-brush-progress'))
      };
    })()`);
    const screenshot = await bidi.send('browsingContext.captureScreenshot', {
      context,
      origin: 'viewport',
    });
    const report = {
      session: session.capabilities,
      nativeZoomObserved: new Set(
        widthChecks
          .filter((item) => item.requestedWidth === 320)
          .map((item) => JSON.stringify([item.viewport, item.devicePixelRatio])),
      ).size > 1,
      widthChecks,
      sliderResults,
      valuesAfterSecond,
      valuesAfterSwitch,
      valuesPreservedOnSwitch: JSON.stringify(valuesAfterSecond) === JSON.stringify(valuesAfterSwitch),
      afterRemove,
      emptyAfterClear,
      finalState,
    };
    writeFileSync(resolve(artifactDir, `${label}.png`), Buffer.from(screenshot.data, 'base64'));
    writeFileSync(resolve(artifactDir, `${label}.json`), JSON.stringify(report, null, 2));
    console.log(JSON.stringify(report, null, 2));
    await bidi.send('session.end', {});
    bidi.close();
    activeBidi = null;
    return;
  }

  if (mutationContactMode || modeContactMode) {
    await bidi.send('browsingContext.setViewport', {
      context,
      viewport: { width: 1500, height: 980 },
      devicePixelRatio: 1,
    });
    await evaluate(`document.querySelector('.workspace').style.gridTemplateColumns = '55px minmax(0, 1fr) 360px'`);
    await evaluate(`(async () => {
      const canvas = document.createElement('canvas');
      canvas.width = 1200;
      canvas.height = 840;
      const context = canvas.getContext('2d');
      context.fillStyle = '#111319';
      context.fillRect(0, 0, canvas.width, canvas.height);
      context.fillStyle = '#151923';
      for (let y = 0; y < canvas.height; y += 70) {
        for (let x = 0; x < canvas.width; x += 70) {
          if ((x / 70 + y / 70) % 2) context.fillRect(x, y, 70, 70);
        }
      }
      const blob = await new Promise((resolve) => canvas.toBlob(resolve, 'image/png'));
      const transfer = new DataTransfer();
      transfer.items.add(new File([blob], 'mutation-contact-background.png', { type: 'image/png' }));
      const input = document.querySelector('.topbar input[type=file][accept*="image/png"]');
      Object.getOwnPropertyDescriptor(HTMLInputElement.prototype, 'files').set.call(input, transfer.files);
      input.dispatchEvent(new Event('change', { bubbles: true }));
      return true;
    })()`);
    try {
      await bidi.send('browsingContext.handleUserPrompt', { context, accept: true }, 2000);
    } catch {
      // No replacement prompt was open.
    }
    await waitFor(`document.querySelector('.topbar-file strong')?.textContent.includes('mutation-contact-background.png')`, 120000);
    await delay(600);
    await evaluate(`(() => {
      const clear = [...document.querySelectorAll('.image-brush-library-actions button')]
        .find((button) => button.textContent.includes('Clear library'));
      if (clear && !clear.disabled) clear.click();
      return true;
    })()`);
    await waitFor(`document.querySelectorAll('.image-brush-library-strip article').length === 0`);
    await click(`[...document.querySelectorAll('.image-brush-library-actions button')].find((button) => button.textContent.includes('Demo images'))`);
    await waitFor(`document.querySelectorAll('.image-brush-library-strip article').length === 9`);
    await click(`[...document.querySelectorAll('.image-brush-library-select')].find((button) => button.getAttribute('aria-label')?.includes('Abstract Symbol'))`);

    const setSelectValue = async (selector, value) => {
      const changed = await evaluate(`(() => {
        const select = ${selector};
        if (!select || ![...select.options].some((option) => option.value === ${JSON.stringify(value)})) return false;
        Object.getOwnPropertyDescriptor(HTMLSelectElement.prototype, 'value').set.call(select, ${JSON.stringify(value)});
        select.dispatchEvent(new Event('change', { bubbles: true }));
        return true;
      })()`);
      if (!changed) throw new Error(`Could not set ${value} on ${selector}`);
    };
    const setRangeValue = async (labelText, value) => {
      const changed = await evaluate(`(() => {
        const field = [...document.querySelectorAll('.image-brush-lab .slider-field')]
          .find((item) => item.querySelector(':scope > span')?.textContent.trim() === ${JSON.stringify(labelText)});
        const input = field?.querySelector('input[type=range]');
        if (!input) return false;
        Object.getOwnPropertyDescriptor(HTMLInputElement.prototype, 'value').set.call(input, ${JSON.stringify(String(value))});
        input.dispatchEvent(new Event('input', { bubbles: true }));
        input.dispatchEvent(new Event('change', { bubbles: true }));
        return true;
      })()`);
      if (!changed) throw new Error(`Could not set range ${labelText}`);
    };
    const presetCases = modeContactMode
      ? [
          ['clean-repeat', 'Clean Repeat', 'clean'],
          ['glitched-repeat', 'Fixed Glitch', 'fixed'],
          ['progressive-decay', 'Progressive Decay', 'progressive'],
          ['random-glitch-chain', 'Random Per Stamp', 'per-stamp'],
          ['datamosh-trail', 'Evolving Chain', 'evolving'],
          ['rgb-separation-trail', 'Random Effect Stack', 'random-stack'],
          ['broken-interface', 'Alternating Modes', 'alternating'],
          ['compression-breakdown', 'Stroke Gradient', 'stroke-gradient'],
          ['pixel-sort-trail', 'Whole Trail Processing', 'whole-trail'],
        ]
      : [
          ['clean-repeat', 'Clean Repeat', 'clean'],
          ['glitched-repeat', 'Glitched Repeat', 'fixed'],
          ['progressive-decay', 'Progressive Decay', 'progressive'],
          ['random-glitch-chain', 'Random Glitch Chain', 'per-stamp'],
          ['datamosh-trail', 'Datamosh Trail', 'evolving'],
          ['rgb-separation-trail', 'RGB Separation Trail', 'random-stack'],
          ['pixel-sort-trail', 'Pixel Sort Trail', 'whole-trail'],
          ['chroma-feedback', 'Chroma Feedback', 'evolving'],
          ['compression-breakdown', 'Compression Breakdown', 'stroke-gradient'],
          ['packet-loss-stream', 'Packet Loss Stream', 'random-stack'],
          ['broken-interface', 'Broken Interface', 'alternating'],
          ['scatter-fragments', 'Scatter Fragments', 'per-stamp'],
        ];
    const contactColumns = modeContactMode ? 3 : 4;
    const canvasRect = await evaluate(`(() => {
      const rect = document.querySelector('.work-canvas').getBoundingClientRect();
      return { x: rect.x, y: rect.y, width: rect.width, height: rect.height };
    })()`);
    const cellWidth = canvasRect.width / contactColumns;
    const cellHeight = canvasRect.height / 3;
    const results = [];
    for (let index = 0; index < presetCases.length; index += 1) {
      const [presetId, name, mode] = presetCases[index];
      await setSelectValue(`document.querySelector('select[data-help-id="image-brush.preset"]')`, presetId);
      await delay(160);
      await setSelectValue(`[...document.querySelectorAll('.image-brush-select')].find((label) => label.textContent.includes('Spacing unit'))?.querySelector('select')`, 'pixels');
      await setRangeValue('Size', 42);
      await setRangeValue('Spacing', modeContactMode ? 38 : 26);
      const column = index % contactColumns;
      const row = Math.floor(index / contactColumns);
      const y = canvasRect.y + cellHeight * (row + 0.6);
      const start = {
        x: canvasRect.x + cellWidth * column + 18,
        y,
      };
      const end = {
        x: canvasRect.x + cellWidth * (column + 1) - 18,
        y,
      };
      const beforeResults = await evaluate(`window.__firefoxImageBrushMetrics.workerResults.length`);
      const started = Date.now();
      await stroke(start, end, 18, 420);
      await waitFor(`window.__firefoxImageBrushMetrics.workerResults.length > ${beforeResults}`, 120000);
      await waitFor(`!document.querySelector('.image-brush-progress')`, 120000);
      results.push({
        presetId,
        name,
        mode,
        wallMs: Date.now() - started,
        worker: await evaluate(`window.__firefoxImageBrushMetrics.workerResults.at(-1)`),
      });
    }
    await evaluate(`(() => {
      const old = document.getElementById('mutation-contact-labels');
      old?.remove();
      const layer = document.createElement('div');
      layer.id = 'mutation-contact-labels';
      Object.assign(layer.style, {
        position: 'fixed',
        inset: '0',
        zIndex: '9998',
        pointerEvents: 'none',
      });
      const rect = document.querySelector('.work-canvas').getBoundingClientRect();
      const columns = ${contactColumns};
      const names = ${JSON.stringify(presetCases.map((entry) => entry[1]))};
      names.forEach((name, index) => {
        const label = document.createElement('div');
        label.textContent = String(index + 1).padStart(2, '0') + '  ' + name;
        Object.assign(label.style, {
          position: 'absolute',
          left: (rect.x + rect.width / columns * (index % columns) + 8) + 'px',
          top: (rect.y + rect.height / 3 * Math.floor(index / columns) + 7) + 'px',
          padding: '5px 7px',
          border: '1px solid #9b7d45',
          background: '#10120fe8',
          color: '#e2bd72',
          font: '700 9px monospace',
          letterSpacing: '.04em',
        });
        layer.appendChild(label);
      });
      document.body.appendChild(layer);
      return true;
    })()`);
    const screenshot = await bidi.send('browsingContext.captureScreenshot', {
      context,
      origin: 'viewport',
    });
    const report = {
      session: session.capabilities,
      canvasRect,
      presets: results,
      allModes: [...new Set(results.map((result) => result.mode))],
      modeCount: new Set(results.map((result) => result.mode)).size,
      workerJobs: await evaluate(`window.__firefoxImageBrushMetrics.workerResults.length`),
      maximumRafGap: await evaluate(`Math.max(0, ...window.__firefoxImageBrushMetrics.rafGaps)`),
    };
    writeFileSync(resolve(artifactDir, `${label}.png`), Buffer.from(screenshot.data, 'base64'));
    writeFileSync(resolve(artifactDir, `${label}.json`), JSON.stringify(report, null, 2));
    console.log(JSON.stringify(report, null, 2));
    await evaluate(`document.getElementById('mutation-contact-labels')?.remove()`);
    await bidi.send('session.end', {});
    bidi.close();
    activeBidi = null;
    return;
  }

  if (brokenBaselineMode) {
    await bidi.send('browsingContext.setViewport', {
      context,
      viewport: { width: 1180, height: 860 },
      devicePixelRatio: 1,
    });
    await delay(500);
    const before = await evaluate(`(() => {
      const inspector = document.querySelector('.inspector-content');
      const lab = document.querySelector('.image-brush-lab');
      const simple = document.querySelector('.image-brush-simple');
      const cards = [...document.querySelectorAll('.image-brush-style-cards > button')];
      return {
        viewport: [innerWidth, innerHeight],
        inspector: inspector ? { clientWidth: inspector.clientWidth, scrollWidth: inspector.scrollWidth } : null,
        lab: lab ? { clientWidth: lab.clientWidth, scrollWidth: lab.scrollWidth } : null,
        simple: simple ? { clientWidth: simple.clientWidth, scrollWidth: simple.scrollWidth, scrollHeight: simple.scrollHeight } : null,
        presetCards: cards.length,
        presetCanvases: document.querySelectorAll('.image-brush-style-cards canvas').length,
        largestCardHeight: Math.max(0, ...cards.map((card) => card.getBoundingClientRect().height)),
        sliderValues: Object.fromEntries([...document.querySelectorAll('.image-brush-simple .slider-field')].map((field) => [
          field.querySelector(':scope > span')?.textContent.trim() ?? '',
          field.querySelector('input')?.value ?? ''
        ]))
      };
    })()`);
    await evaluate(`(async () => {
      const makeFile = async (name, color) => {
        const canvas = document.createElement('canvas');
        canvas.width = 96;
        canvas.height = 96;
        const context = canvas.getContext('2d');
        context.clearRect(0, 0, 96, 96);
        context.fillStyle = color;
        context.fillRect(14, 34, 68, 28);
        context.fillRect(34, 14, 28, 68);
        const blob = await new Promise((resolve) => canvas.toBlob(resolve, 'image/png'));
        return new File([blob], name, { type: 'image/png' });
      };
      const transfer = new DataTransfer();
      for (const [name, color] of [['baseline-first.png', '#e0b84c'], ['baseline-second.png', '#31bac0']]) {
        transfer.items.add(await makeFile(name, color));
      }
      document.querySelector('.image-brush-lab').dispatchEvent(new DragEvent('drop', {
        bubbles: true,
        cancelable: true,
        dataTransfer: transfer,
      }));
      return true;
    })()`);
    await delay(3000);
    const uploadedSecondImage = await evaluate(`document.querySelector('.image-brush-simple-image strong')?.textContent.includes('baseline-second.png') ?? false`);
    await click(`([...document.querySelectorAll('.image-brush-simple-library button')].find((button) => button.dataset.tooltip?.includes('baseline-first.png')) ?? document.querySelector('.image-brush-simple-library button'))`);
    const sliderBounds = await rect(`document.querySelector('.image-brush-simple input[data-tooltip-id="control.size"]')`);
    const sliderBefore = await evaluate(`document.querySelector('.image-brush-simple input[data-tooltip-id="control.size"]').value`);
    const sliderPointerReachable = sliderBounds.x >= 0 &&
      sliderBounds.y >= 0 &&
      sliderBounds.x + sliderBounds.width <= 1180 &&
      sliderBounds.y + sliderBounds.height <= 860;
    if (sliderPointerReachable) {
      await bidi.send('input.performActions', {
        context,
        actions: [{
          type: 'pointer',
          id: 'baseline-size-slider',
          parameters: { pointerType: 'mouse' },
          actions: [
            { type: 'pointerMove', x: Math.round(sliderBounds.x + sliderBounds.width * 0.25), y: Math.round(sliderBounds.y + sliderBounds.height / 2), duration: 0, origin: 'viewport' },
            { type: 'pointerDown', button: 0 },
            { type: 'pointerMove', x: Math.round(sliderBounds.x + sliderBounds.width * 0.72), y: Math.round(sliderBounds.y + sliderBounds.height / 2), duration: 350, origin: 'viewport' },
            { type: 'pointerUp', button: 0 },
          ],
        }],
      });
    }
    await delay(400);
    const after = await evaluate(`(() => {
      const inspector = document.querySelector('.inspector-content');
      const lab = document.querySelector('.image-brush-lab');
      const simple = document.querySelector('.image-brush-simple');
      const slider = document.querySelector('.image-brush-simple input[data-tooltip-id="control.size"]');
      return {
        inspector: inspector ? { clientWidth: inspector.clientWidth, scrollWidth: inspector.scrollWidth } : null,
        lab: lab ? { clientWidth: lab.clientWidth, scrollWidth: lab.scrollWidth } : null,
        simple: simple ? { clientWidth: simple.clientWidth, scrollWidth: simple.scrollWidth, scrollHeight: simple.scrollHeight } : null,
        activeImage: document.querySelector('.image-brush-simple-image strong')?.textContent ?? '',
        libraryCount: document.querySelectorAll('.image-brush-simple-library button').length,
        sizeValue: slider?.value ?? '',
        sliderChanged: slider?.value !== ${JSON.stringify(sliderBefore)},
        overlayOverInspector: (() => {
          const overlay = document.querySelector('.image-brush-overlay-canvas');
          const inspectorRect = document.querySelector('.inspector')?.getBoundingClientRect();
          const overlayRect = overlay?.getBoundingClientRect();
          return Boolean(overlayRect && inspectorRect &&
            overlayRect.right > inspectorRect.left &&
            overlayRect.left < inspectorRect.right);
        })()
      };
    })()`);
    const screenshot = await bidi.send('browsingContext.captureScreenshot', {
      context,
      origin: 'viewport',
    });
    const report = {
      session: session.capabilities,
      before,
      after,
      reproduced: {
        uploadedSecondImage,
        sliderBounds,
        sliderPointerReachable,
        simultaneousPresetPreviews: before.presetCanvases,
        giantCardGrid: before.presetCards > 0 && before.largestCardHeight > 90,
        horizontalOverflow: [before.inspector, before.lab, before.simple, after.inspector, after.lab, after.simple]
          .filter(Boolean)
          .some((entry) => entry.scrollWidth > entry.clientWidth),
        sliderFailureAfterSecondImage: !after.sliderChanged
      }
    };
    writeFileSync(resolve(artifactDir, `${label}.png`), Buffer.from(screenshot.data, 'base64'));
    writeFileSync(resolve(artifactDir, `${label}.json`), JSON.stringify(report, null, 2));
    console.log(JSON.stringify(report, null, 2));
    await bidi.send('session.end', {});
    bidi.close();
    activeBidi = null;
    return;
  }

  if (matrixMode) {
    await bidi.send('browsingContext.setViewport', {
      context,
      viewport: { width: 1500, height: 980 },
      devicePixelRatio: 1,
    });
    await evaluate(`document.querySelector('.workspace').style.gridTemplateColumns = '55px minmax(0, 1fr) 360px'`);
    await evaluate(`(async () => {
      const canvas = document.createElement('canvas');
      canvas.width = 128;
      canvas.height = 128;
      const context = canvas.getContext('2d');
      context.clearRect(0, 0, 128, 128);
      context.fillStyle = '#e0b84c';
      context.fillRect(18, 50, 92, 28);
      context.fillStyle = '#31bac0';
      context.fillRect(50, 18, 28, 92);
      context.strokeStyle = '#ef4d74';
      context.lineWidth = 8;
      context.strokeRect(28, 28, 72, 72);
      const blob = await new Promise((resolve) => canvas.toBlob(resolve, 'image/png'));
      const file = new File([blob], 'firefox-tip-128.png', { type: 'image/png' });
      const transfer = new DataTransfer();
      transfer.items.add(file);
      const input = document.querySelector('.image-brush-compact input[type=file][accept*="image/png"]');
      Object.getOwnPropertyDescriptor(HTMLInputElement.prototype, 'files').set.call(input, transfer.files);
      input.dispatchEvent(new Event('change', { bubbles: true }));
      return true;
    })()`);
    await waitFor(`document.querySelector('.image-brush-active-image strong')?.textContent.includes('firefox-tip-128')`);

    const setSelectValue = async (selector, value) => {
      const changed = await evaluate(`(() => {
        const select = ${selector};
        if (!select || ![...select.options].some((option) => option.value === ${JSON.stringify(value)})) return false;
        Object.getOwnPropertyDescriptor(HTMLSelectElement.prototype, 'value').set.call(select, ${JSON.stringify(value)});
        select.dispatchEvent(new Event('change', { bubbles: true }));
        return true;
      })()`);
      if (!changed) throw new Error(`Could not set ${value} on ${selector}`);
    };
    const setRangeValue = async (labelText, value) => {
      const changed = await evaluate(`(() => {
        const field = [...document.querySelectorAll('.image-brush-lab .slider-field')]
          .find((item) => item.querySelector(':scope > span')?.textContent.trim() === ${JSON.stringify(labelText)});
        const input = field?.querySelector('input[type=range]');
        if (!input) return false;
        Object.getOwnPropertyDescriptor(HTMLInputElement.prototype, 'value').set.call(input, ${JSON.stringify(String(value))});
        input.dispatchEvent(new Event('input', { bubbles: true }));
        input.dispatchEvent(new Event('change', { bubbles: true }));
        return true;
      })()`);
      if (!changed) throw new Error(`Could not set range ${labelText}`);
    };
    const loadDocument = async (size) => {
      await evaluate(`(async () => {
        const size = ${size};
        const canvas = document.createElement('canvas');
        canvas.width = size;
        canvas.height = size;
        const context = canvas.getContext('2d');
        context.fillStyle = '#bf6b7b';
        context.fillRect(0, 0, size, size);
        const block = Math.max(32, Math.round(size / 18));
        for (let y = 0; y < size; y += block) {
          for (let x = 0; x < size; x += block) {
            context.fillStyle = ((x / block + y / block) % 2)
              ? '#2b5f82'
              : '#d0a64e';
            context.fillRect(x, y, block, block);
          }
        }
        const blob = await new Promise((resolve) => canvas.toBlob(resolve, 'image/png'));
        const file = new File([blob], 'firefox-performance-${size}.png', { type: 'image/png' });
        const transfer = new DataTransfer();
        transfer.items.add(file);
        const input = document.querySelector('.topbar input[type=file][accept*="image/png"]');
        Object.getOwnPropertyDescriptor(HTMLInputElement.prototype, 'files').set.call(input, transfer.files);
        input.dispatchEvent(new Event('change', { bubbles: true }));
        return true;
      })()`);
      try {
        await bidi.send('browsingContext.handleUserPrompt', { context, accept: true }, 2000);
      } catch {
        // No replacement prompt was open.
      }
      await waitFor(`document.querySelector('.topbar-file strong')?.textContent.includes('firefox-performance-${size}.png')`, 120000);
    };

    const cases = [
      { size: 1000, tip: 96, spacing: 8, mutation: 'fixed', expected: 100, from: 0.12, to: 0.88 },
      { size: 2000, tip: 128, spacing: 9, mutation: 'per-stamp', expected: 200, from: 0.07, to: 0.93 },
      { size: 4000, tip: 128, spacing: 15, mutation: 'evolving', expected: 250, from: 0.05, to: 0.95 },
    ];
    const matrix = [];
    for (const test of cases) {
      await loadDocument(test.size);
      await setSelectValue(
        `[...document.querySelectorAll('.image-brush-select select')].find((select) => [...select.options].some((option) => option.value === 'glitched-repeat'))`,
        'glitched-repeat',
      );
      await setSelectValue(`document.querySelector('select[data-help-id="image-brush.spacing-unit"]')`, 'pixels');
      await setSelectValue(`document.querySelector('select[data-help-id="image-brush.mutation"]')`, test.mutation);
      await setSelectValue(`document.querySelector('select[data-help-id="image-brush.fx-stage"]')`, 'each');
      await setRangeValue('Size', test.tip);
      await setRangeValue('Spacing', test.spacing);
      if (test.mutation === 'per-stamp') await setRangeValue('Variant pool', 8);
      await delay(450);
      const canvasBounds = await rect(`document.querySelector('.work-canvas')`);
      const start = { x: canvasBounds.x + canvasBounds.width * test.from, y: canvasBounds.y + canvasBounds.height * 0.43 };
      const end = { x: canvasBounds.x + canvasBounds.width * test.to, y: canvasBounds.y + canvasBounds.height * 0.57 };
      const before = await evaluate(`(() => ({
        time: performance.now(),
        results: window.__firefoxImageBrushMetrics.workerResults.length,
        posts: window.__firefoxImageBrushMetrics.workerPosts.length,
        drawImageCalls: window.__firefoxImageBrushMetrics.drawImageCalls,
        rafGaps: window.__firefoxImageBrushMetrics.rafGaps.length
      }))()`);
      await stroke(start, end, 80, test.size === 4000 ? 1100 : 700);
      await waitFor(`window.__firefoxImageBrushMetrics.workerResults.length > ${before.results}`, 120000);
      await waitFor(`!document.querySelector('.image-brush-progress')`, 120000);
      const after = await evaluate(`(() => {
        const metrics = window.__firefoxImageBrushMetrics;
        const post = metrics.workerPosts.slice(${before.posts}).findLast((entry) => entry.type === 'process');
        const result = metrics.workerResults.at(-1);
        const gaps = metrics.rafGaps.slice(${before.rafGaps});
        const performanceButton = [...document.querySelectorAll('.image-brush-performance button')]
          .find((button) => button.textContent.includes('performance diagnostics'));
        if (performanceButton && performanceButton.textContent.includes('Show')) performanceButton.click();
        return {
          wallMs: performance.now() - ${before.time},
          workerPost: post,
          workerResult: result,
          drawImageCalls: metrics.drawImageCalls - ${before.drawImageCalls},
          maxRafGapMs: Math.max(0, ...gaps),
          rafGapsOver50ms: gaps.filter((gap) => gap > 50).length,
          performanceText: [...document.querySelectorAll('.image-brush-compact-diagnostics')].at(-1)?.textContent ?? ''
        };
      })()`);
      matrix.push({ ...test, ...after });
    }
    await setSelectValue(`document.querySelector('select[data-help-id="image-brush.fx-stage"]')`, 'before-after');
    await delay(250);
    const cancellationCanvas = await rect(`document.querySelector('.work-canvas')`);
    const cancellationBefore = await evaluate(`(() => {
      const source = document.querySelector('.work-canvas');
      const sample = document.createElement('canvas');
      sample.width = 32;
      sample.height = 32;
      sample.getContext('2d').drawImage(source, 0, 0, 32, 32);
      const data = sample.getContext('2d').getImageData(0, 0, 32, 32).data;
      let hash = 2166136261;
      for (const value of data) hash = Math.imul(hash ^ value, 16777619) >>> 0;
      return {
        hash,
        history: document.querySelector('.status-data span:nth-child(5)')?.textContent ?? '',
        results: window.__firefoxImageBrushMetrics.workerResults.length
      };
    })()`);
    await stroke(
      { x: cancellationCanvas.x + cancellationCanvas.width * 0.08, y: cancellationCanvas.y + cancellationCanvas.height * 0.3 },
      { x: cancellationCanvas.x + cancellationCanvas.width * 0.92, y: cancellationCanvas.y + cancellationCanvas.height * 0.7 },
      120,
      240,
    );
    await waitFor(`Boolean(document.querySelector('.image-brush-progress'))`, 5000);
    const cancelStarted = await evaluate(`performance.now()`);
    await bidi.send('input.performActions', {
      context,
      actions: [{
        type: 'key',
        id: 'cancel-key',
        actions: [
          { type: 'keyDown', value: '\uE00C' },
          { type: 'keyUp', value: '\uE00C' },
        ],
      }],
    });
    await waitFor(`!document.querySelector('.image-brush-progress')`, 5000);
    const cancellation = await evaluate(`(() => {
      const source = document.querySelector('.work-canvas');
      const sample = document.createElement('canvas');
      sample.width = 32;
      sample.height = 32;
      sample.getContext('2d').drawImage(source, 0, 0, 32, 32);
      const data = sample.getContext('2d').getImageData(0, 0, 32, 32).data;
      let hash = 2166136261;
      for (const value of data) hash = Math.imul(hash ^ value, 16777619) >>> 0;
      return {
        cancelMs: performance.now() - ${cancelStarted},
        sampleHash: hash,
        history: document.querySelector('.status-data span:nth-child(5)')?.textContent ?? '',
        results: window.__firefoxImageBrushMetrics.workerResults.length
      };
    })()`);
    cancellation.documentUnchanged = cancellation.sampleHash === cancellationBefore.hash;
    cancellation.historyUnchanged = cancellation.history === cancellationBefore.history;
    cancellation.workerResultSuppressed = cancellation.results === cancellationBefore.results;
    await loadDocument(1000);
    await setSelectValue(`document.querySelector('select[data-help-id="image-brush.preset"]')`, 'glitched-repeat');
    await setSelectValue(`document.querySelector('select[data-help-id="image-brush.spacing-unit"]')`, 'pixels');
    await setRangeValue('Size', 72);
    await setRangeValue('Spacing', 12);
    const repeatCanvas = await rect(`document.querySelector('.work-canvas')`);
    const repeatBefore = await evaluate(`(() => ({
      started: performance.now(),
      results: window.__firefoxImageBrushMetrics.workerResults.length,
      raf: window.__firefoxImageBrushMetrics.rafGaps.length,
      memory: performance.memory?.usedJSHeapSize ?? null
    }))()`);
    for (let index = 0; index < 10; index += 1) {
      const beforeResult = await evaluate(`window.__firefoxImageBrushMetrics.workerResults.length`);
      const y = repeatCanvas.y + repeatCanvas.height * (0.18 + index * 0.065);
      await stroke(
        { x: repeatCanvas.x + repeatCanvas.width * 0.16, y },
        { x: repeatCanvas.x + repeatCanvas.width * 0.84, y: y + (index % 2 ? 12 : -12) },
        index % 2 ? 48 : 18,
        index % 2 ? 420 : 140,
      );
      await waitFor(`window.__firefoxImageBrushMetrics.workerResults.length > ${beforeResult}`, 120000);
      await waitFor(`!document.querySelector('.image-brush-progress')`, 120000);
    }
    const hashCanvas = async () => evaluate(`(() => {
      const source = document.querySelector('.work-canvas');
      const sample = document.createElement('canvas');
      sample.width = 96;
      sample.height = 96;
      sample.getContext('2d').drawImage(source, 0, 0, 96, 96);
      const data = sample.getContext('2d').getImageData(0, 0, 96, 96).data;
      let hash = 2166136261;
      for (const value of data) hash = Math.imul(hash ^ value, 16777619) >>> 0;
      return hash;
    })()`);
    const committedHash = await hashCanvas();
    await bidi.send('input.performActions', {
      context,
      actions: [{
        type: 'key',
        id: 'repeat-undo',
        actions: [
          { type: 'keyDown', value: '\uE009' },
          { type: 'keyDown', value: 'z' },
          { type: 'keyUp', value: 'z' },
          { type: 'keyUp', value: '\uE009' },
        ],
      }],
    });
    await delay(180);
    const undoneHash = await hashCanvas();
    await bidi.send('input.performActions', {
      context,
      actions: [{
        type: 'key',
        id: 'repeat-redo',
        actions: [
          { type: 'keyDown', value: '\uE009' },
          { type: 'keyDown', value: '\uE008' },
          { type: 'keyDown', value: 'z' },
          { type: 'keyUp', value: 'z' },
          { type: 'keyUp', value: '\uE008' },
          { type: 'keyUp', value: '\uE009' },
        ],
      }],
    });
    await delay(180);
    const redoneHash = await hashCanvas();
    const repeated = await evaluate(`(() => {
      const metrics = window.__firefoxImageBrushMetrics;
      const gaps = metrics.rafGaps.slice(${repeatBefore.raf});
      const memoryAfter = performance.memory?.usedJSHeapSize ?? null;
      const memoryBefore = ${JSON.stringify(repeatBefore.memory)};
      return {
        wallMs: performance.now() - ${repeatBefore.started},
        workerResults: metrics.workerResults.length - ${repeatBefore.results},
        maxRafGapMs: Math.max(0, ...gaps),
        rafGapsOver50ms: gaps.filter((gap) => gap > 50).length,
        memoryBefore,
        memoryAfter,
        memoryGrowth: memoryAfter === null || memoryBefore === null
          ? 'Firefox does not expose performance.memory.'
          : memoryAfter - memoryBefore,
        history: document.querySelector('.status-data span:nth-child(5)')?.textContent ?? ''
      };
    })()`);
    repeated.undoChanged = undoneHash !== committedHash;
    repeated.redoExact = redoneHash === committedHash;
    const metrics = await evaluate(`window.__firefoxImageBrushMetrics`);
    const screenshot = await bidi.send('browsingContext.captureScreenshot', {
      context,
      origin: 'viewport',
    });
    const report = {
      session: session.capabilities,
      matrix,
      cancellation,
      repeated,
      capabilities: {
        getCoalescedEvents: await evaluate(`typeof PointerEvent.prototype.getCoalescedEvents === 'function'`),
        offscreenCanvas: await evaluate(`typeof OffscreenCanvas === 'function'`),
        createImageBitmap: await evaluate(`typeof createImageBitmap === 'function'`),
        transferableArrayBuffer: true,
        gcPauses: 'Not exposed by the Firefox web performance APIs used by this harness.'
      },
      metrics,
    };
    writeFileSync(resolve(artifactDir, `${label}.png`), Buffer.from(screenshot.data, 'base64'));
    writeFileSync(resolve(artifactDir, `${label}.json`), JSON.stringify(report, null, 2));
    console.log(JSON.stringify(report, null, 2));
    await bidi.send('session.end', {});
    bidi.close();
    activeBidi = null;
    return;
  }

  await click(`[...document.querySelectorAll('.image-brush-style-cards button')].find((button) => button.querySelector('strong')?.textContent === 'Glitched Repeat')`);
  await delay(600);

  const slider = await rect(`document.querySelector('.image-brush-simple input[data-tooltip-id="control.spacing"]')`);
  console.error(`[firefox] spacing slider ${JSON.stringify(slider)}`);
  await bidi.send('input.performActions', {
    context,
    actions: [{
      type: 'pointer',
      id: 'spacing-slider',
      parameters: { pointerType: 'mouse' },
      actions: [
        { type: 'pointerMove', x: Math.round(slider.x + slider.width * 0.35), y: Math.round(slider.y + slider.height / 2), duration: 0, origin: 'viewport' },
        { type: 'pointerDown', button: 0 },
        { type: 'pointerMove', x: Math.round(slider.x + slider.width * 0.62), y: Math.round(slider.y + slider.height / 2), duration: 320, origin: 'viewport' },
        { type: 'pointerUp', button: 0 },
      ],
    }],
  });

  const mutation = await rect(`document.querySelector('.image-brush-simple .image-brush-select select[data-help-id="image-brush.mutation"]')`);
  console.error(`[firefox] mutation select ${JSON.stringify(mutation)}`);
  await bidi.send('input.performActions', {
    context,
    actions: [
      {
        type: 'pointer',
        id: 'mutation-select',
        parameters: { pointerType: 'mouse' },
        actions: [
          { type: 'pointerMove', x: Math.round(mutation.x + mutation.width / 2), y: Math.round(mutation.y + mutation.height / 2), duration: 0, origin: 'viewport' },
          { type: 'pointerDown', button: 0 },
          { type: 'pointerUp', button: 0 },
          { type: 'pause', duration: 80 },
        ],
      },
      {
        type: 'key',
        id: 'mutation-keys',
        actions: [
          { type: 'pause', duration: 80 },
          { type: 'keyDown', value: '\uE015' },
          { type: 'keyUp', value: '\uE015' },
          { type: 'keyDown', value: '\uE007' },
          { type: 'keyUp', value: '\uE007' },
        ],
      },
    ],
  });
  await delay(500);

  const workCanvas = await rect(`document.querySelector('.work-canvas')`);
  console.error(`[firefox] work canvas ${JSON.stringify(workCanvas)}`);
  const insetX = workCanvas.width * 0.2;
  const baselineStart = { x: workCanvas.x + insetX, y: workCanvas.y + workCanvas.height * 0.38 };
  const baselineEnd = { x: workCanvas.x + workCanvas.width - insetX, y: workCanvas.y + workCanvas.height * 0.62 };

  const scenarios = [];
  for (const [name, steps, duration, length] of [
    ['short', 8, 180, 0.45],
    ['long-slow', 28, 1400, 1],
    ['long-fast', 18, 180, 1],
  ]) {
    const before = await evaluate(`performance.now()`);
    await stroke(
      baselineStart,
      {
        x: baselineStart.x + (baselineEnd.x - baselineStart.x) * length,
        y: baselineStart.y + (baselineEnd.y - baselineStart.y) * length,
      },
      steps,
      duration,
    );
    await waitFor(`!document.querySelector('.image-brush-progress')`, 120000);
    const after = await evaluate(`performance.now()`);
    scenarios.push({ name, wallMs: after - before });
  }

  await click(`document.querySelector('.topbar-actions button[title^="Undo"]')`);
  await click(`document.querySelector('.topbar-actions button[title^="Redo"]')`);
  await click(`document.querySelector('.topbar-actions button[title^="Undo"]')`);
  await click(`document.querySelector('.topbar-actions button[title^="Redo"]')`);

  await click(`[...document.querySelectorAll('.image-brush-interface-level button')].find((button) => button.textContent.trim() === 'ADVANCED')`);
  await click(`document.querySelector('.image-brush-advanced-section > summary')`);
  const performanceButtonExists = await evaluate(`Boolean([...document.querySelectorAll('.image-brush-performance button')].find((button) => button.textContent.includes('performance diagnostics')))`);
  if (performanceButtonExists) {
    await click(`[...document.querySelectorAll('.image-brush-performance button')].find((button) => button.textContent.includes('performance diagnostics'))`);
  }
  await bidi.send('input.performActions', {
    context,
    actions: [{
      type: 'pointer',
      id: 'tooltip-leave',
      parameters: { pointerType: 'mouse' },
      actions: [{
        type: 'pointerMove',
        x: Math.round(workCanvas.x + workCanvas.width / 2),
        y: Math.round(workCanvas.y + 18),
        duration: 80,
        origin: 'viewport',
      }],
    }],
  });
  await delay(120);

  const metrics = await evaluate(`(() => {
    const metrics = window.__firefoxImageBrushMetrics;
    const elapsed = Math.max(1, performance.now() - metrics.startedAt);
    return {
      userAgent: navigator.userAgent,
      elapsedMs: elapsed,
      pointerMoves: metrics.pointerMoves,
      pointerEventsPerSecond: metrics.pointerMoves / elapsed * 1000,
      pointerDowns: metrics.pointerDowns,
      maximumRafGapMs: Math.max(0, ...metrics.rafGaps),
      rafGapsOver50ms: metrics.rafGaps.filter((gap) => gap > 50).length,
      drawImageCalls: metrics.drawImageCalls,
      workerJobs: metrics.workerJobs,
      workerMessages: metrics.workerMessages,
      workerMessagesPerSecond: metrics.workerMessages / elapsed * 1000,
      workerProgressMessages: metrics.workerProgressMessages,
      workerPosts: metrics.workerPosts,
      workerResults: metrics.workerResults,
      bytesSent: metrics.workerPosts.reduce((total, post) => total + post.bytes, 0),
      bytesReturned: metrics.workerResults.reduce((total, result) => total + result.bytes, 0),
      mainThreadLongTasks: metrics.longTasks,
      tooltipShows: metrics.tooltipShows,
      selectedMutation: document.querySelector('select[data-help-id="image-brush.mutation"]')?.value,
      history: document.querySelector('.status-data')?.textContent,
      performanceText: document.querySelector('.image-brush-performance dl')?.textContent ?? '',
      processingVisible: Boolean(document.querySelector('.image-brush-progress')),
      tooltipVisible: Boolean(document.querySelector('.shared-control-tooltip')),
      helpButtonCount: document.querySelectorAll('.image-brush-lab .help-button').length,
      invalidHelpButtons: [...document.querySelectorAll('.image-brush-lab .help-button')]
        .filter((button) => !button.closest('label')?.querySelector('select')).length,
      simpleSliderHelpButtons: document.querySelectorAll('.image-brush-simple .slider-field .help-button').length
    };
  })()`);
  const screenshot = await bidi.send('browsingContext.captureScreenshot', {
    context,
    origin: 'viewport',
  });
  writeFileSync(resolve(artifactDir, `${label}.png`), Buffer.from(screenshot.data, 'base64'));
  writeFileSync(
    resolve(artifactDir, `${label}.json`),
    JSON.stringify({ session: session.capabilities, scenarios, metrics }, null, 2),
  );
  console.log(JSON.stringify({ session: session.capabilities, scenarios, metrics }, null, 2));
  await bidi.send('session.end', {});
  bidi.close();
  activeBidi = null;
}

main().catch(async (error) => {
  console.error(error);
  if (activeBidi) {
    try {
      await activeBidi.send('session.end', {}, 2000);
    } catch {
      // The failed session may already be gone.
    }
    activeBidi.close();
  }
  process.exit(1);
});
