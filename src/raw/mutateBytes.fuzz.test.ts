import { describe, expect, it } from 'vitest';
import { mutateBytes, type RawMutationParams } from './mutateBytes';

/**
 * Deterministic PRNG so the fuzz corpus is fully reproducible across runs.
 * Mirrors the seeded style used elsewhere in the codebase (utils/prng).
 */
function lcg(seed: number): () => number {
  let state = seed >>> 0;
  return () => {
    state = (state * 1664525 + 1013904223) >>> 0;
    return state / 0xffffffff;
  };
}

function randomParams(rand: () => number, length: number): RawMutationParams {
  const a = rand();
  const b = rand();
  return {
    safeStart: Math.floor(rand() * length),
    mutationCount: Math.floor(rand() * 512) + 1,
    rangeStart: Math.min(a, b),
    rangeEnd: Math.max(a, b),
    // Deliberately includes 256 so the kernel clamps to 255.
    xorAmount: Math.floor(rand() * 256) + 1,
    seed: `fuzz-${Math.floor(rand() * 1e9)}`,
  };
}

/** Aggregates invariant violations and reports them with a single assertion. */
class Violations {
  private readonly brand: string;
  private count = 0;
  private readonly sampled: string[] = [];

  constructor(brand: string) {
    this.brand = brand;
  }

  flag(message: string): void {
    this.count += 1;
    if (this.sampled.length < 5) this.sampled.push(message);
  }

  expect(request: string): void {
    expect(this.count, `${this.brand} | ${request}\n${this.sampled.join('\n')}`).toBe(0);
  }
}

describe('mutateBytes fuzz invariants', () => {
  it('never throws and preserves invariants across a large random corpus', () => {
    const rand = lcg(0xc0ffee);
    const iterations = 1500;
    const violations = new Violations(`mutateBytes corpus (${iterations} cases)`);

    for (let t = 0; t < iterations; t += 1) {
      const length = 8 + Math.floor(rand() * 2000);
      const input = new Uint8Array(length);
      for (let i = 0; i < length; i += 1) input[i] = Math.floor(rand() * 256);
      const params = randomParams(rand, length);
      const bytes = input.slice();

      let outcome: ReturnType<typeof mutateBytes> | undefined;
      try {
        outcome = mutateBytes(bytes, params);
      } catch (error) {
        violations.flag(`case ${t}: threw ${String(error)}`);
        continue;
      }
      if (!outcome) continue;

      // Outcome is always well-formed and clamped.
      if (outcome.mutationCount < 1)
        violations.flag(`case ${t}: mutationCount=${outcome.mutationCount}`);
      if (outcome.xorAmount < 1 || outcome.xorAmount > 255)
        violations.flag(`case ${t}: xorAmount=${outcome.xorAmount}`);
      if (outcome.range.end < outcome.range.start) violations.flag(`case ${t}: reversed range`);
      if (outcome.range.start < params.safeStart)
        violations.flag(`case ${t}: start ${outcome.range.start} < safeStart ${params.safeStart}`);
      if (outcome.range.end > length - 1)
        violations.flag(`case ${t}: end ${outcome.range.end} > ${length - 1}`);

      // Protected prefix is never touched.
      for (let i = 0; i < params.safeStart; i += 1) {
        if (bytes[i] !== input[i]) {
          violations.flag(`case ${t}: prefix byte ${i} changed`);
          break;
        }
      }

      // Nothing outside the reported range changes; anything inside that did
      // change must equal the original XORed with the applied mask.
      for (let i = params.safeStart; i < length; i += 1) {
        if (i < outcome.range.start || i > outcome.range.end) {
          if (bytes[i] !== input[i]) {
            violations.flag(`case ${t}: byte ${i} changed outside range`);
            break;
          }
        } else if (bytes[i] !== input[i] && bytes[i] !== (input[i]! ^ outcome.xorAmount)) {
          violations.flag(`case ${t}: byte ${i} corrupted beyond XOR`);
          break;
        }
      }

      // Re-applying the identical mutation (same seed) returns the original
      // bytes, because every position is XORed the same number of times.
      mutateBytes(bytes, params);
      for (let i = 0; i < length; i += 1) {
        if (bytes[i] !== input[i]) {
          violations.flag(`case ${t}: double-apply left byte ${i} changed`);
          break;
        }
      }
    }

    violations.expect('must hold across the whole corpus');
  });
});
