import { describe, expect, it } from 'vitest';
import { createDemoDocument } from './useDocument';

describe('createDemoDocument', () => {
  it('uses a tiny transparent placeholder while the real demo decodes', () => {
    const document = createDemoDocument();

    expect(document.width).toBe(1);
    expect(document.height).toBe(1);
    expect(document.fileName).toBe('loading-demo-image.png');
    expect([...document.background]).toEqual([255, 255, 255, 255]);
    expect([...document.original]).toEqual([0, 0, 0, 0]);
    expect([...document.pixels]).toEqual([0, 0, 0, 0]);
  });
});
