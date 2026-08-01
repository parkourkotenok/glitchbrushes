import { History, Trash2, X } from 'lucide-react';
import { EffectIcon } from '../icons/effects';
import { formatBytes } from '../utils/geometry';
import type { HistoryAction } from '../types';

export function historyMetric(action: HistoryAction): string {
  if (action.affectedPixels) return `${action.affectedPixels.toLocaleString()} px`;
  if (action.affectedBytes) return formatBytes(action.affectedBytes);
  return formatBytes(action.patches.reduce((total, patch) => total + patch.after.byteLength, 0));
}

interface HistoryPopoverProps {
  undoCount: number;
  redoCount: number;
  entries: HistoryAction[];
  redoEntriesCount: number;
  canClear: boolean;
  onClose: () => void;
  onUndoTo: (actionId: string) => void;
  onClear: () => void;
}

export function HistoryPopover({
  undoCount,
  redoCount,
  entries,
  redoEntriesCount,
  canClear,
  onClose,
  onUndoTo,
  onClear,
}: HistoryPopoverProps) {
  return (
    <section className="history-popover">
      <header>
        <div>
          <History size={16} />
          <span>
            <strong>HISTORY</strong>
            <small>
              {undoCount} applied · {redoCount} redo
            </small>
          </span>
        </div>
        <button className="icon-button" onClick={onClose} title="Close history">
          <X size={14} />
        </button>
      </header>
      <div className="history-list">
        {entries.length === 0 && <div className="history-empty">No committed actions yet.</div>}
        {entries.map((action, index) => (
          <button
            className={index === 0 ? 'current' : ''}
            disabled={index === 0}
            key={action.id}
            onClick={() => onUndoTo(action.id)}
            title={index === 0 ? 'Current committed state' : 'Undo newer actions to this state'}
          >
            <EffectIcon id={action.icon ?? 'mixed'} size={17} />
            <span>
              <strong>{action.label}</strong>
              <small>
                {historyMetric(action)}
                {action.bounds ? ` · ${action.bounds.width}×${action.bounds.height}` : ''}
              </small>
            </span>
            <span>
              <small>{action.detail ?? `#${undoCount - index}`}</small>
              <time>
                {new Date(action.timestamp).toLocaleTimeString([], {
                  hour: '2-digit',
                  minute: '2-digit',
                })}
              </time>
            </span>
          </button>
        ))}
        {redoEntriesCount > 0 && (
          <div className="history-redo-note">
            {redoEntriesCount} action(s) are available through Redo.
          </div>
        )}
      </div>
      <footer>
        <span>Click an older entry to undo newer actions sequentially.</span>
        <button disabled={!canClear} onClick={onClear}>
          <Trash2 size={13} /> Clear history
        </button>
      </footer>
    </section>
  );
}
