import { describe, it, expect, beforeEach } from 'vitest';
import {
  physicalToRender,
  renderToPhysical,
  physicalDistanceToRender,
  renderDistanceToPhysical,
  getLinearScale,
  setLinearScale,
  getSizeMultiplier,
  setSizeMultiplier,
  scaleUp,
  scaleDown,
} from '../coordinateTransform';

describe('coordinateTransform', () => {
  const EPSILON = 1e-10;

  beforeEach(() => {
    // Reset to default scale
    setLinearScale(1);
  });

  describe('linearScale get/set', () => {
    it('should default to 1 (AU-based)', () => {
      expect(getLinearScale()).toBe(1);
    });

    it('should set and get scale', () => {
      setLinearScale(1000);
      expect(getLinearScale()).toBe(1000);
    });
  });

  describe('physicalToRender / renderToPhysical', () => {
    it('should round-trip correctly with scale=1', () => {
      setLinearScale(1);
      const original: [number, number, number] = [1.5, 2.5, 0.0];
      const rendered = physicalToRender(original);
      const back = renderToPhysical(rendered);
      expect(back[0]).toBeCloseTo(original[0], 10);
      expect(back[1]).toBeCloseTo(original[1], 10);
      expect(back[2]).toBeCloseTo(original[2], 10);
    });

    it('should round-trip correctly with scale=1500', () => {
      setLinearScale(1500);
      const original: [number, number, number] = [1.0, 2.0, 0.0];
      const rendered = physicalToRender(original);
      const back = renderToPhysical(rendered);
      expect(back[0]).toBeCloseTo(original[0], 10);
      expect(back[1]).toBeCloseTo(original[1], 10);
      expect(back[2]).toBeCloseTo(original[2], 10);
    });

    it('should scale positions by linearScale', () => {
      setLinearScale(100);
      const rendered = physicalToRender([1, 0, 0]);
      expect(rendered[0]).toBeCloseTo(100, 10);
    });
  });

  describe('distance transforms', () => {
    it('should scale distances correctly', () => {
      setLinearScale(500);
      const rendered = physicalDistanceToRender(0.5);
      expect(rendered).toBeCloseTo(250, 10);
      const back = renderDistanceToPhysical(rendered);
      expect(back).toBeCloseTo(0.5, 10);
    });
  });

  describe('scaleUp/scaleDown', () => {
    it('scaleUp should increase scale', () => {
      setLinearScale(100);
      const old = getLinearScale();
      scaleUp();
      expect(getLinearScale()).toBeGreaterThan(old);
    });

    it('scaleDown should decrease scale', () => {
      setLinearScale(100);
      const old = getLinearScale();
      scaleDown();
      expect(getLinearScale()).toBeLessThan(old);
    });

    it('multiple scaleUp/Down should not produce zero', () => {
      setLinearScale(10);
      for (let i = 0; i < 10; i++) scaleDown();
      expect(getLinearScale()).toBeGreaterThan(0);
    });
  });

  describe('sizeMultiplier', () => {
    it('should default to 10', () => {
      expect(getSizeMultiplier()).toBe(10);
    });

    it('should set size multiplier', () => {
      setSizeMultiplier(5);
      expect(getSizeMultiplier()).toBe(5);
    });
  });
});
