import { useEffect, useRef } from 'react';
import { useSpaceshipStore } from '../../stores/spaceshipStore';
import { REAL_DATA, MU_SUN } from '../../engine/constants';
import { julianDate, solveKepler, trueAnomaly, stateVectors, orbitalPeriod, meanAnomalyAtTime } from '../../engine/orbital';

const CANVAS_W = 212;
const CANVAS_H = 130;
const PADDING = 15;
const SUN_RADIUS_PX = 5;
const SCALE = 1 / 1.496e11;
const MAX_ORBIT_AU = 30.11;

const PLANET_ORDER = ['mercury', 'venus', 'earth', 'mars', 'jupiter', 'saturn', 'uranus', 'neptune'];

const PLANET_COLORS: Record<string, string> = {
  mercury: '#aaaaaa', venus: '#e8c87a', earth: '#4488ff', mars: '#e86440',
  jupiter: '#d4b896', saturn: '#e8d5a3', uranus: '#88ccdd', neptune: '#4466ff',
};

function computeBodyPos2D(templateId: string, jd: number): { x: number; y: number } | null {
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
  };
}

function MiniMap() {
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const rafRef = useRef<number>(0);

  useEffect(() => {
    const canvas = canvasRef.current;
    if (!canvas) return;
    const ctx = canvas.getContext('2d');
    if (!ctx) return;

    const draw = () => {
      const sp = useSpaceshipStore.getState();
      const jd = julianDate(sp.simulatedTime);
      const scale = (Math.min(CANVAS_W, CANVAS_H) - PADDING * 2) / MAX_ORBIT_AU;
      const cx = CANVAS_W / 2;
      const cy = CANVAS_H / 2;

      ctx.clearRect(0, 0, CANVAS_W, CANVAS_H);
      ctx.fillStyle = 'rgba(0, 0, 0, 0.6)';
      ctx.fillRect(0, 0, CANVAS_W, CANVAS_H);

      for (const id of PLANET_ORDER) {
        const data = REAL_DATA[id];
        if (!data?.semiMajorAxis) continue;
        const rPx = (data.semiMajorAxis / 1.496e11) * scale;
        if (rPx <= 0) continue;
        ctx.beginPath();
        ctx.ellipse(cx, cy, rPx, rPx * 0.7, 0, 0, Math.PI * 2);
        ctx.strokeStyle = 'rgba(255, 255, 255, 0.08)';
        ctx.lineWidth = 0.5;
        ctx.stroke();
      }

      ctx.beginPath();
      ctx.arc(cx, cy, SUN_RADIUS_PX, 0, Math.PI * 2);
      const sunGrad = ctx.createRadialGradient(cx, cy, 1, cx, cy, SUN_RADIUS_PX);
      sunGrad.addColorStop(0, '#ffdd00');
      sunGrad.addColorStop(1, '#ff8800');
      ctx.fillStyle = sunGrad;
      ctx.fill();

      for (const id of PLANET_ORDER) {
        const pos2d = computeBodyPos2D(id, jd);
        if (!pos2d) continue;
        const px = cx + pos2d.x * scale;
        const py = cy - pos2d.y * scale;
        ctx.beginPath();
        ctx.arc(px, py, 2, 0, Math.PI * 2);
        ctx.fillStyle = PLANET_COLORS[id] || '#888888';
        ctx.fill();
      }

      const spx = sp.position[0] * scale;
      const spy = sp.position[1] * scale;
      const sx = cx + spx;
      const sy = cy - spy;

      const dx = sp.direction[0];
      const dy = sp.direction[1];
      const dirLen = 10;
      ctx.beginPath();
      ctx.moveTo(sx, sy);
      ctx.lineTo(sx + dx * dirLen, sy - dy * dirLen);
      ctx.strokeStyle = 'rgba(0, 255, 128, 0.3)';
      ctx.lineWidth = 1;
      ctx.stroke();

      const angle = Math.atan2(-dy, dx);
      ctx.save();
      ctx.translate(sx, sy);
      ctx.rotate(angle);
      ctx.beginPath();
      ctx.moveTo(6, 0);
      ctx.lineTo(-4, -3);
      ctx.lineTo(-4, 3);
      ctx.closePath();
      ctx.fillStyle = '#00b8ff';
      ctx.fill();
      ctx.restore();

      ctx.fillStyle = '#334455';
      ctx.font = '8px monospace';
      ctx.fillText('▲ 飞船 · 顶视图', 4, CANVAS_H - 4);

      rafRef.current = requestAnimationFrame(draw);
    };

    rafRef.current = requestAnimationFrame(draw);
    return () => cancelAnimationFrame(rafRef.current);
  }, []);

  return (
    <canvas
      ref={canvasRef}
      width={CANVAS_W}
      height={CANVAS_H}
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
