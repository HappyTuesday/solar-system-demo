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
        vpRef.current = handleWheel(
          e as unknown as WheelEvent, vpRef.current,
          canvas.clientWidth, canvas.clientHeight,
        );
      }}
      onContextMenu={e => e.preventDefault()}
    />
  );
}

export default BuilderCanvas;
