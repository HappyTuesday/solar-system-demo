import { useEffect, useRef } from 'react';
import { useSpaceshipStore } from '../../stores/spaceshipStore';
import { REAL_DATA, MU_SUN } from '../../engine/constants';
import { julianDate, solveKepler, trueAnomaly, stateVectors, orbitalPeriod, meanAnomalyAtTime } from '../../engine/orbital';

const CANVAS_W = 212;
const CANVAS_H = 130;
const PADDING = 12;
const VIEW_RANGE_AU = 0.1;
const SCALE = 1 / 1.496e11;
const SUN_RADIUS_PX = 4;
const ZOOM_THRESHOLD_AU = 0.005;
const ZOOM_BODY_RADIUS_PX = 8;
const ZOOM_LERP = 0.08;

const ALL_IDS = ['sun', 'mercury', 'venus', 'earth', 'mars', 'jupiter', 'saturn', 'uranus', 'neptune'];

const BODY_COLORS: Record<string, string> = {
  sun: '#ffaa00',
  mercury: '#aaaaaa', venus: '#e8c87a', earth: '#4488ff', mars: '#e86440',
  jupiter: '#d4b896', saturn: '#e8d5a3', uranus: '#88ccdd', neptune: '#4466ff',
};

function computeBodyPos2D(templateId: string, jd: number): { x: number; y: number } | null {
  const state = computeBodyState2D(templateId, jd);
  return state ? { x: state.x, y: state.y } : null;
}

function computeBodyState2D(templateId: string, jd: number): { x: number; y: number; vx: number; vy: number } | null {
  const data = REAL_DATA[templateId];
  if (!data || !data.semiMajorAxis || !data.orbital) return null;
  const o = data.orbital;
  const period = orbitalPeriod(data.semiMajorAxis, MU_SUN);
  const M = meanAnomalyAtTime(o.meanAnomalyAtEpoch, period, o.epoch, jd);
  const Mmod = ((M % (2 * Math.PI)) + 2 * Math.PI) % (2 * Math.PI);
  const E = solveKepler(Mmod, o.eccentricity);
  const nu = trueAnomaly(E, o.eccentricity);
  const sv = stateVectors(data.semiMajorAxis, o.eccentricity, o.inclination, o.longitudeAscendingNode, o.argumentOfPeriapsis, nu, MU_SUN);
  return {
    x: sv.position[0] * SCALE,
    y: sv.position[1] * SCALE,
    vx: sv.velocity[0] * SCALE,
    vy: sv.velocity[1] * SCALE,
  };
}

interface BodyDrawInfo {
  id: string;
  color: string;
  sx: number;
  sy: number;
  distance: number;
  inView: boolean;
}

function drawDirectionArrow(ctx: CanvasRenderingContext2D, x: number, y: number, angle: number, size: number) {
  ctx.save();
  ctx.translate(x, y);
  ctx.rotate(angle);
  ctx.beginPath();
  ctx.moveTo(size, 0);
  ctx.lineTo(-size * 0.5, -size * 0.5);
  ctx.lineTo(-size * 0.3, 0);
  ctx.lineTo(-size * 0.5, size * 0.5);
  ctx.closePath();
  ctx.fill();
  ctx.restore();
}

