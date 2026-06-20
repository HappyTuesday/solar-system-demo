import type { CelestialBody } from '../../types';
import { getSimplifiedRadius } from '../../engine/coordinateTransform';

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
  const r = getSimplifiedRadius(body.templateId);
  const color = BODY_COLORS[body.templateId] || '#888888';

  const grad = ctx.createRadialGradient(
    body.position[0] - r * 0.25, body.position[1] - r * 0.25, r * 0.1,
    body.position[0], body.position[1], r,
  );
  grad.addColorStop(0, '#ffffff');
  grad.addColorStop(0.3, color);
  grad.addColorStop(1, '#000000');

  ctx.beginPath();
  ctx.arc(body.position[0], body.position[1], r, 0, Math.PI * 2);
  ctx.fillStyle = grad;
  ctx.fill();

  if (isSelected) {
    ctx.beginPath();
    ctx.arc(body.position[0], body.position[1], r + 4, 0, Math.PI * 2);
    ctx.strokeStyle = '#4fc3f7';
    ctx.lineWidth = 2;
    ctx.stroke();
  }
}

export function drawPreviewCircle(
  ctx: CanvasRenderingContext2D,
  x: number,
  y: number,
  templateId: string,
) {
  const r = getSimplifiedRadius(templateId);
  ctx.beginPath();
  ctx.arc(x, y, r, 0, Math.PI * 2);
  ctx.strokeStyle = 'rgba(79, 195, 247, 0.7)';
  ctx.lineWidth = 2;
  ctx.setLineDash([4, 4]);
  ctx.stroke();
  ctx.setLineDash([]);
}

export function drawVelocityArrow(
  ctx: CanvasRenderingContext2D,
  pos: [number, number, number],
  vel: [number, number, number],
) {
  const scale = 1e-4;
  const ex = pos[0] + vel[0] * scale;
  const ey = pos[1] + vel[1] * scale;
  const len = Math.sqrt((vel[0] * scale) ** 2 + (vel[1] * scale) ** 2);
  if (len < 2) return;

  ctx.beginPath();
  ctx.moveTo(pos[0], pos[1]);
  ctx.lineTo(ex, ey);
  ctx.strokeStyle = '#4caf50';
  ctx.lineWidth = 2;
  ctx.stroke();

  const angle = Math.atan2(ey - pos[1], ex - pos[0]);
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
  mx: number,
  my: number,
  bodies: CelestialBody[],
): string | null {
  for (let i = bodies.length - 1; i >= 0; i--) {
    const r = getSimplifiedRadius(bodies[i].templateId);
    const dx = mx - bodies[i].position[0];
    const dy = my - bodies[i].position[1];
    if (dx * dx + dy * dy <= r * r + 16) {
      return bodies[i].id;
    }
  }
  return null;
}
