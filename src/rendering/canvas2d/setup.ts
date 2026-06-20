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
    const rect = container.getBoundingClientRect();
    const dpr = window.devicePixelRatio || 1;
    canvas.width = rect.width * dpr;
    canvas.height = rect.height * dpr;
  }

  resize();
  window.addEventListener('resize', resize);

  return { canvas, ctx };
}

// Maps Render (X右 Y上) → Canvas pixels (X右 Y下), includes DPR
export function applyViewport(
  ctx: CanvasRenderingContext2D,
  vp: Viewport,
  cssWidth: number,
  cssHeight: number,
) {
  const dpr = window.devicePixelRatio || 1;
  const z = vp.zoom * dpr;
  const cx = (cssWidth / 2 + vp.offsetX * vp.zoom) * dpr;
  const cy = (cssHeight / 2 - vp.offsetY * vp.zoom) * dpr;
  ctx.setTransform(z, 0, 0, -z, cx, cy);
}

// Canvas CSS坐标 (screenX, screenY) → Render坐标 (X右 Y上)
export function screenToRender(
  screenX: number,
  screenY: number,
  vp: Viewport,
  cssWidth: number,
  cssHeight: number,
): [number, number] {
  const cx = cssWidth / 2;
  const cy = cssHeight / 2;
  const rx = (screenX - cx) / vp.zoom - vp.offsetX;
  const ry = -(screenY - cy) / vp.zoom - vp.offsetY;
  return [rx, ry];
}
