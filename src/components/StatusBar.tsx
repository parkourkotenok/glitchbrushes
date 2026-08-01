import type { EditorDocument } from '../types';
import { formatBytes, pixelToByteOffset } from '../utils/geometry';
import type { MoshProgress } from '../mosh/types';

interface StatusBarProps {
  notice: string;
  isAnyProcessing: boolean;
  moshProcessing: boolean;
  moshProgress: MoshProgress | null;
  cursorInfo: { x: number; y: number; inside: boolean };
  doc: EditorDocument;
  zoom: number;
  undoCount: number;
  redoCount: number;
  historyMemoryBytes: number;
  memoryEstimate: number;
}

export function StatusBar({
  notice,
  isAnyProcessing,
  moshProcessing,
  moshProgress,
  cursorInfo,
  doc,
  zoom,
  undoCount,
  redoCount,
  historyMemoryBytes,
  memoryEstimate,
}: StatusBarProps) {
  return (
    <footer className="statusbar">
      <div className="status-message">
        <span className={`status-light ${isAnyProcessing ? 'busy' : ''}`} />
        {isAnyProcessing
          ? moshProcessing && moshProgress
            ? `PROCESSING ${moshProgress.effectName.toUpperCase()} · ${moshProgress.percent}%`
            : 'PROCESSING LOCALLY…'
          : notice}
      </div>
      <div className="status-data">
        <span>
          X <strong>{cursorInfo.inside ? cursorInfo.x : '—'}</strong>
        </span>
        <span>
          Y <strong>{cursorInfo.inside ? cursorInfo.y : '—'}</strong>
        </span>
        <span>
          BYTE{' '}
          <strong>
            {cursorInfo.inside
              ? `0x${pixelToByteOffset(cursorInfo.x, cursorInfo.y, doc.width)
                  .toString(16)
                  .toUpperCase()
                  .padStart(8, '0')}`
              : '—'}
          </strong>
        </span>
        <span>
          ZOOM <strong>{Math.round(zoom * 100)}%</strong>
        </span>
        <span>
          HISTORY{' '}
          <strong>
            {undoCount}/{redoCount} · {formatBytes(historyMemoryBytes)}
          </strong>
        </span>
        <span>
          MEM <strong>≈ {formatBytes(memoryEstimate)}</strong>
        </span>
      </div>
    </footer>
  );
}
