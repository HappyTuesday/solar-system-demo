import { describe, expect, it } from 'vitest';
import { REAL_DATA } from '../constants';
import {
  advanceExploreShipPhysics,
  computeExploreBodyStates,
} from '../exploreSimulation';
import type { SpaceshipState } from '../../types';

function makeShip(overrides: Partial<SpaceshipState> = {}): SpaceshipState {
  return {
    position: [1, 0, 0],
    velocity: [0, 0, 0],
    direction: [0, 1, 0],
    thrust: [0, 0, 0],
    thrustMagnitude: 0,
    exploded: false,
    ...overrides,
  };
}

describe('exploreSimulation', () => {
  it('computes current moving body states for the explore page', () => {
    const states = computeExploreBodyStates(Date.UTC(2026, 6, 4));

    expect(states.map(s => s.id)).toContain('sun');
    expect(states.map(s => s.id)).toContain('earth');
    expect(states.map(s => s.id)).toContain('mars');
    expect(states.find(s => s.id === 'sun')?.position).toEqual([0, 0, 0]);
    expect(states.find(s => s.id === 'earth')?.mass).toBe(REAL_DATA.earth.mass);
  });

  it('advances the ship with body-frame thrust, time scale, and moving bodies', () => {
    const ship = makeShip({
      thrust: [1, 0, 0],
      thrustMagnitude: 100,
    });

    const result = advanceExploreShipPhysics({
      ship,
      simulatedTime: Date.UTC(2026, 6, 4),
      frameDt: 0.05,
      timeScale: 10,
    });

    expect(result.simulatedTime).toBe(Date.UTC(2026, 6, 4) + 20);
    expect(result.simDelta).toBeCloseTo(0.02, 12);
    expect(result.ship.position[1]).toBeGreaterThan(ship.position[1]);
    expect(result.ship.velocity[1]).toBeGreaterThan(ship.velocity[1]);
    expect(result.speedKms).toBeGreaterThan(0);
    expect(result.travelKm).toBeGreaterThan(0);
    expect(result.finalBodies.map(b => b.id)).toContain('mars');
  });
});
