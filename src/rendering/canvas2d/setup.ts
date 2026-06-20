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

export function applyViewport(ctx: CanvasRenderingContext2D, vp: Viewport, width: number, height: number) {
  ctx.setTransform(
    vp.zoom, 0, 0, vp.zoom,
    width / 2 + vp.offsetX * vp.zoom,
    height / 2 - vp.offsetY * vp.zoom,
  );
}

export function screenToPhysics(
  screenX: number,
  screenY: number,
  vp: Viewport,
  width: number,
  height: number,
): [number, number] {
  const physX = (screenX - width / 2) / vp.zoom - vp.offsetX;
  const physY = -(screenY - height / 2) / vp.zoom - vp.offsetY;
  return [physX, physY];
}
