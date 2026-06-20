import { useLayoutEffect, useEffect, useRef, useCallback } from 'react';
import { useBuildStore } from '../../stores/buildStore';
import { useUIStore } from '../../stores/uiStore';
import { detectCollisions } from '../../engine/physics';
import { renderToPhysical } from '../../engine/coordinateTransform';
import {
  createViewport,
  applyViewport,
  screenToRender,
  type Viewport,
} from '../../rendering/canvas2d/setup';
import { drawBody, drawPreviewCircle, hitTestBody } from '../../rendering/canvas2d/bodies';
import { drawGrid } from '../../rendering/canvas2d/grid';
import { handleWheel } from '../../rendering/canvas2d/interaction';

function BuilderCanvas() {
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const ctxRef = useRef<CanvasRenderingContext2D | null>(null);
  const vpRef = useRef<Viewport>(createViewport());
  const animRef = useRef<number>(0);
  const lastTimeRef = useRef<number>(0);

  // Touch gesture state
  const gestureRef = useRef<{
    initialMidX: number;
    initialMidY: number;
    initialDist: number;
    initialZoom: number;
    initialOffsetX: number;
    initialOffsetY: number;
  } | null>(null);

  const bodies = useBuildStore(s => s.bodies);
  const isRunning = useBuildStore(s => s.isRunning);
  const selectedToolId = useUIStore(s => s.selectedToolId);
  const selectedBodyIds = useUIStore(s => s.selectedBodyIds);
  const isPlacing = useUIStore(s => s.isPlacing);
  const setSelectedBodyIds = useUIStore(s => s.setSelectedBodyIds);
  const setMousePositions = useUIStore(s => s.setMousePositions);
  const setPreviewPosition = useUIStore(s => s.setPreviewPosition);
  const setIsPlacing = useUIStore(s => s.setIsPlacing);
  const setClickPosPhysical = useUIStore(s => s.setClickPosPhysical);
  const previewPosition = useUIStore(s => s.previewPosition);

  // Resize canvas backing store to match CSS layout size
  const syncSize = useCallback(() => {
    const canvas = canvasRef.current;
    if (!canvas) return;
    const dpr = window.devicePixelRatio || 1;
    const w = canvas.clientWidth;
    const h = canvas.clientHeight;
    if (w === 0 || h === 0) return;
    const pw = Math.round(w * dpr);
    const ph = Math.round(h * dpr);
    if (canvas.width !== pw) canvas.width = pw;
    if (canvas.height !== ph) canvas.height = ph;
  }, []);

  useLayoutEffect(() => {
    const canvas = canvasRef.current;
    if (!canvas) return;
    ctxRef.current = canvas.getContext('2d');
    syncSize();

    const observer = new ResizeObserver(() => syncSize());
    observer.observe(canvas);
    return () => observer.disconnect();
  }, [syncSize]);

  const render = useCallback(() => {
    const ctx = ctxRef.current;
    const canvas = canvasRef.current;
    if (!ctx || !canvas) return;

    syncSize();

    const dpr = window.devicePixelRatio || 1;
    const physW = canvas.width;
    const physH = canvas.height;
    if (physW === 0 || physH === 0) return;
    const cssW = physW / dpr;
    const cssH = physH / dpr;

    // Clear
    ctx.setTransform(1, 0, 0, 1, 0, 0);
    ctx.clearRect(0, 0, physW, physH);
    ctx.fillStyle = '#050510';
    ctx.fillRect(0, 0, physW, physH);

    const vp = vpRef.current;
    applyViewport(ctx, vp);

    drawGrid(ctx, vp, cssW, cssH);

    for (const body of bodies) {
      const isSelected = selectedBodyIds.includes(body.id);
      drawBody(ctx, body, isSelected);
    }

    if (selectedToolId && previewPosition) {
      drawPreviewCircle(ctx, previewPosition[0], previewPosition[1], selectedToolId);
    }
  }, [bodies, selectedBodyIds, selectedToolId, previewPosition, syncSize]);

  useEffect(() => {
    const loop = (time: number) => {
      const dt = lastTimeRef.current ? (time - lastTimeRef.current) / 1000 : 0;
      lastTimeRef.current = time;

      if (isRunning && dt > 0) {
        const buildState = useBuildStore.getState();
        buildState.advanceSimulation(dt, 2);
        const currentBodies = useBuildStore.getState().bodies;
        const collisions = detectCollisions(currentBodies, 2);
        if (collisions.length > 0) {
          for (const c of collisions) {
            const state = useBuildStore.getState();
            state.removeBody(c.bodyA.id);
            state.removeBody(c.bodyB.id);
            state.placeBody(c.mergedBody.templateId, c.mergedBody.position, c.mergedBody.velocity, c.mergedBody.mass);
          }
        }
      }

      render();
      animRef.current = requestAnimationFrame(loop);
    };

    animRef.current = requestAnimationFrame(loop);
    return () => cancelAnimationFrame(animRef.current);
  }, [isRunning, render]);

  const getRenderPos = useCallback((e: React.MouseEvent): [number, number] | null => {
    const canvas = canvasRef.current;
    if (!canvas) return null;
    const rect = canvas.getBoundingClientRect();
    return screenToRender(
      e.clientX - rect.left,
      e.clientY - rect.top,
      vpRef.current,
      canvas.clientWidth,
      canvas.clientHeight,
    );
  }, []);

  return (
    <canvas
      ref={canvasRef}
      style={{
        display: 'block',
        width: '100%',
        height: '100%',
        cursor: selectedToolId ? 'crosshair' : 'default',
      }}
      onMouseMove={(e) => {
        const rPos = getRenderPos(e);
        if (!rPos) return;
        const [px, py] = renderToPhysical([rPos[0], rPos[1], 0]);
        setMousePositions([px, py]);
        if (selectedToolId && !isPlacing) {
          setPreviewPosition([rPos[0], rPos[1]]);
        }
      }}
      onMouseDown={(e) => {
        if (e.button !== 0) return;
        const rPos = getRenderPos(e);
        if (!rPos) return;
        if (isPlacing) return;
        if (selectedToolId) {
          const [physX, physY] = renderToPhysical([rPos[0], rPos[1], 0]);
          setClickPosPhysical([physX, physY]);
          setIsPlacing(true);
          return;
        }
        const hitId = hitTestBody(rPos[0], rPos[1], useBuildStore.getState().bodies);
        if (hitId) setSelectedBodyIds([hitId]);
        else setSelectedBodyIds([]);
      }}
      onWheel={(e) => {
        const canvas = canvasRef.current;
        if (!canvas) return;
        const rect = canvas.getBoundingClientRect();
        const ox = e.clientX - rect.left;
        const oy = e.clientY - rect.top;
        vpRef.current = handleWheel(
          { offsetX: ox, offsetY: oy, deltaY: (e as unknown as WheelEvent).deltaY } as WheelEvent,
          vpRef.current, canvas.clientWidth, canvas.clientHeight);
      }}
      onTouchStart={(e) => {
        const canvas = canvasRef.current;
        if (!canvas || e.touches.length !== 2) { gestureRef.current = null; return; }
        const rect = canvas.getBoundingClientRect();
        const t0 = { x: e.touches[0].clientX - rect.left, y: e.touches[0].clientY - rect.top };
        const t1 = { x: e.touches[1].clientX - rect.left, y: e.touches[1].clientY - rect.top };
        const mx = (t0.x + t1.x) / 2;
        const my = (t0.y + t1.y) / 2;
        const dx = t1.x - t0.x;
        const dy = t1.y - t0.y;
        gestureRef.current = {
          initialMidX: mx,
          initialMidY: my,
          initialDist: Math.sqrt(dx * dx + dy * dy),
          initialZoom: vpRef.current.zoom,
          initialOffsetX: vpRef.current.offsetX,
          initialOffsetY: vpRef.current.offsetY,
        };
      }}
      onTouchMove={(e) => {
        const g = gestureRef.current;
        const canvas = canvasRef.current;
        if (!g || !canvas || e.touches.length !== 2) return;
        e.preventDefault();

        const rect = canvas.getBoundingClientRect();
        const cssW = canvas.clientWidth;
        const cssH = canvas.clientHeight;
        const t0x = e.touches[0].clientX - rect.left;
        const t0y = e.touches[0].clientY - rect.top;
        const t1x = e.touches[1].clientX - rect.left;
        const t1y = e.touches[1].clientY - rect.top;

        const midX = (t0x + t1x) / 2;
        const midY = (t0y + t1y) / 2;
        const dx = t1x - t0x;
        const dy = t1y - t0y;
        const dist = Math.sqrt(dx * dx + dy * dy);

        // Zoom: ratio relative to initial finger distance
        let z = g.initialZoom * (dist / g.initialDist);
        z = Math.max(0.05, Math.min(20, z));

        // World point under the INITIAL midpoint
        const cx = cssW / 2;
        const cy = cssH / 2;
        const wx = (g.initialMidX - cx) / g.initialZoom - g.initialOffsetX;
        const wy = -(g.initialMidY - cy) / g.initialZoom - g.initialOffsetY;

        // Offset to keep world point at initial midpoint at new zoom
        let ox = (g.initialMidX - cx) / z - wx;
        let oy = -(g.initialMidY - cy) / z - wy;

        // Pan: finger midpoint movement
        ox += (midX - g.initialMidX) / z;
        oy -= (midY - g.initialMidY) / z;

        vpRef.current = { offsetX: ox, offsetY: oy, zoom: z };
      }}
      onTouchEnd={() => { gestureRef.current = null; }}
      onContextMenu={e => e.preventDefault()}
    />
  );
}

export default BuilderCanvas;
