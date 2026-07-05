import React from 'react';
import { describe, expect, it, vi } from 'vitest';
import { renderToStaticMarkup } from 'react-dom/server';
import { computeBodyState } from '../../../engine/navigation';
import { julianDate } from '../../../engine/orbital';
import { AU_TO_KM, G_AU, REAL_DATA } from '../../../engine/constants';

type MockSpaceshipState = {
  position: [number, number, number];
  velocity: [number, number, number];
  simulatedTime: number;
  thrustMagnitude: number;
  exploded: boolean;
  targetBodyId: string | null;
  navigationPlan: { destinationId: string } | null;
};

const mockStores = vi.hoisted(() => {
  const spaceshipState = {} as MockSpaceshipState;
  return { spaceshipState };
});

vi.mock('../../../stores/spaceshipStore', () => ({
  useSpaceshipStore: <T,>(selector: (state: MockSpaceshipState) => T): T => selector(mockStores.spaceshipState),
}));

describe('FlightParametersPanel', () => {
  it('renders detailed orbital parameters on the left-side analysis panel', async () => {
    const { default: FlightParametersPanel } = await import('../FlightParametersPanel');
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

    mockStores.spaceshipState.position = [
      earthState.position[0] + radial[0] * parkingRadius,
      earthState.position[1] + radial[1] * parkingRadius,
      earthState.position[2],
    ];
    mockStores.spaceshipState.velocity = [
      earthState.velocity[0] + prograde[0] * localSpeed,
      earthState.velocity[1] + prograde[1] * localSpeed,
      earthState.velocity[2],
    ];
    mockStores.spaceshipState.simulatedTime = simulatedTime;
    mockStores.spaceshipState.thrustMagnitude = 0;
    mockStores.spaceshipState.exploded = false;
    mockStores.spaceshipState.targetBodyId = 'mars';
    mockStores.spaceshipState.navigationPlan = null;

    const html = renderToStaticMarkup(React.createElement(FlightParametersPanel));

    expect(html).toContain('详细轨道参数');
    expect(html).toContain('日心半长轴');
    expect(html).toContain('距目标天体');
    expect(html).toContain('逃逸速度');
  });
});
