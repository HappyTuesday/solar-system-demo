import type { CelestialBody } from '../../types';
import { physicalToRender, getSimplifiedRadius } from '../../engine/coordinateTransform';

const BODY_COLORS: Record<string, string> = {
  sun: '#ffcc00',
  mercury: '#b0b0b0',
  venus: '#e8cda0',
  earth: '#4488ff',
  mars: '#cc6644',
  jupiter: '#d4b896',
  saturn: '#e8d5a3',
  uranus: '#88ccdd',
  neptune: '#4466ff',
};

export function drawBody(
  ctx: CanvasRenderingContext2D,
  body: CelestialBody,
  isSelected: boolean,
) {
  const [rx, ry] = physicalToRender(body.position);
  const r = getSimplifiedRadius(body.templateId);
  if (r <= 0) return;

  const color = BODY_COLORS[body.templateId] || '#888888';

  const grad = ctx.createRadialGradient(
    rx - r * 0.3, ry - r * 0.3, r * 0.05,
    rx, ry, r,
  );
  grad.addColorStop(0, '#ffffff');
  grad.addColorStop(0.25, color);
  grad.addColorStop(1, '#000000');

  ctx.beginPath();
  ctx.arc(rx, ry, r, 0, Math.PI * 2);
  ctx.fillStyle = grad;
  ctx.fill();

  ctx.beginPath();
  ctx.arc(rx, ry, r, 0, Math.PI * 2);
  ctx.strokeStyle = 'rgba(255, 255, 255, 0.15)';
  ctx.lineWidth = 1.5;
  ctx.stroke();

  if (isSelected) {
    ctx.beginPath();
    ctx.arc(rx, ry, r + 4, 0, Math.PI * 2);
    ctx.strokeStyle = '#4fc3f7';
    ctx.lineWidth = 2;
    ctx.stroke();
  }
}

export function drawPreviewCircle(
  ctx: CanvasRenderingContext2D,
  rx: number,
  ry: number,
  templateId: string,
) {
  const r = getSimplifiedRadius(templateId);
  ctx.beginPath();
  ctx.arc(rx, ry, r, 0, Math.PI * 2);
  ctx.strokeStyle = 'rgba(79, 195, 247, 0.7)';
  ctx.lineWidth = 2;
  ctx.setLineDash([4, 4]);
  ctx.stroke();
  ctx.setLineDash([]);
}

export function drawVelocityArrow(
  ctx: CanvasRenderingContext2D,
  body: CelestialBody,
) {
  const [rx, ry] = physicalToRender(body.position);
  const [vx, vy] = physicalToRender(body.velocity);
  const scale = 1e-4;
  const ex = rx + vx * scale;
  const ey = ry + vy * scale;
  const len = Math.sqrt((vx * scale) ** 2 + (vy * scale) ** 2);
  if (len < 2) return;

  ctx.beginPath();
  ctx.moveTo(rx, ry);
  ctx.lineTo(ex, ey);
  ctx.strokeStyle = '#4caf50';
  ctx.lineWidth = 2;
  ctx.stroke();

  const angle = Math.atan2(ey - ry, ex - rx);
  const arrowSize = 8;
  ctx.beginPath();
  ctx.moveTo(ex, ey);
  ctx.lineTo(
    ex - arrowSize * Math.cos(angle - Math.PI / 6),
    ey - arrowSize * Math.sin(angle - Math.PI / 6),
  );
  ctx.lineTo(
    ex - arrowSize * Math.cos(angle + Math.PI / 6),
    ey - arrowSize * Math.sin(angle + Math.PI / 6),
  );
  ctx.closePath();
  ctx.fillStyle = '#4caf50';
  ctx.fill();
}

export function hitTestBody(
  rx: number,
  ry: number,
  bodies: CelestialBody[],
): string | null {
  for (let i = bodies.length - 1; i >= 0; i--) {
    const [bx, by] = physicalToRender(bodies[i].position);
    const r = getSimplifiedRadius(bodies[i].templateId);
    const dx = rx - bx;
    const dy = ry - by;
    if (dx * dx + dy * dy <= r * r + 16) {
      return bodies[i].id;
    }
  }
  return null;
}
