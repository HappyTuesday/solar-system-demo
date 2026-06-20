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

// --- Touch gesture handling ---

interface TouchGesture {
  touches: Map<number, { x: number; y: number }>;
  initialMidX: number;
  initialMidY: number;
  initialDist: number;
  initialZoom: number;
  initialOffsetX: number;
  initialOffsetY: number;
  initialPanX: number;
  initialPanY: number;
}

let gesture: TouchGesture | null = null;

function getMidDist(t1: { x: number; y: number }, t2: { x: number; y: number }) {
  const mx = (t1.x + t2.x) / 2;
  const my = (t1.y + t2.y) / 2;
  const dx = t2.x - t1.x;
  const dy = t2.y - t1.y;
  const dist = Math.sqrt(dx * dx + dy * dy);
  return { mx, my, dist };
}

export function handleTouchStart(
  e: React.TouchEvent,
  vp: Viewport,
  cssWidth: number,
  cssHeight: number,
): Viewport | null {
  if (e.touches.length === 2) {
    const touches = new Map<number, { x: number; y: number }>();
    for (let i = 0; i < e.touches.length; i++) {
      const t = e.touches[i];
      const rect = (e.target as HTMLElement).getBoundingClientRect();
      touches.set(t.identifier, {
        x: t.clientX - rect.left,
        y: t.clientY - rect.top,
      });
    }
    const arr = Array.from(touches.values());
    const { mx, my, dist } = getMidDist(arr[0], arr[1]);
    gesture = {
      touches,
      initialMidX: mx,
      initialMidY: my,
      initialDist: dist,
      initialZoom: vp.zoom,
      initialOffsetX: vp.offsetX,
      initialOffsetY: vp.offsetY,
      initialPanX: vp.offsetX,
      initialPanY: vp.offsetY,
    };
    return null;
  }
  gesture = null;
  return null;
}

export function handleTouchMove(
  e: React.TouchEvent,
  vp: Viewport,
  cssWidth: number,
  cssHeight: number,
): Viewport | null {
  if (!gesture || e.touches.length !== 2) return null;

  const rect = (e.target as HTMLElement).getBoundingClientRect();
  const currentTouches: { x: number; y: number }[] = [];
  for (let i = 0; i < e.touches.length; i++) {
    const t = e.touches[i];
    currentTouches.push({
      x: t.clientX - rect.left,
      y: t.clientY - rect.top,
    });
  }
  const { mx, my, dist } = getMidDist(currentTouches[0], currentTouches[1]);

  // Determine if pinch or pan
  const distRatio = dist / gesture.initialDist;
  const midDx = mx - gesture.initialMidX;
  const midDy = my - gesture.initialMidY;

  let newZoom = vp.zoom;
  let newOffsetX = vp.offsetX;
  let newOffsetY = vp.offsetY;

  // Pinch: fingers moving apart/together → zoom
  if (Math.abs(distRatio - 1) > 0.02) {
    newZoom = Math.max(0.05, Math.min(20, gesture.initialZoom * distRatio));
    // Keep midpoint fixed during zoom
    const [wx, wy] = screenToRender(gesture.initialMidX, gesture.initialMidY,
      { offsetX: gesture.initialOffsetX, offsetY: gesture.initialOffsetY, zoom: gesture.initialZoom },
      cssWidth, cssHeight);
    const cx = cssWidth / 2;
    const cy = cssHeight / 2;
    newOffsetX = (gesture.initialMidX - cx) / newZoom - wx;
    newOffsetY = -(gesture.initialMidY - cy) / newZoom - wy;
    gesture.initialPanX = newOffsetX;
    gesture.initialPanY = newOffsetY;
  }

  // Pan: fingers moving together in same direction
  if (Math.abs(midDx) > 0.5 || Math.abs(midDy) > 0.5) {
    // Fingers move right → content moves right → offsetX increases
    newOffsetX = gesture.initialPanX + midDx / newZoom;
    // Fingers move down → content moves down → offsetY decreases (render Y-up, screen Y-down)
    newOffsetY = gesture.initialPanY - midDy / newZoom;
  }

  return { offsetX: newOffsetX, offsetY: newOffsetY, zoom: newZoom };
}

export function handleTouchEnd(): void {
  gesture = null;
}
