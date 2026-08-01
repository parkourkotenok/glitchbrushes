import { useState } from 'react';
import { Download, SlidersHorizontal, Zap } from 'lucide-react';
import type { EditorDocument } from '../types';
import { formatBytes } from '../utils/geometry';
import { triggerDownload } from '../utils/download';
import { SliderField } from './SliderField';
import { PanelSection } from './ui/controls';

export interface FileCorruptionPanelProps {
  doc: EditorDocument;
  seed: string;
  historyVersion: number;
  isAnyProcessing: boolean;
  onNotice(message: string): void;
  onProcessingChange(processing: boolean): void;
}

type RawStatus = 'ready' | 'decoded' | 'failed' | 'reverted';

/**
 * FILE CORRUPTION panel. Experimentally mutates bytes of the encoded
 * PNG/JPEG/WebP binary and validates decodability. Self-contained so the
 * raw-worker domain does not clutter the main editor component.
 */
export function FileCorruptionPanel({
  doc,
  seed,
  historyVersion,
  isAnyProcessing,
  onNotice,
  onProcessingChange,
}: FileCorruptionPanelProps) {
  const [protectedPercent, setProtectedPercent] = useState(8);
  const [mutationCount, setMutationCount] = useState(24);
  const [rangeStart, setRangeStart] = useState(0);
  const [rangeEnd, setRangeEnd] = useState(100);
  const [xorAmount, setXorAmount] = useState(8);
  const [retryLimit, setRetryLimit] = useState(4);
  const [status, setStatus] = useState<RawStatus>('ready');

  const rawMutate = async () => {
    if (!doc.rawOriginal) {
      onNotice('File Corruption requires a loaded PNG, JPEG, or WebP file.');
      return;
    }
    onProcessingChange(true);
    const previousMutated = doc.rawMutated?.slice() ?? null;
    const before = previousMutated?.slice() ?? doc.rawOriginal.slice();
    const safeStart = Math.min(
      before.length - 1,
      Math.max(64, Math.floor(before.length * (protectedPercent / 100))),
    );
    let decoded: Uint8Array | null = null;
    let decodedAttempt = 0;
    try {
      for (let attempt = 1; attempt <= retryLimit; attempt += 1) {
        const worker = new Worker(new URL('../workers/rawMutation.worker.ts', import.meta.url), {
          type: 'module',
        });
        try {
          const mutated = await new Promise<Uint8Array>((resolve, reject) => {
            worker.onerror = () => reject(new Error('File Corruption Worker failed.'));
            worker.onmessage = (event: MessageEvent<{ buffer: ArrayBuffer }>) =>
              resolve(new Uint8Array(event.data.buffer));
            const buffer = before.slice().buffer;
            worker.postMessage(
              {
                buffer,
                safeStart,
                mutationCount,
                rangeStart: Math.min(rangeStart, rangeEnd) / 100,
                rangeEnd: Math.max(rangeStart, rangeEnd) / 100,
                xorAmount,
                seed: `${seed}:file-corruption:${historyVersion}:${attempt}`,
              },
              [buffer],
            );
          });
          const bitmap = await createImageBitmap(new Blob([mutated], { type: doc.mimeType }));
          bitmap.close();
          decoded = mutated;
          decodedAttempt = attempt;
          break;
        } catch {
          // The next attempt always starts from the unchanged pre-operation bytes.
        } finally {
          worker.terminate();
        }
      }
      if (!decoded) throw new Error('No mutation decoded.');
      doc.rawMutated = decoded;
      setStatus('decoded');
      onNotice(
        `File Corruption decoded on attempt ${decodedAttempt}; ${mutationCount} byte mutation(s) used XOR ${xorAmount}.`,
      );
    } catch {
      doc.rawMutated = previousMutated;
      setStatus('reverted');
      onNotice(
        `All ${retryLimit} File Corruption attempt(s) failed to decode; bytes were reverted automatically.`,
      );
    } finally {
      onProcessingChange(false);
    }
  };

  const downloadRaw = () => {
    if (!doc.rawMutated) return;
    triggerDownload(
      new Blob([doc.rawMutated], { type: doc.mimeType }),
      doc.fileName.replace(/(\.[^.]+)$/, '_raw_glitched$1'),
    );
    onNotice('Valid corrupted binary downloaded directly without pixel re-encoding.');
  };

  return (
    <section className="raw-panel">
      <div className="warning-card">
        <Zap size={18} />
        <div>
          <strong>FILE CORRUPTION</strong>
          <span>Experimental corruption of the encoded image file.</span>
        </div>
      </div>
      <div className="file-corruption-explanation">
        <p>
          This mode changes bytes inside the compressed PNG, JPEG or WebP file instead of editing
          decoded pixels. Encoded file bytes do not correspond directly to visible coordinates, so a
          small mutation may affect a distant part of the image, alter the whole image or make the
          file impossible to decode. The protected file header is left intact, and failed mutations
          are automatically reverted.
        </p>
        <strong>This is not a local brush effect.</strong>
        <strong>Use EFFECT, MOSH LAB or IMAGE BRUSH for controlled local editing.</strong>
      </div>
      <div className="raw-file-card">
        <span className="eyebrow">SOURCE BINARY</span>
        <strong>{doc.rawOriginal ? doc.fileName : 'No uploaded binary'}</strong>
        <span>
          {doc.rawOriginal
            ? formatBytes(doc.rawOriginal.byteLength)
            : 'Load a PNG, JPEG, or WebP file'}
        </span>
      </div>
      <PanelSection title="Encoded-byte controls" icon={<SlidersHorizontal size={15} />}>
        <SliderField
          helpId="file-corruption.protected-prefix"
          label="Protected Prefix"
          value={protectedPercent}
          min={1}
          max={40}
          suffix="%"
          onChange={setProtectedPercent}
        />
        <SliderField
          helpId="file-corruption.mutation-count"
          label="Mutation Count"
          value={mutationCount}
          min={1}
          max={2048}
          step={1}
          onChange={setMutationCount}
        />
        <div className="file-corruption-range">
          <strong>Mutation Range</strong>
          <SliderField
            helpId="file-corruption.mutation-range-start"
            label="Range Start"
            value={rangeStart}
            min={0}
            max={100}
            suffix="%"
            onChange={(value) => setRangeStart(Math.min(value, rangeEnd))}
          />
          <SliderField
            helpId="file-corruption.mutation-range-end"
            label="Range End"
            value={rangeEnd}
            min={0}
            max={100}
            suffix="%"
            onChange={(value) => setRangeEnd(Math.max(value, rangeStart))}
          />
        </div>
        <SliderField
          helpId="file-corruption.xor-amount"
          label="XOR Amount"
          value={xorAmount}
          min={1}
          max={255}
          step={1}
          displayValue={`0x${xorAmount.toString(16).toUpperCase().padStart(2, '0')}`}
          onChange={setXorAmount}
        />
        <SliderField
          helpId="file-corruption.retry-limit"
          label="Retry Limit"
          value={retryLimit}
          min={1}
          max={12}
          step={1}
          onChange={setRetryLimit}
        />
        <p className="fine-print">
          Protected Prefix is never touched (at least 64 leading bytes). Every retry starts from
          unchanged pre-operation bytes.
        </p>
      </PanelSection>
      <div className={`raw-status status-${status}`}>
        <span>DECODE STATUS</span>
        <strong>{status.toUpperCase()}</strong>
      </div>
      <details className="file-corruption-internals">
        <summary>What happens internally</summary>
        <ol>
          <li>The original encoded file is copied.</li>
          <li>The beginning of the file is protected.</li>
          <li>Selected bytes after the protected area are changed.</li>
          <li>The browser attempts to decode the result.</li>
          <li>Invalid mutations are reverted.</li>
          <li>Valid mutated binary data may be exported directly.</li>
        </ol>
      </details>
      <button
        className="raw-action"
        disabled={!doc.rawOriginal || isAnyProcessing}
        onClick={() => void rawMutate()}
      >
        <Zap size={16} /> Corrupt & Validate
      </button>
      <button disabled={!doc.rawMutated} onClick={downloadRaw}>
        <Download size={15} /> Download Valid Corrupted File
      </button>
    </section>
  );
}
