import { describe, expect, it } from 'vitest';
import { resizeRgbaBilinear } from './resizeRgba';

describe('layer transform resize', () => {
  it('preserves corners and output dimensions', () => {
    const source = new Uint8ClampedArray([
      255, 0, 0, 255, 0, 255, 0, 255, 0, 0, 255, 255, 255, 255, 255, 255,
    ]);
    const output = resizeRgbaBilinear(source, 2, 2, 4, 4);
    expect(output).toHaveLength(4 * 4 * 4);
    expect([...output.slice(0, 4)]).toEqual([255, 0, 0, 255]);
    expect([...output.slice(-4)]).toEqual([255, 255, 255, 255]);
  });

  it('interpolates transparent pixels without dark color fringes', () => {
    const source = new Uint8ClampedArray([255, 0, 0, 255, 0, 0, 0, 0]);
    const output = resizeRgbaBilinear(source, 2, 1, 3, 1);
    expect(output[4]).toBe(255);
    expect(output[7]).toBeGreaterThan(0);
  });
});
