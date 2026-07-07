import { describe, expect, it } from 'vitest';
import { REAL_DATA, AU_TO_KM } from '../constants';
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

  it('advances the ship with body-frame thrust, full time scale, and moving bodies', () => {
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

    expect(result.simulatedTime).toBe(Date.UTC(2026, 6, 4) + 500);
    expect(result.simDelta).toBeCloseTo(0.5, 12);
    expect(result.ship.position[1]).toBeGreaterThan(ship.position[1]);
    expect(result.ship.velocity[1]).toBeGreaterThan(ship.velocity[1]);
    expect(result.speedKms).toBeGreaterThan(0);
    expect(result.travelKm).toBeGreaterThan(0);
    expect(result.finalBodies.map(b => b.id)).toContain('mars');
  });

  it('treats neutral gear body-frame thrust as no effective thrust even when the slider is nonzero', () => {
    const ship = makeShip({
      thrust: [0, 0, 0],
      thrustMagnitude: 100,
    });

    const result = advanceExploreShipPhysics({
      ship,
      simulatedTime: Date.UTC(2026, 6, 4),
      frameDt: 0.05,
      timeScale: 10,
    });

    expect(result.simDelta).toBeCloseTo(0.5, 12);
    expect(result.ship.velocity[1]).toBeCloseTo(ship.velocity[1], 15);
  });

  it('caps ship speed at 1000 km/s even under sustained full thrust', () => {
    let ship = makeShip({ thrust: [1, 0, 0], thrustMagnitude: 100, direction: [0, 1, 0] });
    let simulatedTime = Date.UTC(2026, 6, 4);

    for (let i = 0; i < 200; i++) {
      const result = advanceExploreShipPhysics({
        ship,
        simulatedTime,
        frameDt: 0.1,
        timeScale: 1000,
      });
      ship = result.ship;
      simulatedTime = result.simulatedTime;
      expect(result.speedKms).toBeLessThanOrEqual(1000 + 1e-6);
    }

    const finalSpeedKms = Math.sqrt(
      ship.velocity[0] ** 2 + ship.velocity[1] ** 2 + ship.velocity[2] ** 2,
    ) * AU_TO_KM;
    expect(finalSpeedKms).toBeGreaterThan(900);
    expect(finalSpeedKms).toBeLessThanOrEqual(1000 + 1e-6);
  });
});
