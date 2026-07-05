export interface PlacementVelocityInput {
  position: [number, number, number];
  speed: number;
  angleDeg: number;
  referenceCenter?: [number, number, number];
}

export function computePlacementVelocity({
  position,
  speed,
  angleDeg,
  referenceCenter = [0, 0, 0],
}: PlacementVelocityInput): [number, number, number] {
  const rx = position[0] - referenceCenter[0];
  const ry = position[1] - referenceCenter[1];
  const dist = Math.sqrt(rx * rx + ry * ry);

  if (speed <= 0 || dist < 1e-12) {
    return [0, 0, 0];
  }

  const radialX = rx / dist;
  const radialY = ry / dist;
  const tangentX = -radialY;
  const tangentY = radialX;
  const angleRad = (angleDeg * Math.PI) / 180;
  const cosA = Math.cos(angleRad);
  const sinA = Math.sin(angleRad);

  return [
    speed * (cosA * tangentX + sinA * radialX),
    speed * (cosA * tangentY + sinA * radialY),
    0,
  ];
}
