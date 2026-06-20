export interface Canvas2DSetup {
  canvas: HTMLCanvasElement;
  ctx: CanvasRenderingContext2D;
}

export interface Viewport {
  offsetX: number;
  offsetY: number;
  zoom: number;
}

export function createViewport(): Viewport {
  return { offsetX: 0, offsetY: 0, zoom: 1 };
}

export function initCanvas2D(container: HTMLElement): Canvas2DSetup {
  const canvas = document.createElement('canvas');
  canvas.style.display = 'block';
  container.appendChild(canvas);

  const ctx = canvas.getContext('2d')!;

  function resize() {
    const rect = container.getBoundingClientRect();
    if (rect.width === 0 || rect.height === 0) return;
    const dpr = window.devicePixelRatio || 1;
    // Set CSS pixel size explicitly (not percentage, to avoid flex resolution issues)
    canvas.style.width = rect.width + 'px';
    canvas.style.height = rect.height + 'px';
    canvas.width = Math.round(rect.width * dpr);
    canvas.height = Math.round(rect.height * dpr);
  }

  resize();

  const observer = new ResizeObserver(() => resize());
  observer.observe(container);
  window.addEventListener('resize', resize);

  return { canvas, ctx };
}

// Maps render coordinate (rx, ry) to canvas physical pixel
// render:   X right, Y up
// canvas:    X right, Y down (physical pixels, includes DPR)
export function applyViewport(
  ctx: CanvasRenderingContext2D,
  vp: Viewport,
) {
  const dpr = window.devicePixelRatio || 1;
  const physW = ctx.canvas.width;
  const physH = ctx.canvas.height;
  const z = vp.zoom * dpr;
  const cx = physW / 2 + vp.offsetX * z;
  const cy = physH / 2 - vp.offsetY * z;
  ctx.setTransform(z, 0, 0, -z, cx, cy);
}

// CSS pixel (screenX, screenY) → render coordinate (rx, ry)
export function screenToRender(
  screenX: number,
  screenY: number,
  vp: Viewport,
  cssWidth: number,
  cssHeight: number,
): [number, number] {
  const cx = cssWidth / 2;
  const cy = cssHeight / 2;
  return [
    (screenX - cx) / vp.zoom - vp.offsetX,
    -(screenY - cy) / vp.zoom - vp.offsetY,
  ];
}
