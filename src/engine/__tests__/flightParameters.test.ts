import { describe, expect, it } from 'vitest';
import { AU_TO_KM, G_AU, REAL_DATA } from '../constants';
import { computeBodyState } from '../navigation';
import { julianDate } from '../orbital';
import { computeFlightParameterRows } from '../flightParameters';

describe('flightParameters', () => {
  it('computes formatted orbital analysis rows for the spaceship', () => {
    const simulatedTime = Date.UTC(2026, 6, 4);
    const earthState = computeBodyState('earth', julianDate(simulatedTime));
    expect(earthState).not.toBeNull();
    if (!earthState) return;

    const earthSpeed = Math.sqrt(
      earthState.velocity[0] ** 2 + earthState.velocity[1] ** 2 + earthState.velocity[2] ** 2,
    );
    const prograde: [number, number, number] = [
      earthState.velocity[0] / earthSpeed,
      earthState.velocity[1] / earthSpeed,
      earthState.velocity[2] / earthSpeed,
    ];
    const radial: [number, number, number] = [-prograde[1], prograde[0], 0];
    const parkingRadius = REAL_DATA.earth.radius + 400 / AU_TO_KM;
    const localSpeed = Math.sqrt(G_AU * REAL_DATA.earth.mass / parkingRadius);

    const rows = computeFlightParameterRows({
      shipPosition: [
        earthState.position[0] + radial[0] * parkingRadius,
        earthState.position[1] + radial[1] * parkingRadius,
        earthState.position[2],
      ],
      shipVelocity: [
        earthState.velocity[0] + prograde[0] * localSpeed,
        earthState.velocity[1] + prograde[1] * localSpeed,
        earthState.velocity[2],
      ],
      destinationId: 'mars',
      simulatedTime,
      thrustMagnitude: 0,
    });

    expect(rows.map((row) => row.label)).toContain('环绕天体');
    expect(rows.map((row) => row.label)).toContain('日心半长轴');
    expect(rows.map((row) => row.label)).toContain('距目标天体');
    expect(rows.find((row) => row.label === '环绕天体')?.value).toBe('earth');
  });
});
