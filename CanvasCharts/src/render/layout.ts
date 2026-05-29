// Canvas sizing helpers. Backing-store sizing happens only on resize / DPR
// change, never per frame: we set the pixel dimensions and a scale(dpr) base
// transform so the draw routine can work in CSS pixels.

export function dpr(): number {
  return window.devicePixelRatio || 1;
}

// Size a canvas backing store to (cssW x cssH) * dpr and reset its transform so
// (0,0)..(cssW,cssH) maps to the full bitmap. Returns the 2D context. No-ops the
// expensive bitmap reallocation when the size is already correct.
export function sizeCanvas(
  canvas: HTMLCanvasElement,
  cssW: number,
  cssH: number,
  ratio: number,
): CanvasRenderingContext2D {
  const pxW = Math.max(1, Math.round(cssW * ratio));
  const pxH = Math.max(1, Math.round(cssH * ratio));
  if (canvas.width !== pxW) canvas.width = pxW;
  if (canvas.height !== pxH) canvas.height = pxH;
  const ctx = canvas.getContext('2d')!;
  ctx.setTransform(ratio, 0, 0, ratio, 0, 0);
  return ctx;
}
