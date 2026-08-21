import type { AlgorithmId } from '../types';

/** Plain-language copy for every EFFECT algorithm, used by the picker and summary. */
export const algorithmDescriptions: Record<AlgorithmId, string> = {
  'slice-displacement': 'Shifts whole horizontal or vertical slices to create clean local tearing.',
  'macroblock-shift': 'Copies, duplicates, swaps, and stretches chunky rectangular macroblocks.',
  'datamosh-smear': 'Propagates image chunks along the stroke vector with decay and chroma drift.',
  'packet-loss':
    'Drops aligned encoded-looking regions into repeated neighbors or flat damaged blocks.',
  'rgb-chunk-split': 'Separates RGB channels across whole bands and rectangular fragments.',
  'compression-block-damage':
    'Breaks aligned 8×8 or 16×16 tiles through quantization, replication, and scrambling.',
  'codec-block-damage':
    'Combines compression loss, coefficient dropout, tile scrambling, repeats, and recompression in one codec-failure engine.',
  'scanline-tear-pro':
    'Offsets, duplicates, drops, and color-splits coherent horizontal scan bands.',
  'tile-scramble':
    'Permutes a local grid of image tiles while optionally repeating or dropping cells.',
  'row-column-repeat': 'Freezes and repeats complete rows or columns like a stalled image buffer.',
  'structural-mixed':
    'Organically layers two or three compatible effects from the complete brush and structural catalog.',
  'pixel-sort-brush':
    'Sorts coherent pixel intervals directly under the stroke by luminance, hue, saturation, or RGB sum.',
  'feedback-brush':
    'Builds transformed recursive echoes from committed effect-owned feedback memory.',
  'displacement-brush':
    'Warps painted coordinates through noise, waves, edges, luminance, pressure, radial, or vortex fields.',
  'flow-mosh-brush':
    'Propagates macroblock motion along the real stroke vector with decay, jitter, and chroma lag.',
  'clone-corruption-brush':
    'Samples an explicit on-canvas source region and paints fragmented, repeated corrupt clones.',
  'line-freeze-brush':
    'Freezes and repeats structured rows, columns, or stroke-aligned lines through the painted area.',
  'mirror-fold-brush':
    'Reflects sampled pixels across a local axis derived from the stroke direction.',
  'halftone-collapse-brush':
    'Collapses a directional luminance-driven dot grid toward the painted stroke axis.',
  'raster-loom-brush':
    'Weaves alternating forward and backward resampled strips along the stroke direction.',
  'contour-crawl-brush':
    'Detects local image contours and repeats those lines along the painted movement vector.',
  'byte-noise': 'Mutates individual R, G, B, and optional alpha bytes under the brush mask.',
  'channel-shift': 'Reads RGB channels from offset coordinates to tear color planes apart.',
  'byte-swap': 'Reorders channels or exchanges values with neighboring pixels.',
  'bit-flip': 'Uses XOR to toggle selected bits inside channel bytes.',
  'block-corruption':
    'Packet-loss-first block damage with Shift, Repeat, Dropout, Neighbor, Swap, Stretch, and Mixed modes.',
  'data-smear': 'Drags source bytes along the direction of the brush movement.',
  scanline: 'Builds broken horizontal scan bands with channel displacement.',
  compression: 'Quantizes local 8×8 or 16×16 blocks into damaged compression tiles.',
  'palette-collapse': 'Collapses color values into a reduced, optionally dithered palette.',
  mixed: 'Deterministically combines several corruption algorithms per stamp.',
};
