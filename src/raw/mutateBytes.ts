import { createSeededRandom } from '../utils/prng';

/**
 * Pure byte-mutation kernel used by the rawMutation Worker.
 * Kept free of DOM/Worker so it can be unit-tested in Node.
 * Applies `xorAmount` to `mutationCount` seeded positions inside
 * `[rangeStart, rangeEnd]` (0..1 fractions of the mutable region), where
 * the region is everything after `safeStart` (the protected prefix, >= 64
 * bytes). A position may be hit more than once, so collisions cancel out.
 */
export interface RawMutationParams {
  safeStart: number;
  mutationCount: number;
  rangeStart: number;
  rangeEnd: number;
  xorAmount: number;
  seed: string;
}

export interface RawMutationOutcome {
  mutationCount: number;
  range: { start: number; end: number };
  xorAmount: number;
}

export function mutateBytes(bytes: Uint8Array, params: RawMutationParams): RawMutationOutcome {
  const random = createSeededRandom(params.seed);
  const available = Math.max(1, bytes.length - params.safeStart);
  const range = (fraction: number, fallback: number) =>
    Math.min(
      bytes.length - 1,
      params.safeStart + Math.floor(available * Math.max(0, Math.min(1, fraction))),
    );
  const start = range(params.rangeStart, 0);
  const end = Math.max(start, range(params.rangeEnd, start));
  const count = Math.max(1, Math.round(params.mutationCount));
  const xor = Math.max(1, Math.min(255, Math.round(params.xorAmount)));

  for (let index = 0; index < count; index += 1) {
    const offset = random.int(start, end);
    bytes[offset] = bytes[offset]! ^ xor;
  }

  return { mutationCount: count, range: { start, end }, xorAmount: xor };
}
