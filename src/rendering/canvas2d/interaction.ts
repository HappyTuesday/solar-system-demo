import type { Viewport } from './setup';
import { screenToRender } from './setup';

export function handleWheel(
  e: WheelEvent,
  vp: Viewport,
  cssWidth: number,
  cssHeight: number,
): Viewport {
  const [wx, wy] = screenToRender(e.offsetX, e.offsetY, vp, cssWidth, cssHeight);
  const factor = e.deltaY > 0 ? 0.85 : 1.15;
  const newZoom = Math.max(0.05, Math.min(20, vp.zoom * factor));
  const cx = cssWidth / 2;
  const cy = cssHeight / 2;
  return {
    offsetX: (e.offsetX - cx) / newZoom - wx,
    offsetY: -(e.offsetY - cy) / newZoom - wy,
    zoom: newZoom,
  };
}
