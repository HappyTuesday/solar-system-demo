import type { Viewport } from './setup';
import { screenToRender } from './setup';

export function handleWheel(
  e: { offsetX: number; offsetY: number; deltaY: number; deltaX: number; ctrlKey: boolean },
  vp: Viewport,
  cssWidth: number,
  cssHeight: number,
): Viewport {
  const cx = cssWidth / 2;
  const cy = cssHeight / 2;

  if (e.ctrlKey) {
    // Pinch zoom (macOS sends ctrlKey for trackpad pinch)
    const [wx, wy] = screenToRender(e.offsetX, e.offsetY, vp, cssWidth, cssHeight);
    const factor = Math.exp(-e.deltaY / 200);
    const newZoom = Math.max(0.05, Math.min(20, vp.zoom * factor));
    return {
      offsetX: (e.offsetX - cx) / newZoom - wx,
      offsetY: -(e.offsetY - cy) / newZoom - wy,
      zoom: newZoom,
    };
  }

  // Two-finger pan (trackpad scroll)
  return {
    offsetX: vp.offsetX - e.deltaX / vp.zoom,
    offsetY: vp.offsetY + e.deltaY / vp.zoom,
    zoom: vp.zoom,
  };
}
