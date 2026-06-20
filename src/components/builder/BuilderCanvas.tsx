import { useEffect, useRef, useCallback } from 'react';
import { useBuildStore } from '../../stores/buildStore';
import { useUIStore } from '../../stores/uiStore';
import { detectCollisions } from '../../engine/physics';
import { physicalToRender, renderToPhysical } from '../../engine/coordinateTransform';
import {
  initCanvas2D,
  createViewport,
  applyViewport,
  screenToRender,
  type Canvas2DSetup,
  type Viewport,
} from '../../rendering/canvas2d/setup';
import { drawBody, drawPreviewCircle, hitTestBody } from '../../rendering/canvas2d/bodies';
import { drawGrid } from '../../rendering/canvas2d/grid';
import { handleWheel } from '../../rendering/canvas2d/interaction';

function BuilderCanvas() {
  const containerRef = useRef<HTMLDivElement>(null);
  const setupRef = useRef<Canvas2DSetup | null>(null);
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

  const render = useCallback(() => {
    const setup = setupRef.current;
    const container = containerRef.current;
    if (!setup || !container) return;

    const rect = container.getBoundingClientRect();
    const w = rect.width;
    const h = rect.height;

    setup.ctx.clearRect(0, 0, w, h);

    setup.ctx.fillStyle = '#050510';
    setup.ctx.fillRect(0, 0, w, h);

    const vp = vpRef.current;
    applyViewport(setup.ctx, vp, w, h);

    drawGrid(setup.ctx, vp, w, h);

    for (const body of bodies) {
      const isSelected = selectedBodyIds.includes(body.id);
      drawBody(setup.ctx, body, isSelected);
    }

    // Preview circle at render position
    if (selectedToolId && previewPosition) {
      drawPreviewCircle(setup.ctx, previewPosition[0], previewPosition[1], selectedToolId);
    }
  }, [bodies, selectedBodyIds, selectedToolId, previewPosition]);

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

  useEffect(() => {
    if (!containerRef.current) return;
    setupRef.current = initCanvas2D(containerRef.current);
    return () => {
      const setup = setupRef.current;
      if (setup) {
        setup.canvas.remove();
        setupRef.current = null;
      }
    };
  }, []);

  const getRenderPos = useCallback((e: React.MouseEvent): [number, number] | null => {
    if (!containerRef.current) return null;
    const rect = containerRef.current.getBoundingClientRect();
    return screenToRender(
      e.clientX - rect.left,
      e.clientY - rect.top,
      vpRef.current,
      rect.width,
      rect.height,
    );
  }, []);

  return (
    <div
      ref={containerRef}
      style={{ flex: 1, minHeight: 0, position: 'relative', overflow: 'hidden', cursor: selectedToolId ? 'crosshair' : 'default' }}
      onMouseMove={(e) => {
        const rPos = getRenderPos(e);
        if (!rPos) return;

        // Store physical position for coordinate display
        const [px, py] = renderToPhysical([rPos[0], rPos[1], 0]);
        setMousePositions([px, py]);

        if (selectedToolId && !isPlacing) {
          // Store render position for preview
          setPreviewPosition([rPos[0], rPos[1]]);
        }
      }}
      onMouseDown={(e) => {
        if (e.button !== 0) return;
        const rPos = getRenderPos(e);
        if (!rPos) return;

        if (isPlacing) return;

        if (selectedToolId) {
          // Convert render position to physical for placement
          const [physX, physY] = renderToPhysical([rPos[0], rPos[1], 0]);
          setClickPosPhysical([physX, physY]);
          setIsPlacing(true);
          return;
        }

        // Selection mode: hit test at render position
        const hitId = hitTestBody(rPos[0], rPos[1], useBuildStore.getState().bodies);
        if (hitId) {
          setSelectedBodyIds([hitId]);
        } else {
          setSelectedBodyIds([]);
        }
      }}
      onWheel={(e) => {
        if (!containerRef.current) return;
        const rect = containerRef.current.getBoundingClientRect();
        vpRef.current = handleWheel(e as unknown as WheelEvent, vpRef.current, rect.width, rect.height);
      }}
      onContextMenu={e => e.preventDefault()}
    />
  );
}

export default BuilderCanvas;
