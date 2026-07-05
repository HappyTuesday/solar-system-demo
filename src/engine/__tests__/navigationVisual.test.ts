import { describe, expect, it } from 'vitest';
import { computeRendezvousPulse, selectMiniMapVelocityVector } from '../navigationVisual';

describe('navigationVisual', () => {
  it('returns stable layered pulse values for rendezvous markers', () => {
    const pulse = computeRendezvousPulse(250, {
      cycleMs: 1000,
      baseRadius: 4,
      spreadRadius: 12,
      rings: 3,
    });

    expect(pulse.coreRadius).toBeGreaterThan(4);
    expect(pulse.coreRadius).toBeLessThan(16);
    expect(pulse.coreAlpha).toBeGreaterThan(0.45);
    expect(pulse.rings).toHaveLength(3);

    for (const ring of pulse.rings) {
      expect(ring.radius).toBeGreaterThanOrEqual(4);
      expect(ring.radius).toBeLessThanOrEqual(16);
      expect(ring.alpha).toBeGreaterThanOrEqual(0);
      expect(ring.alpha).toBeLessThanOrEqual(1);
    }
  });

  it('expands radius and fades alpha as each ring advances through the cycle', () => {
    const early = computeRendezvousPulse(50, {
      cycleMs: 1000,
      baseRadius: 4,
      spreadRadius: 12,
      rings: 1,
    });
    const late = computeRendezvousPulse(750, {
      cycleMs: 1000,
      baseRadius: 4,
      spreadRadius: 12,
      rings: 1,
    });

    expect(late.rings[0].radius).toBeGreaterThan(early.rings[0].radius);
    expect(late.rings[0].alpha).toBeLessThan(early.rings[0].alpha);
  });

  it('keeps direct rendezvous velocity arrows in the same heliocentric frame as guidance metrics', () => {
    const velocity = selectMiniMapVelocityVector({
      shipVelocity: [30, 11, 0],
      nearestBodyVelocity: [30, 0, 0],
      isZoomed: true,
      navigationMethod: 'direct-rendezvous',
    });

    expect(velocity).toEqual([30, 11, 0]);
  });

  it('uses nearest-body relative velocity for zoomed non-rendezvous orbit views', () => {
    const velocity = selectMiniMapVelocityVector({
      shipVelocity: [30, 11, 0],
      nearestBodyVelocity: [30, 0, 0],
      isZoomed: true,
      navigationMethod: 'hohmann',
    });

    expect(velocity).toEqual([0, 11, 0]);
  });
});
