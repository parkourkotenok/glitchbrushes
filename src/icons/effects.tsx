import type { AlgorithmId, EffectIconId } from '../types';

interface EffectIconProps {
  id: EffectIconId;
  size?: number;
  className?: string;
}

const common = {
  fill: 'none',
  stroke: 'currentColor',
  strokeWidth: 1.55,
  strokeLinecap: 'round' as const,
  strokeLinejoin: 'round' as const,
};

function Glyph({ id }: { id: EffectIconId }) {
  switch (id) {
    case 'pixel-sort-brush':
      return (
        <>
          <path d="M2 3h10M4 6h11M2 9h9M5 12h10M3 15h9" />
          <path d="m13 2 3 3-3 3M14 10v6" />
        </>
      );
    case 'feedback-brush':
      return (
        <>
          <path d="M5 4h7a4 4 0 1 1-4 4" />
          <path d="m7 6-3 2 3 2M7 12h5a3 3 0 0 0 0-6" />
          <circle cx="4" cy="14" r="1.5" />
        </>
      );
    case 'displacement-brush':
      return (
        <>
          <path d="M2 4c3-3 5 3 8 0s4 1 6 0M2 9c3-3 5 3 8 0s4 1 6 0M2 14c3-3 5 3 8 0s4 1 6 0" />
          <path d="m12 6 3 3-3 3" />
        </>
      );
    case 'flow-mosh-brush':
      return (
        <>
          <rect x="2" y="3" width="4" height="4" />
          <rect x="7" y="7" width="4" height="4" />
          <rect x="12" y="11" width="4" height="4" />
          <path d="M5 11c4-5 7-5 10-3m-2-2 2 2-2 2" />
        </>
      );
    case 'clone-corruption-brush':
      return (
        <>
          <rect x="2" y="2" width="8" height="8" />
          <path d="M7 7h8v8H7zM10 5l3 3M4 13h2M12 3h3v3" />
        </>
      );
    case 'line-freeze-brush':
      return (
        <>
          <path d="M2 4h14M2 7h9m2 0h3M2 10h14M2 13h9m2 0h5" />
          <path d="M9 2v14m-2-2 2 2 2-2" />
        </>
      );
    case 'mirror-fold-brush':
      return (
        <>
          <path d="M9 2v14M7 4 3 7l4 3M11 4l4 3-4 3" />
          <path d="M3 13h4M11 13h4" />
        </>
      );
    case 'halftone-collapse-brush':
      return (
        <>
          <circle cx="4" cy="4" r="1.5" />
          <circle cx="9" cy="4" r="1" />
          <circle cx="14" cy="4" r=".6" />
          <circle cx="6" cy="9" r="2" />
          <circle cx="11" cy="9" r="1.3" />
          <circle cx="9" cy="14" r="2.4" />
        </>
      );
    case 'raster-loom-brush':
      return (
        <>
          <path d="M3 2v14M7 2v14M11 2v14M15 2v14" />
          <path d="M2 5h4m2 0h4m2 0h2M2 9h2m2 0h4m2 0h4M2 13h4m2 0h4m2 0h2" />
        </>
      );
    case 'contour-crawl-brush':
      return (
        <>
          <path d="M3 14c2-7 4-9 7-9 2 0 3 2 5 2" />
          <path d="M5 16c2-6 4-8 7-8 2 0 3 2 4 2M2 11c2-6 4-9 7-9" />
        </>
      );
    case 'pixel-embroidery':
      return <path d="m2 2 5 5m0-5L2 7m9-5 5 5m0-5-5 5M2 11l5 5m0-5-5 5m9-5 5 5m0-5-5 5" />;
    case 'xerox-decay':
      return (
        <>
          <path d="M4 2h8l2 2v10H4zM6 6h6M6 9h4M6 12h6" />
          <circle cx="15" cy="7" r=".7" fill="currentColor" />
          <circle cx="2" cy="12" r=".7" fill="currentColor" />
        </>
      );
    case 'slice':
      return (
        <>
          <path d="M2 4h11M5 8h11M2 12h11M13 6l3 2-3 2" />
        </>
      );
    case 'macroblock':
      return (
        <>
          <rect x="2" y="2" width="5" height="5" />
          <rect x="9" y="2" width="5" height="5" />
          <rect x="2" y="9" width="5" height="5" />
          <rect x="11" y="10" width="5" height="5" />
          <path d="M10 8l2 2" />
        </>
      );
    case 'datamosh':
      return (
        <>
          <rect x="2" y="5" width="5" height="7" />
          <path d="M8 6h7M8 9h9M8 12h6M13 4l3 2-3 2" />
        </>
      );
    case 'rgb-split':
      return (
        <>
          <rect x="2" y="4" width="9" height="9" />
          <rect x="5" y="2" width="9" height="9" />
          <rect x="7" y="6" width="9" height="9" />
        </>
      );
    case 'scanline':
      return (
        <>
          <path d="M2 3h14M2 6h6m3 0h5M2 9h10m2 0h2M2 12h5m3 0h6M2 15h14" />
        </>
      );
    case 'packet-loss':
      return (
        <>
          <path d="M2 2h5v5H2zM9 2h5v5H9zM2 9h5v5H2z" />
          <path d="M10 10h4v4" />
        </>
      );
    case 'compression':
      return (
        <>
          <rect x="2" y="2" width="14" height="14" />
          <path d="M6 2v14M10 2v7m0 3v4M14 2v14M2 6h14M2 10h7m3 0h4M2 14h14" />
        </>
      );
    case 'tile-scramble':
      return (
        <>
          <rect x="2" y="2" width="5" height="5" />
          <rect x="11" y="2" width="5" height="5" />
          <rect x="2" y="11" width="5" height="5" />
          <rect x="11" y="11" width="5" height="5" />
          <path d="M7 4h4m-2-2 2 2-2 2M11 14H7m2-2-2 2 2 2" />
        </>
      );
    case 'row-repeat':
      return (
        <>
          <path d="M3 4h12M3 7h9M3 10h12M3 13h9" />
          <path d="M14 6v8m-2-2 2 2 2-2" />
        </>
      );
    case 'mixed':
      return (
        <>
          <path d="M3 3l12 12M15 3 3 15M2 7h5M11 11h5" />
          <path d="m12 2 3 1-1 3M4 12l-1 3 3 1" />
        </>
      );
    case 'pixel-noise':
      return (
        <>
          <circle cx="3" cy="5" r=".8" fill="currentColor" />
          <circle cx="8" cy="3" r=".8" fill="currentColor" />
          <circle cx="14" cy="6" r=".8" fill="currentColor" />
          <circle cx="5" cy="12" r=".8" fill="currentColor" />
          <circle cx="11" cy="10" r=".8" fill="currentColor" />
          <circle cx="15" cy="14" r=".8" fill="currentColor" />
        </>
      );
    case 'bit-flip':
      return (
        <>
          <path d="M2 5h3v8H2M8 5h3v8H8M15 5v8" />
          <path d="m13 7 2-2 2 2" />
        </>
      );
    case 'palette':
      return (
        <>
          <path d="M2 4h4v10H2zM7 6h4v8H7zM12 9h4v5h-4z" />
        </>
      );
    case 'channel-shift':
      return (
        <>
          <path d="M2 5h9M5 9h11M2 13h9" />
          <path d="m9 3 2 2-2 2m5 0 2 2-2 2m-5 0 2 2-2 2" />
        </>
      );
    case 'byte-swap':
      return (
        <>
          <rect x="2" y="4" width="5" height="6" />
          <rect x="11" y="8" width="5" height="6" />
          <path d="M7 5h6l-2-2m0 10H5l2 2" />
        </>
      );
    case 'pixel-sort':
      return (
        <>
          <path d="M2 4h12M4 7h10M2 10h12M6 13h8" />
          <path d="M15 3v11m-2-2 2 2 2-2" />
        </>
      );
    case 'feedback':
      return (
        <>
          <rect x="3" y="3" width="9" height="9" />
          <rect x="6" y="6" width="9" height="9" />
          <path d="M13 3a4 4 0 0 1 3 4m0 0-2-2m2 2 2-2" />
        </>
      );
    case 'motion-field':
      return (
        <>
          <path d="M2 4h10m-2-2 2 2-2 2M5 9h10m-2-2 2 2-2 2M2 14h10m-2-2 2 2-2 2" />
        </>
      );
    case 'motion-transfer':
      return (
        <>
          <rect x="2" y="3" width="5" height="5" />
          <rect x="11" y="10" width="5" height="5" />
          <path d="M7 6c5 0 2 6 6 6m-2-2 2 2-2 2" />
        </>
      );
    case 'chroma-drift':
      return (
        <>
          <path d="M2 5h10M5 9h11M2 13h10" />
          <circle cx="13" cy="5" r="2" />
          <circle cx="3" cy="9" r="2" />
        </>
      );
    case 'dct-damage':
      return (
        <>
          <rect x="2" y="2" width="14" height="14" />
          <path d="M2 6h14M2 10h14M6 2v14M10 2v14M5 14l2-5 2 3 2-7 2 5" />
        </>
      );
    case 'edge-melt':
      return (
        <>
          <path d="M3 3h8l3 3-4 2 3 2-5 2 2 3H3" />
          <path d="M12 7v8m-2-2 2 2 2-2" />
        </>
      );
    case 'flow-field':
      return (
        <>
          <path d="M2 5c3-4 5 4 8 0s5 0 6 1M2 10c3-4 5 4 8 0s5 0 6 1M2 15c3-4 5 4 8 0s5 0 6 1" />
        </>
      );
    case 'image-brush':
      return (
        <>
          <rect x="2" y="2" width="7" height="7" />
          <path d="m3.5 7 1.8-2 2.2 2.5M11 5h4v4h-4zM8 11h3v3H8zM13 12h3v3h-3z" />
        </>
      );
    case 'smudge':
      return (
        <>
          <path d="M3 13c3-1 3-8 6-8s2 5 5 5" />
          <path d="M2 15c4-2 7 1 12-2M5 4c1-2 3-2 4-1" />
        </>
      );
    case 'finger':
      return (
        <>
          <path d="M6 9V4a1.4 1.4 0 0 1 2.8 0v4-5a1.4 1.4 0 0 1 2.8 0v5-3.5a1.4 1.4 0 0 1 2.8 0V10" />
          <path d="M6 8 4.7 6.7a1.5 1.5 0 0 0-2.1 2.1l4.2 5.1c.8 1 2 1.6 3.3 1.6h.8c2.5 0 4.5-2 4.5-4.5V7a1.4 1.4 0 0 0-1-1.3" />
        </>
      );
    case 'blur':
      return (
        <>
          <circle cx="9" cy="9" r="2" />
          <circle cx="9" cy="9" r="5" opacity=".7" />
          <circle cx="9" cy="9" r="7" opacity=".35" />
        </>
      );
    case 'sharpen':
      return (
        <>
          <path d="m9 2 2 5 5 2-5 2-2 5-2-5-5-2 5-2z" />
          <circle cx="9" cy="9" r="2" />
        </>
      );
    case 'eraser':
      return (
        <>
          <path d="m3 11 7-8 5 5-7 8H4l-2-2z" />
          <path d="m8 16 7-8M10 13h6" />
        </>
      );
    case 'restore':
      return (
        <>
          <path d="M4 5a6 6 0 1 1-1 7" />
          <path d="M4 2v4H1" />
        </>
      );
    case 'hex':
      return (
        <>
          <path d="M3 4h4v10H3M11 4h4v10h-4M1 8h16M1 11h16" />
        </>
      );
  }
}

