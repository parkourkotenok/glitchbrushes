export function isTypingTarget(target: EventTarget | null): boolean {
  const element = target as HTMLElement | null;
  if (!element || typeof element.tagName !== 'string') return false;
  return (
    element.tagName === 'INPUT' ||
    element.tagName === 'TEXTAREA' ||
    element.tagName === 'SELECT' ||
    element.isContentEditable ||
    Boolean(typeof element.closest === 'function' && element.closest('[contenteditable="true"]'))
  );
}

export type EditorShortcutAction =
  | 'undo'
  | 'redo'
  | 'brush'
  | 'hand'
  | 'restore'
  | 'smudge'
  | 'finger'
  | 'blur-retouch'
  | 'sharpen'
  | 'eraser'
  | 'glitch'
  | 'fit'
  | 'zoom-100'
  | 'brush-smaller'
  | 'brush-larger'
  | 'temporary-pan'
  | 'show-original'
  | 'apply-preview'
  | 'escape'
  | 'reset';

export interface ShortcutEventLike {
  code: string;
  ctrlKey?: boolean;
  metaKey?: boolean;
  shiftKey?: boolean;
  repeat?: boolean;
}

export function resolveEditorShortcut(
  event: ShortcutEventLike,
  typing = false,
): EditorShortcutAction | null {
  if (event.repeat) return null;
  if (typing) return event.code === 'Escape' ? 'escape' : null;
  const command = Boolean(event.ctrlKey || event.metaKey);
  if (command) {
    if (event.code === 'KeyZ') return event.shiftKey ? 'redo' : 'undo';
    if (event.code === 'KeyY') return 'redo';
    return null;
  }
  const physicalKeys: Record<string, EditorShortcutAction> = {
    KeyB: 'brush',
    KeyH: 'hand',
    KeyE: 'restore',
    KeyS: 'smudge',
    KeyR: 'finger',
    KeyU: 'blur-retouch',
    KeyJ: 'sharpen',
    KeyX: 'eraser',
    KeyG: 'glitch',
    KeyF: 'fit',
    Digit1: 'zoom-100',
    BracketLeft: 'brush-smaller',
    BracketRight: 'brush-larger',
    Space: 'temporary-pan',
    Backslash: 'show-original',
    Enter: 'apply-preview',
    Escape: 'escape',
    Delete: 'reset',
  };
  return physicalKeys[event.code] ?? null;
}
