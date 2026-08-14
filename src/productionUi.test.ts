import { describe, expect, it } from 'vitest';
import { resolveControlHelp } from './help/registry';
import { resolveEditorShortcut } from './utils/shortcuts';
import appSource from './App.tsx?raw';
import algorithmControlsSource from './components/AlgorithmControls.tsx?raw';
import canvasWorkspaceSource from './components/CanvasWorkspace.tsx?raw';
import effectPanelSource from './components/EffectPanel.tsx?raw';
import fileCorruptionSource from './components/FileCorruptionPanel.tsx?raw';
import retouchPanelSource from './components/RetouchPanel.tsx?raw';
import statusBarSource from './components/StatusBar.tsx?raw';
import topBarSource from './components/TopBar.tsx?raw';
import rawMutationModuleSource from './raw/mutateBytes.ts?raw';
import rawWorkerSource from './workers/rawMutation.worker.ts?raw';

describe('production editor cleanup', () => {
  it('does not import, route or render the HEX editor in the production App', () => {
    expect(appSource).not.toContain('import { HexEditor }');
    expect(appSource).not.toContain("activePanel === 'hex'");
    expect(appSource).not.toContain("setActivePanel('hex')");
    expect(appSource).not.toContain('> HEX<');
    expect(appSource).not.toContain('Inspect pixel in HEX editor');
  });

  it('renders the complete factual FILE CORRUPTION explanation and control names', () => {
    const source = `${appSource}\n${fileCorruptionSource}`;
    expect(source).toContain('Experimental corruption of the encoded image file.');
    expect(source).toContain('This is not a local brush effect.');
    expect(source).toContain('Use EFFECT, MOSH LAB or IMAGE BRUSH for controlled local editing.');
    for (const label of [
      'Protected Prefix',
      'Mutation Count',
      'Mutation Range',
      'XOR Amount',
      'Retry Limit',
      'DECODE STATUS',
      'What happens internally',
    ]) {
      expect(source).toContain(label);
    }
  });

  it('passes every FILE CORRUPTION control into the encoded-byte Worker', () => {
    // The worker delegates to the shared mutation kernel; the kernel must
    // receive every File Corruption control and the worker must use it.
    expect(rawWorkerSource).toContain('mutateBytes');
    for (const field of [
      'safeStart',
      'mutationCount',
      'rangeStart',
      'rangeEnd',
      'xorAmount',
      'seed',
    ]) {
      expect(rawMutationModuleSource).toContain(field);
    }
    expect(rawWorkerSource).not.toContain('intensity');
  });

  it('provides factual help for every FILE CORRUPTION slider', () => {
    expect(resolveControlHelp('file-corruption.protected-prefix').description).toContain('64');
    expect(resolveControlHelp('file-corruption.mutation-count').description).toContain(
      'distinct changed byte positions',
    );
    expect(resolveControlHelp('file-corruption.xor-amount').short).toContain('exact 8-bit value');
    expect(resolveControlHelp('file-corruption.retry-limit').description).toContain(
      'unchanged pre-operation bytes',
    );
  });

  it('maps Retouch shortcuts from physical codes so Cyrillic layout does not change them', () => {
    expect(resolveEditorShortcut({ code: 'KeyS' })).toBe('smudge');
    expect(resolveEditorShortcut({ code: 'KeyU' })).toBe('blur-retouch');
    expect(resolveEditorShortcut({ code: 'KeyJ' })).toBe('sharpen');
    expect(resolveEditorShortcut({ code: 'KeyE' })).toBe('restore');
    expect(resolveEditorShortcut({ code: 'KeyX' })).toBe('eraser');
  });

  it('does not mount the expensive Retouch tool preview', () => {
    expect(retouchPanelSource).not.toContain('RetouchPreviewStage');
    expect(retouchPanelSource).not.toContain('REAL TOOL PREVIEW');
  });

  it('keeps multi-megabyte document pixel buffers out of ordinary React UI props', () => {
    expect(appSource).toContain('doc={documentMeta}');
    expect(appSource).toContain('documentWidth={doc.width}');
    expect(appSource).not.toContain('original={doc.original}');
    expect(topBarSource).not.toContain('EditorDocument');
    expect(canvasWorkspaceSource).not.toContain('EditorDocument');
    expect(statusBarSource).not.toContain('EditorDocument');
    expect(effectPanelSource).not.toContain('Uint8ClampedArray');
  });

  it('exposes six explicit Clone Corruption modes and factual source alignment', () => {
    const source = `${appSource}\n${algorithmControlsSource}`;
    for (const label of [
      'Clean Clone',
      'Fragment Clone',
      'Slice Clone',
      'Packet Clone',
      'RGB Clone',
      'Evolving Clone',
    ]) {
      expect(source).toContain(label);
    }
    expect(source).toContain('source and destination move together');
    expect(source).toContain('reuse the picked source');
  });
});
