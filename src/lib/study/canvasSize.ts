/** Match high-density phones without increasing large-tablet rendering unboundedly. */
export function studyCanvasSize(width: number, height: number, deviceRatio: number) {
  const w = Math.max(1, Math.round(width)), h = Math.max(1, Math.round(height));
  const native = Number.isFinite(deviceRatio) && deviceRatio > 0 ? deviceRatio : 1;
  // Preserve the existing 2x ceiling on large screens; spend extra pixels only
  // when the small viewport fits the lake renderer's screen-layer budget.
  const dpr = Math.min(native, 3, Math.max(2, Math.sqrt(3_500_000 / (w * h))));
  return { w, h, dpr, pixelWidth: Math.round(w * dpr), pixelHeight: Math.round(h * dpr) };
}
