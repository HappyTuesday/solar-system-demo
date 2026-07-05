export interface RendezvousPulseOptions {
  cycleMs?: number;
  baseRadius?: number;
  spreadRadius?: number;
  rings?: number;
}

export interface RendezvousPulseRing {
  radius: number;
  alpha: number;
  progress: number;
}

export interface RendezvousPulse {
  coreRadius: number;
  coreAlpha: number;
  rings: RendezvousPulseRing[];
}

export interface MiniMapVelocityVectorInput {
  shipVelocity: [number, number, number];
  nearestBodyVelocity?: [number, number, number] | null;
  isZoomed: boolean;
  navigationMethod?: 'hohmann' | 'direct-rendezvous' | null;
}

function positiveModulo(value: number, divisor: number): number {
  return ((value % divisor) + divisor) % divisor;
}

export function selectMiniMapVelocityVector(input: MiniMapVelocityVectorInput): [number, number, number] {
  const { shipVelocity, nearestBodyVelocity, isZoomed, navigationMethod } = input;
  if (!isZoomed || !nearestBodyVelocity || navigationMethod === 'direct-rendezvous') {
    return [shipVelocity[0], shipVelocity[1], shipVelocity[2]];
  }

  return [
    shipVelocity[0] - nearestBodyVelocity[0],
    shipVelocity[1] - nearestBodyVelocity[1],
    shipVelocity[2] - nearestBodyVelocity[2],
  ];
}

export function computeRendezvousPulse(
  timeMs: number,
  options: RendezvousPulseOptions = {},
): RendezvousPulse {
  const cycleMs = Math.max(1, options.cycleMs ?? 1600);
  const baseRadius = Math.max(0, options.baseRadius ?? 4);
  const spreadRadius = Math.max(0, options.spreadRadius ?? 14);
  const ringCount = Math.max(1, Math.floor(options.rings ?? 3));
  const cycleProgress = positiveModulo(timeMs, cycleMs) / cycleMs;

  const rings = Array.from({ length: ringCount }, (_, index) => {
    const progress = positiveModulo(cycleProgress + index / ringCount, 1);
    const eased = 1 - (1 - progress) * (1 - progress);
    return {
      progress,
      radius: baseRadius + spreadRadius * eased,
      alpha: Math.max(0, 0.72 * (1 - progress)),
    };
  });

  return {
    coreRadius: baseRadius * (1 + 0.18 * Math.sin(cycleProgress * Math.PI * 2)),
    coreAlpha: 0.72 + 0.22 * Math.sin(cycleProgress * Math.PI * 2),
    rings,
  };
}