function drawSpaceship(ctx: CanvasRenderingContext2D, x: number, y: number, angle: number, size: number) {
  ctx.save();
  ctx.translate(x, y);
  ctx.rotate(angle);

  // Fuselage body
  ctx.beginPath();
  ctx.moveTo(size, 0);
  ctx.lineTo(size * 0.25, size * 0.3);
  ctx.lineTo(-size * 0.15, size * 0.25);
  ctx.lineTo(-size * 0.3, size * 0.4);
  ctx.lineTo(-size * 0.45, size * 0.25);
  ctx.lineTo(-size * 0.55, size * 0.08);
  ctx.lineTo(-size * 0.55, -size * 0.08);
  ctx.lineTo(-size * 0.45, -size * 0.25);
  ctx.lineTo(-size * 0.3, -size * 0.4);
  ctx.lineTo(-size * 0.15, -size * 0.25);
  ctx.lineTo(size * 0.25, -size * 0.3);
  ctx.closePath();

  const grad = ctx.createLinearGradient(-size * 0.5, 0, size, 0);
  grad.addColorStop(0, '#003366');
  grad.addColorStop(0.4, '#0077bb');
  grad.addColorStop(1, '#aaddff');
  ctx.fillStyle = grad;
  ctx.fill();

  ctx.strokeStyle = 'rgba(0, 200, 255, 0.5)';
  ctx.lineWidth = 0.8;
  ctx.stroke();

  // Cockpit
  ctx.beginPath();
  ctx.ellipse(size * 0.35, 0, size * 0.2, size * 0.12, 0, 0, Math.PI * 2);
  ctx.fillStyle = 'rgba(180, 230, 255, 0.7)';
  ctx.fill();

  // Engine exhaust
  ctx.beginPath();
  ctx.moveTo(-size * 0.55, -size * 0.06);
  ctx.lineTo(-size * 0.85, -size * 0.02);
  ctx.lineTo(-size * 0.85, size * 0.02);
  ctx.lineTo(-size * 0.55, size * 0.06);
  ctx.closePath();
  ctx.fillStyle = 'rgba(0, 255, 128, 0.25)';
  ctx.fill();

  ctx.restore();
}