export function EffectIcon({ id, size = 18, className }: EffectIconProps) {
  return (
    <svg
      aria-hidden="true"
      className={className}
      width={size}
      height={size}
      viewBox="0 0 18 18"
      {...common}
    >
      <Glyph id={id} />
    </svg>
  );
}

export const algorithmIconIds: Record<AlgorithmId, EffectIconId> = {
  'pixel-sort-brush': 'pixel-sort-brush',
  'feedback-brush': 'feedback-brush',
  'displacement-brush': 'displacement-brush',
  'flow-mosh-brush': 'flow-mosh-brush',
  'clone-corruption-brush': 'clone-corruption-brush',
  'line-freeze-brush': 'line-freeze-brush',
  'mirror-fold-brush': 'mirror-fold-brush',
  'halftone-collapse-brush': 'halftone-collapse-brush',
  'raster-loom-brush': 'raster-loom-brush',
  'contour-crawl-brush': 'contour-crawl-brush',
  'slice-displacement': 'slice',
  'macroblock-shift': 'macroblock',
  'datamosh-smear': 'datamosh',
  'packet-loss': 'packet-loss',
  'rgb-chunk-split': 'rgb-split',
  'compression-block-damage': 'compression',
  'codec-block-damage': 'compression',
  'scanline-tear-pro': 'scanline',
  'tile-scramble': 'tile-scramble',
  'row-column-repeat': 'row-repeat',
  'structural-mixed': 'mixed',
  'byte-noise': 'pixel-noise',
  'channel-shift': 'channel-shift',
  'byte-swap': 'byte-swap',
  'bit-flip': 'bit-flip',
  'block-corruption': 'macroblock',
  'data-smear': 'datamosh',
  scanline: 'scanline',
  compression: 'compression',
  'palette-collapse': 'palette',
  mixed: 'mixed',
};

export const effectIconIds: readonly EffectIconId[] = [
  'pixel-sort-brush',
  'feedback-brush',
  'displacement-brush',
  'flow-mosh-brush',
  'clone-corruption-brush',
  'line-freeze-brush',
  'mirror-fold-brush',
  'halftone-collapse-brush',
  'raster-loom-brush',
  'contour-crawl-brush',
  'pixel-embroidery',
  'xerox-decay',
  'slice',
  'macroblock',
  'datamosh',
  'rgb-split',
  'scanline',
  'packet-loss',
  'compression',
  'tile-scramble',
  'row-repeat',
  'mixed',
  'pixel-noise',
  'bit-flip',
  'palette',
  'channel-shift',
  'byte-swap',
  'pixel-sort',
  'feedback',
  'motion-field',
  'motion-transfer',
  'chroma-drift',
  'dct-damage',
  'edge-melt',
  'flow-field',
  'smudge',
  'finger',
  'blur',
  'sharpen',
  'restore',
  'eraser',
  'hex',
  'image-brush',
];
