export function julianDate(unixMs: number): number {
  return unixMs / 86400000 + 2440587.5;
}

export function solveKepler(M: number, e: number): number {
  let E = M;
  for (let i = 0; i < 30; i++) {
    const dE = (M - E + e * Math.sin(E)) / (1 - e * Math.cos(E));
    E += dE;
    if (Math.abs(dE) < 1e-12) break;
  }
  return E;
}

export function trueAnomaly(E: number, e: number): number {
  return 2 * Math.atan2(
    Math.sqrt(1 + e) * Math.sin(E / 2),
    Math.sqrt(1 - e) * Math.cos(E / 2)
  );
}

export function stateVectors(
  a: number,
  e: number,
  i: number,
  Ω: number,
  ω: number,
  ν: number,
  μ: number,
): { position: [number, number, number]; velocity: [number, number, number] } {
  const r = (a * (1 - e * e)) / (1 + e * Math.cos(ν));
  const sqrtMuP = Math.sqrt(μ / (a * (1 - e * e)));

  const xOrb = r * Math.cos(ν);
  const yOrb = r * Math.sin(ν);
  const vxOrb = -sqrtMuP * Math.sin(ν);
  const vyOrb = sqrtMuP * (e + Math.cos(ν));

  const cosΩ = Math.cos(Ω);
  const sinΩ = Math.sin(Ω);
  const cosω = Math.cos(ω);
  const sinω = Math.sin(ω);
  const cosi = Math.cos(i);
  const sini = Math.sin(i);

  const x = xOrb * (cosΩ * cosω - sinΩ * sinω * cosi) - yOrb * (cosΩ * sinω + sinΩ * cosω * cosi);
  const y = xOrb * (sinΩ * cosω + cosΩ * sinω * cosi) + yOrb * (-sinΩ * sinω + cosΩ * cosω * cosi);
  const z = xOrb * (sinω * sini) + yOrb * (cosω * sini);

  const vx = vxOrb * (cosΩ * cosω - sinΩ * sinω * cosi) - vyOrb * (cosΩ * sinω + sinΩ * cosω * cosi);
  const vy = vxOrb * (sinΩ * cosω + cosΩ * sinω * cosi) + vyOrb * (-sinΩ * sinω + cosΩ * cosω * cosi);
  const vz = vxOrb * (sinω * sini) + vyOrb * (cosω * sini);

  return {
    position: [x, y, z],
    velocity: [vx, vy, vz],
  };
}

export function orbitalPeriod(a: number, mu: number): number {
  return 2 * Math.PI * Math.sqrt((a * a * a) / mu);
}

export function meanAnomalyAtTime(
  M0: number,
  period: number,
  epoch: number,
  targetJd: number,
): number {
  const dt = targetJd - epoch;
  const n = (2 * Math.PI) / period;
  return M0 + n * dt * 86400;
}

export function computeRotationPhase(
  phaseAtEpoch: number,
  period: number,
  epoch: number,
  targetJd: number,
): number {
  const dtSec = (targetJd - epoch) * 86400;
  return (phaseAtEpoch + (2 * Math.PI * dtSec) / period) % (2 * Math.PI);
}
