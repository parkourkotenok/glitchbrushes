import { describe, expect, it } from 'vitest';
import { mutateBytes } from './mutateBytes';

describe('mutateBytes raw file corruption kernel', () => {
  const length = 4096;
  const safeStart = 128;
  const xorAmount = 0x5a;

  function sample() {
    const input = new Uint8Array(length);
    for (let i = 0; i < length; i += 1) input[i] = i % 256;
    const copy = input.slice();
    const outcome = mutateBytes(copy, {
      safeStart,
      mutationCount: 1,
      rangeStart: 0,
      rangeEnd: 1,
      xorAmount,
      seed: 'test-seed',
    });
    return { input, copy, outcome };
  }

  it('protects the prefix and mutates exactly one byte by XOR', () => {
    const { input, copy, outcome } = sample();
    const differing: number[] = [];
    for (let i = 0; i < input.length; i += 1) {
      if (copy[i] !== input[i]) differing.push(i);
    }
    expect(differing).toHaveLength(1);
    const at = differing[0]!;
    expect(at).toBeGreaterThanOrEqual(safeStart);
    expect(copy[at]).toBe(input[at]! ^ xorAmount);
    expect(outcome.mutationCount).toBe(1);
    expect(outcome.range.start).toBeGreaterThanOrEqual(safeStart);
  });

  it('clamps the range inside the protected region', () => {
    const { copy, outcome } = sample();
    expect(outcome.range.start).toBeGreaterThanOrEqual(safeStart);
    expect(outcome.range.end).toBeLessThanOrEqual(length - 1);
    expect(outcome.range.end).toBeGreaterThanOrEqual(outcome.range.start);
    for (let i = 0; i < safeStart; i += 1) {
      expect(copy[i]).toBe(i % 256);
    }
  });

  it('is deterministic for the same seed and params', () => {
    const a = new Uint8Array(1024).fill(7);
    const b = new Uint8Array(1024).fill(7);
    const params = {
      safeStart: 64,
      mutationCount: 16,
      rangeStart: 0.2,
      rangeEnd: 0.8,
      xorAmount: 0xff,
      seed: 'fixed',
    };
    mutateBytes(a, params);
    mutateBytes(b, params);
    expect(Array.from(a)).toEqual(Array.from(b));
  });
});
