export type ToolGlyphId =
  | 'brush'
  | 'smudge'
  | 'blur'
  | 'sharpen'
  | 'restore'
  | 'eraser'
  | 'random'
  | 'effect'
  | 'retouch'
  | 'mosh'
  | 'image-brush'
  | 'raw';

interface ToolGlyphProps {
  id: ToolGlyphId;
  size?: number;
  className?: string;
}

export function ToolGlyph({ id, size = 20, className }: ToolGlyphProps) {
  const common = {
    className: `tool-glyph ${className ?? ''}`.trim(),
    width: size,
    height: size,
    viewBox: '0 0 24 24',
    fill: 'none',
    stroke: 'currentColor',
    strokeWidth: 2.2,
    strokeLinecap: 'round' as const,
    strokeLinejoin: 'round' as const,
    'aria-hidden': true,
  };

  if (id === 'brush')
    return (
      <svg {...common}>
        <path d="m4 19 4-1 10-10-3-3L5 15l-1 4Z" />
        <path d="m13 7 3 3M3 21h8" />
        <path d="M17 4h3v3" />
      </svg>
    );
  if (id === 'smudge')
    return (
      <svg {...common}>
        <path d="M5 16c4-7 6-9 8-7 2 2-3 5-1 7 2 2 4-3 7-2" />
        <path d="M4 20c5-2 11 2 16-1M4 12c2-1 3-4 5-7" />
      </svg>
    );
  if (id === 'blur')
    return (
      <svg {...common}>
        <circle cx="12" cy="12" r="4" />
        <circle cx="12" cy="12" r="8" strokeDasharray="2 3" />
        <path d="M12 3v2m0 14v2M3 12h2m14 0h2" />
      </svg>
    );
  if (id === 'sharpen')
    return (
      <svg {...common}>
        <path d="m12 3 2.2 5.8L20 11l-5.8 2.2L12 19l-2.2-5.8L4 11l5.8-2.2L12 3Z" />
        <path d="m18 3 .8 2.2L21 6l-2.2.8L18 9" />
      </svg>
    );
  if (id === 'restore')
    return (
      <svg {...common}>
        <path d="M5 8V4m0 0h4M5 4a9 9 0 1 1-1 10" />
        <path d="m9 12 2 2 5-5" />
      </svg>
    );
  if (id === 'eraser')
    return (
      <svg {...common}>
        <path d="m4 15 8-10 7 6-7 8H7l-3-4Z" />
        <path d="m9 18 6-7M12 21h8" />
      </svg>
    );
  if (id === 'random')
    return (
      <svg {...common}>
        <path d="M4 7h3c4 0 5 10 9 10h4" />
        <path d="m17 14 3 3-3 3M4 17h3c2 0 3-2 4-4M14 7c1-1 2-1 3-1h3" />
        <path d="m17 3 3 3-3 3" />
      </svg>
    );
  if (id === 'effect')
    return (
      <svg {...common}>
        <path d="M4 6h16M4 12h16M4 18h16" />
        <circle cx="8" cy="6" r="2" fill="currentColor" stroke="none" />
        <circle cx="15" cy="12" r="2" fill="currentColor" stroke="none" />
        <circle cx="11" cy="18" r="2" fill="currentColor" stroke="none" />
      </svg>
    );
  if (id === 'retouch')
    return (
      <svg {...common}>
        <path d="M12 3C8 8 6 11 6 15a6 6 0 0 0 12 0c0-4-2-7-6-12Z" />
        <path d="M9 16c1 2 3 2 5 1" />
      </svg>
    );
  if (id === 'mosh')
    return (
      <svg {...common}>
        <path d="M3 6h9v4H6v4h12v4h3" />
        <path d="M14 4h7v4h-7zM3 16h5v4H3z" />
      </svg>
    );
  if (id === 'image-brush')
    return (
      <svg {...common}>
        <path d="M3 5h13v11H3z" />
        <path d="m4 15 4-5 3 3 4-5" />
        <path d="m14 20 6-6M17 13l3 3M12 21h4" />
      </svg>
    );
  return (
    <svg {...common}>
      <path d="M5 3h14v18H5z" />
      <path d="M8 7h8M8 11h5M8 15h8" />
      <path d="m16 10 3 2-3 2" />
    </svg>
  );
}
