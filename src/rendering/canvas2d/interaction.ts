import type { Viewport } from './setup';

export function canvasToPhysics(
  mx: number,
  my: number,
  vp: Viewport,
  width: number,
  height: number,
): [number, number] {
  return [
    (mx - width / 2) / vp.zoom - vp.offsetX,
    -(my - height / 2) / vp.zoom - vp.offsetY,
  ];
}

export function handleWheel(
  e: WheelEvent,
  vp: Viewport,
  width: number,
  height: number,
): Viewport {
  const mouseX = e.offsetX;
  const mouseY = e.offsetY;

  const worldX = (mouseX - width / 2) / vp.zoom - vp.offsetX;
  const worldY = -(mouseY - height / 2) / vp.zoom - vp.offsetY;

  const factor = e.deltaY > 0 ? 0.85 : 1.15;
  const newZoom = Math.max(0.1, Math.min(10, vp.zoom * factor));

  return {
    offsetX: (mouseX - width / 2) / newZoom - worldX,
    offsetY: -(mouseY - height / 2) / newZoom - worldY,
    zoom: newZoom,
  };
}

export function handleMouseDrag(
  e: MouseEvent,
  startX: number,
  startY: number,
  vp: Viewport,
  zoom: number,
): Viewport {
  return {
    offsetX: vp.offsetX + (e.clientX - startX) / zoom,
    offsetY: vp.offsetY - (e.clientY - startY) / zoom,
    zoom,
  };
}
