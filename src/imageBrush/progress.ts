export function shouldPostImageBrushProgress(
  percent: number,
  lastPercent: number,
  elapsedMs: number,
): boolean {
  if (percent >= 100) return true;
  return percent >= lastPercent + 10 && elapsedMs >= 50;
}
