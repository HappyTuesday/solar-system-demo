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
  canvas.style.width = '100%';
  canvas.style.height = '100%';
  canvas.style.display = 'block';
  container.appendChild(canvas);

  const ctx = canvas.getContext('2d')!;

  function resize() {
    const dpr = window.devicePixelRatio || 1;
    const rect = container.getBoundingClientRect();
    canvas.width = rect.width * dpr;
    canvas.height = rect.height * dpr;
  }

  resize();
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
