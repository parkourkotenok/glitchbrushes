/** Premultiplied-alpha bilinear resize used off the UI thread for layer transforms. */
export function resizeRgbaBilinear(
  source: Uint8ClampedArray,
  sourceWidth: number,
  sourceHeight: number,
  targetWidth: number,
  targetHeight: number,
): Uint8ClampedArray {
  if (
    sourceWidth <= 0 ||
    sourceHeight <= 0 ||
    targetWidth <= 0 ||
    targetHeight <= 0 ||
    source.length !== sourceWidth * sourceHeight * 4
  ) {
    throw new Error('Invalid RGBA resize dimensions.');
  }
  if (sourceWidth === targetWidth && sourceHeight === targetHeight) return source.slice();
  const output = new Uint8ClampedArray(targetWidth * targetHeight * 4);
  const scaleX = sourceWidth / targetWidth;
  const scaleY = sourceHeight / targetHeight;
  for (let y = 0; y < targetHeight; y += 1) {
    const sourceY = Math.max(0, Math.min(sourceHeight - 1, (y + 0.5) * scaleY - 0.5));
    const y0 = Math.floor(sourceY);
    const y1 = Math.min(sourceHeight - 1, y0 + 1);
    const fy = sourceY - y0;
    for (let x = 0; x < targetWidth; x += 1) {
      const sourceX = Math.max(0, Math.min(sourceWidth - 1, (x + 0.5) * scaleX - 0.5));
      const x0 = Math.floor(sourceX);
      const x1 = Math.min(sourceWidth - 1, x0 + 1);
      const fx = sourceX - x0;
      const weights = [(1 - fx) * (1 - fy), fx * (1 - fy), (1 - fx) * fy, fx * fy];
      const offsets = [
        (y0 * sourceWidth + x0) * 4,
        (y0 * sourceWidth + x1) * 4,
        (y1 * sourceWidth + x0) * 4,
        (y1 * sourceWidth + x1) * 4,
      ];
      let alpha = 0;
      let red = 0;
      let green = 0;
      let blue = 0;
      for (let sample = 0; sample < 4; sample += 1) {
        const offset = offsets[sample]!;
        const weight = weights[sample]!;
        const sampleAlpha = source[offset + 3]! / 255;
        alpha += sampleAlpha * weight;
        red += source[offset]! * sampleAlpha * weight;
        green += source[offset + 1]! * sampleAlpha * weight;
        blue += source[offset + 2]! * sampleAlpha * weight;
      }
      const destination = (y * targetWidth + x) * 4;
      if (alpha > 0) {
        output[destination] = Math.round(red / alpha);
        output[destination + 1] = Math.round(green / alpha);
        output[destination + 2] = Math.round(blue / alpha);
        output[destination + 3] = Math.round(alpha * 255);
      }
    }
  }
  return output;
}
