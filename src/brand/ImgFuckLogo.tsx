interface ImgFuckLogoProps {
  className?: string;
  compact?: boolean;
}

export function ImgFuckLogo({ className, compact = false }: ImgFuckLogoProps) {
  return (
    <svg
      className={className}
      viewBox="0 0 188 38"
      data-compact={compact || undefined}
      role="img"
      aria-label="imgfuck"
    >
      <g className="imgfuck-logo-frame" aria-hidden="true">
        <path d="M3 7V3h20v4M3 22v4h20v-4" />
        <path d="M7 10h12v9H7z" />
        <path d="m8 18 4-4 3 2 4-5" />
        <circle cx="17" cy="11" r="1.6" />
      </g>
      <text className="imgfuck-logo-word" x="28" y="24">
        imgfuck
      </text>
      <g className="imgfuck-logo-glitch" aria-hidden="true">
        <path d="M73 4h12v3H73zM107 26h20v3h-20zM151 8h9v3h-9z" />
        <path d="M91 12h6v3h-6zM164 22h17v3h-17z" />
      </g>
    </svg>
  );
}
