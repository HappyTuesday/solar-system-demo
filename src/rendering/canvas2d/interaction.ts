import type { Viewport } from './setup';

// Canvas pixel → Render coordinates
export function canvasToRender(
  mx: number,
  my: number,
  vp: Viewport,
  width: number,
  height: number,
): [number, number] {
  return [
    (mx - width / 2) / vp.zoom - vp.offsetX,
    (my - height / 2) / (-vp.zoom) - vp.offsetY,
  ];
}

// Wheel zoom centered on mouse position
export function handleWheel(
  e: WheelEvent,
  vp: Viewport,
  width: number,
  height: number,
): Viewport {
  const mouseX = e.offsetX;
  const mouseY = e.offsetY;
  const [worldX, worldY] = canvasToRender(mouseX, mouseY, vp, width, height);

  const factor = e.deltaY > 0 ? 0.85 : 1.15;
  const newZoom = Math.max(0.01, Math.min(50, vp.zoom * factor));

  // Recompute offset so world position under mouse stays fixed
  return {
    offsetX: (mouseX - width / 2) / newZoom - worldX,
    offsetY: (mouseY - height / 2) / (-newZoom) - worldY,
    zoom: newZoom,
  };
}

export function handleMouseDrag(
  e: MouseEvent,
  startX: number,
  startY: number,
  vp: Viewport,
): Viewport {
  return {
    offsetX: vp.offsetX + (e.clientX - startX) / vp.zoom,
    offsetY: vp.offsetY - (e.clientY - startY) / vp.zoom,
    zoom: vp.zoom,
  };
}
