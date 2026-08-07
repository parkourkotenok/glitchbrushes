interface ImgFuckMarkProps {
  className?: string;
  size?: number;
}

export function ImgFuckMark({ className, size = 28 }: ImgFuckMarkProps) {
  return (
    <svg
      className={className}
      width={size}
      height={size}
      viewBox="0 0 32 32"
      role="img"
      aria-label="imgfuck mark"
    >
      <path className="imgfuck-mark-shell" d="M3 4h22v5h4v19H7v-4H3z" />
      <path className="imgfuck-mark-screen" d="M7 8h16v12H7z" />
      <path className="imgfuck-mark-cut" d="m8 19 5-6 4 3 6-7v11H8z" />
      <path className="imgfuck-mark-pixel" d="M25 12h5v5h-5zM2 23h6v5H2z" />
      <circle className="imgfuck-mark-eye" cx="12" cy="11" r="2" />
    </svg>
  );
}
