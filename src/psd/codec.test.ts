import { describe, expect, it } from 'vitest';
import { decodePsdBytes, encodePsdBytes } from './codec';

describe('PSD codec', () => {
  it('rejects an oversized PSD from its header before decoding layer pixels', () => {
    const header = new ArrayBuffer(26);
    const bytes = new Uint8Array(header);
    bytes.set([0x38, 0x42, 0x50, 0x53]);
    const view = new DataView(header);
    view.setUint16(4, 1);
    view.setUint16(12, 4);
    view.setUint32(14, 2_000);
    view.setUint32(18, 2_000);
    view.setUint16(22, 8);
    view.setUint16(24, 3);

    expect(() => decodePsdBytes(header)).toThrow(/2000000 pixel editing limit/);
  });

  it('round-trips raster layer order, position and supported metadata', () => {
    const red = new Uint8ClampedArray([255, 0, 0, 255, 255, 0, 0, 255]);
    const blue = new Uint8ClampedArray([0, 0, 255, 128]);
    const bytes = encodePsdBytes({
      width: 3,
      height: 2,
      composite: new Uint8ClampedArray(3 * 2 * 4),
      layers: [
        {
          name: 'Bottom',
          x: 0,
          y: 0,
          width: 2,
          height: 1,
          pixels: red,
          visible: true,
          opacity: 1,
          blendMode: 'source-over',
        },
        {
          name: 'Top',
          x: 2,
          y: 1,
          width: 1,
          height: 1,
          pixels: blue,
          visible: false,
          opacity: 0.5,
          blendMode: 'multiply',
        },
      ],
    });
    const decoded = decodePsdBytes(
      bytes.buffer.slice(bytes.byteOffset, bytes.byteOffset + bytes.byteLength),
    );
    expect(decoded.width).toBe(3);
    expect(decoded.height).toBe(2);
    expect(decoded.layers.map((layer) => layer.name)).toEqual(['Bottom', 'Top']);
    expect(decoded.layers[1]).toMatchObject({
      x: 2,
      y: 1,
      width: 1,
      height: 1,
      visible: false,
      blendMode: 'multiply',
    });
    expect(decoded.layers[1]!.opacity).toBeCloseTo(0.5, 2);
    expect(decoded.layers[1]!.pixels).toEqual(blue);
  });
});