function MiniMap() {
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const rafRef = useRef<number>(0);

  useEffect(() => {
    const canvas = canvasRef.current;
    if (!canvas) return;
    const ctx = canvas.getContext('2d');
    if (!ctx) return;

    let smoothViewRange = VIEW_RANGE_AU;

    const draw = () => {
      ctx.save();
      ctx.scale(2, 2);
      const sp = useSpaceshipStore.getState();
      const jd = julianDate(sp.simulatedTime);
      const cx = CANVAS_W / 2;
      const cy = CANVAS_H / 2;
      const usableW = CANVAS_W - PADDING * 2;
      const usableH = CANVAS_H - PADDING * 2;
      const usable = Math.min(usableW, usableH);

      let nearestDistAU = Infinity;
      let nearestId = '';
      let nearestX = 0;
      let nearestY = 0;
      let nearestVx = 0;
      let nearestVy = 0;
      for (const id of ALL_IDS) {
        if (id === 'sun') {
          const dx2 = sp.position[0] ** 2 + sp.position[1] ** 2;
          const dist = Math.sqrt(dx2);
          if (dist < nearestDistAU) { nearestDistAU = dist; nearestId = id; nearestX = 0; nearestY = 0; nearestVx = 0; nearestVy = 0; }
        } else {
          const state2d = computeBodyState2D(id, jd);
          if (!state2d) continue;
          const dx = state2d.x - sp.position[0];
          const dy = state2d.y - sp.position[1];
          const dist = Math.sqrt(dx * dx + dy * dy);
          if (dist < nearestDistAU) { nearestDistAU = dist; nearestId = id; nearestX = state2d.x; nearestY = state2d.y; nearestVx = state2d.vx; nearestVy = state2d.vy; }
        }
      }

      let targetViewRange = VIEW_RANGE_AU;
      let isZoomed = false;
      if (nearestDistAU < ZOOM_THRESHOLD_AU && nearestDistAU > 1e-12) {
        targetViewRange = nearestDistAU * 2.5;
        isZoomed = true;
      }
      smoothViewRange += (targetViewRange - smoothViewRange) * ZOOM_LERP;
      const viewRange = smoothViewRange;

      const scale = usable / (2 * viewRange);
      const anchorX = isZoomed ? nearestX : sp.position[0];
      const anchorY = isZoomed ? nearestY : sp.position[1];

      ctx.clearRect(0, 0, CANVAS_W, CANVAS_H);
      ctx.fillStyle = 'rgba(0, 0, 0, 0.6)';
      ctx.fillRect(0, 0, CANVAS_W, CANVAS_H);

      // Grid lines
      ctx.strokeStyle = 'rgba(255, 255, 255, 0.04)';
      ctx.lineWidth = 0.5;
      const gridStep = scale * viewRange * 0.2;
      for (let gx = cx % gridStep; gx < CANVAS_W; gx += gridStep) {
        ctx.beginPath();
        ctx.moveTo(gx, PADDING);
        ctx.lineTo(gx, CANVAS_H - PADDING);
        ctx.stroke();
      }
      for (let gy = cy % gridStep; gy < CANVAS_H; gy += gridStep) {
        ctx.beginPath();
        ctx.moveTo(PADDING, gy);
        ctx.lineTo(CANVAS_W - PADDING, gy);
        ctx.stroke();
      }

      // Border
      ctx.strokeStyle = 'rgba(0, 180, 255, 0.12)';
      ctx.lineWidth = 1;
      ctx.strokeRect(PADDING, PADDING, usableW, usableH);

      // Compute all body screen positions (relative to anchor)
      const bodies: BodyDrawInfo[] = [];
      let shipSx = cx;
      let shipSy = cy;
      for (const id of ALL_IDS) {
        if (id === 'sun') {
          const dx = 0 - anchorX;
          const dy = 0 - anchorY;
          const sx = cx + dx * scale;
          const sy = cy - dy * scale;
          const distPx = Math.sqrt((sx - cx) ** 2 + (sy - cy) ** 2);
          bodies.push({
            id, color: BODY_COLORS[id],
            sx, sy, distance: distPx / (scale || 1),
            inView: sx > PADDING && sx < CANVAS_W - PADDING && sy > PADDING && sy < CANVAS_H - PADDING,
          });
        } else {
          const pos2d = computeBodyPos2D(id, jd);
          if (!pos2d) continue;
          const dx = pos2d.x - anchorX;
          const dy = pos2d.y - anchorY;
          const sx = cx + dx * scale;
          const sy = cy - dy * scale;
          const distPx = Math.sqrt((sx - cx) ** 2 + (sy - cy) ** 2);
          bodies.push({
            id, color: BODY_COLORS[id] || '#888888',
            sx, sy, distance: distPx / (scale || 1),
            inView: sx > PADDING && sx < CANVAS_W - PADDING && sy > PADDING && sy < CANVAS_H - PADDING,
          });
        }
      }

      // Ship screen position (relative to anchor)
      {
        const dx = sp.position[0] - anchorX;
        const dy = sp.position[1] - anchorY;
        shipSx = cx + dx * scale;
        shipSy = cy - dy * scale;
      }

      // Draw bodies in view
      for (const b of bodies) {
        if (!b.inView) continue;
        if (b.id === 'sun') {
          const sunGrad = ctx.createRadialGradient(b.sx, b.sy, 1, b.sx, b.sy, SUN_RADIUS_PX);
          sunGrad.addColorStop(0, '#ffdd00');
          sunGrad.addColorStop(1, '#ff6600');
          ctx.fillStyle = sunGrad;
          ctx.beginPath();
          ctx.arc(b.sx, b.sy, SUN_RADIUS_PX, 0, Math.PI * 2);
          ctx.fill();
        } else if (isZoomed && b.id === nearestId) {
          ctx.fillStyle = b.color;
          ctx.beginPath();
          ctx.arc(b.sx, b.sy, ZOOM_BODY_RADIUS_PX, 0, Math.PI * 2);
          ctx.fill();
          ctx.strokeStyle = 'rgba(255, 255, 255, 0.2)';
          ctx.lineWidth = 0.5;
          ctx.stroke();
        } else {
          ctx.fillStyle = b.color;
          ctx.beginPath();
          ctx.arc(b.sx, b.sy, 2.5, 0, Math.PI * 2);
          ctx.fill();
        }
      }

      const edgeAnchorX = cx;
      const edgeAnchorY = cy;

      // Draw edge indicators for bodies outside view
      for (const b of bodies) {
        if (b.inView) continue;
        const dx = b.sx - edgeAnchorX;
        const dy = b.sy - edgeAnchorY;
        const dist = Math.sqrt(dx * dx + dy * dy);
        if (dist < 0.001) continue;
        const ndx = dx / dist;
        const ndy = dy / dist;

        let edgeX = cx;
        let edgeY = cy;
        const hw = usableW / 2;
        const hh = usableH / 2;

        if (Math.abs(ndx) * hh > Math.abs(ndy) * hw) {
          edgeX = ndx > 0 ? cx + hw : cx - hw;
          edgeY = cy + ndy * (hw / Math.abs(ndx));
        } else {
          edgeY = ndy > 0 ? cy + hh : cy - hh;
          edgeX = cx + ndx * (hh / Math.abs(ndy));
        }

        edgeX = Math.max(PADDING, Math.min(CANVAS_W - PADDING, edgeX));
        edgeY = Math.max(PADDING, Math.min(CANVAS_H - PADDING, edgeY));

        const angle = Math.atan2(ndy, ndx);

        ctx.fillStyle = b.color;
        ctx.beginPath();
        ctx.arc(edgeX, edgeY, 2.5, 0, Math.PI * 2);
        ctx.fill();

        ctx.fillStyle = b.color;
        ctx.globalAlpha = 0.6;
        drawDirectionArrow(ctx, edgeX, edgeY, angle, 4);
        ctx.globalAlpha = 1;
      }

      // Spaceship — use relative velocity direction to nearest body
      const relVx = sp.velocity[0] - nearestVx;
      const relVy = sp.velocity[1] - nearestVy;
      const relSpeed = Math.sqrt(relVx * relVx + relVy * relVy);
      const shipAngle = relSpeed > 1e-12
        ? Math.atan2(relVy, relVx)
        : Math.atan2(sp.direction[1], sp.direction[0]);

      // Direction line
      const dirLen = isZoomed ? 10 : 14;
      ctx.beginPath();
      ctx.moveTo(shipSx, shipSy);
      ctx.lineTo(shipSx + Math.cos(shipAngle) * dirLen, shipSy - Math.sin(shipAngle) * dirLen);
      ctx.strokeStyle = 'rgba(0, 255, 128, 0.3)';
      ctx.lineWidth = 1;
      ctx.stroke();

      // Spaceship
      ctx.fillStyle = '#00b8ff';
      drawSpaceship(ctx, shipSx, shipSy, -shipAngle, isZoomed ? 6 : 8);

      // Scale indicator
      const scaleBarAU = viewRange * 0.2;
      const scaleBarPx = scaleBarAU * scale;
      const barX = CANVAS_W - PADDING - scaleBarPx;
      const barY = CANVAS_H - PADDING - 4;
      ctx.strokeStyle = 'rgba(255, 255, 255, 0.3)';
      ctx.lineWidth = 1;
      ctx.beginPath();
      ctx.moveTo(barX, barY);
      ctx.lineTo(barX + scaleBarPx, barY);
      ctx.stroke();
      ctx.beginPath();
      ctx.moveTo(barX, barY - 3);
      ctx.lineTo(barX, barY + 3);
      ctx.moveTo(barX + scaleBarPx, barY - 3);
      ctx.lineTo(barX + scaleBarPx, barY + 3);
      ctx.stroke();
      ctx.fillStyle = '#556677';
      ctx.font = '8px monospace';
      ctx.textAlign = 'center';
      const scaleTextAU = scaleBarAU.toFixed(4);
      ctx.fillText(`${scaleTextAU} AU`, barX + scaleBarPx / 2, barY - 5);

      // Legend
      ctx.textAlign = 'left';
      ctx.fillStyle = '#334455';
      const legendText = isZoomed
        ? `▲ ${REAL_DATA[nearestId]?.name || '天体'} · 绕飞视图`
        : '▲ 飞船 · 俯视图';
      ctx.fillText(legendText, 4, CANVAS_H - 4);

      ctx.restore();
      rafRef.current = requestAnimationFrame(draw);
    };

    rafRef.current = requestAnimationFrame(draw);
    return () => cancelAnimationFrame(rafRef.current);
  }, []);

  return (
    <canvas
      ref={canvasRef}
      width={CANVAS_W * 2}
      height={CANVAS_H * 2}
      style={{
        width: CANVAS_W,
        height: CANVAS_H,
        display: 'block',
        borderRadius: 4,
        background: 'rgba(0,0,0,0.5)',
        border: '1px solid rgba(0,180,255,0.2)',
      }}
    />
  );
}

export default MiniMap;
