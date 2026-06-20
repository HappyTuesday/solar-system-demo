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
    ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
  }

  resize();
  window.addEventListener('resize', resize);

  return { canvas, ctx };
}

// Render space: X right, Y up, origin at screen center
// Canvas space: X right, Y down, origin at top-left
export function applyViewport(ctx: CanvasRenderingContext2D, vp: Viewport, width: number, height: number) {
  ctx.setTransform(
    vp.zoom, 0, 0, -vp.zoom,
    width / 2 + vp.offsetX * vp.zoom,
    height / 2 - vp.offsetY * vp.zoom,
  );
}

// Canvas (screenX, screenY) → Render (x right, y up)
export function screenToRender(
  screenX: number,
  screenY: number,
  vp: Viewport,
  width: number,
  height: number,
): [number, number] {
  const rx = (screenX - width / 2) / vp.zoom - vp.offsetX;
  const ry = (screenY - height / 2) / (-vp.zoom) - vp.offsetY;
  return [rx, ry];
}
