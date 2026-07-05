import { describe, expect, it, vi } from 'vitest';
import type { PhaseGuidance } from '../../engine/navigation';
import type { NavigationDirective } from '../../engine/marsMissionNavigator';
import {
  applyGuidanceDirection,
  applyGuidanceTimeScale,
  applyGuidanceThrottle,
  computeGuidanceAutoTimeScale,
} from '../guidanceControls';

function makeGuidance(overrides: Partial<PhaseGuidance>): PhaseGuidance {
  return {
    title: '测试指引',
    actionText: '测试操作',
    shouldThrust: false,
    thrustMagnitude: 0,
    completed: false,
    progress: 0,
    metrics: [],
    ...overrides,
  };
}

function makeDirective(overrides: Partial<NavigationDirective>): NavigationDirective {
  const sourceGuidance = makeGuidance({});
  return {
    action: 'wait',
    title: '测试指令',
    actionText: '测试操作',
    target: '火星',
    reason: '测试原因',
    condition: {
      label: '测试条件',
      current: 0,
      target: 1,
      unit: '',
      satisfied: false,
    },
    metrics: [],
    progress: 0,
    completed: false,
    shouldThrust: false,
    thrustDirection: 'none',
    thrustMagnitude: 0,
    attitudeMode: 'inertial',
    recommendedGear: 'N',
    recommendedThrustMagnitude: 0,
    suggestedTimeScale: 1000,
    sourceGuidance,
    ...overrides,
  };
}

describe('guidanceControls', () => {
  it('applies guidance direction by normalizing the nose target and switching to inertial hold', () => {
    const calls: string[] = [];
    const setDirection = vi.fn(() => calls.push('direction'));
    const setAttitudeMode = vi.fn(() => calls.push('attitude'));
    const guidance = makeGuidance({ desiredDirection: [3, 4, 0] });

    const applied = applyGuidanceDirection(guidance, {
      setDirection,
      setAttitudeMode,
    });

    expect(applied).toBe(true);
    expect(setDirection).toHaveBeenCalledWith([0.6, 0.8, 0]);
    expect(setAttitudeMode).toHaveBeenCalledWith('inertial');
    expect(calls).toEqual(['direction', 'attitude']);
  });

  it('does not apply direction when guidance has no desired direction', () => {
    const setDirection = vi.fn();
    const setAttitudeMode = vi.fn();

    const applied = applyGuidanceDirection(makeGuidance({}), {
      setDirection,
      setAttitudeMode,
    });

    expect(applied).toBe(false);
    expect(setDirection).not.toHaveBeenCalled();
    expect(setAttitudeMode).not.toHaveBeenCalled();
  });

  it('uses sustained relative attitude modes for guidance directions that must keep tracking', () => {
    const setDirection = vi.fn();
    const setAttitudeMode = vi.fn();

    applyGuidanceDirection(makeDirective({
      desiredDirection: [1, 0, 0],
      desiredDirectionLabel: '当前绕飞顺行方向',
    }), { setDirection, setAttitudeMode });
    applyGuidanceDirection(makeDirective({
      desiredDirection: [0, 1, 0],
      desiredDirectionLabel: '日心切向顺行补燃方向',
    }), { setDirection, setAttitudeMode });
    applyGuidanceDirection(makeDirective({
      desiredDirection: [0, -1, 0],
      desiredDirectionLabel: '日心逆行修正方向',
    }), { setDirection, setAttitudeMode });

    expect(setAttitudeMode).toHaveBeenNthCalledWith(1, 'prograde');
    expect(setAttitudeMode).toHaveBeenNthCalledWith(2, 'heliocentric-tangential-prograde');
    expect(setAttitudeMode).toHaveBeenNthCalledWith(3, 'heliocentric-retrograde');
  });

  it('applies powered D/R guidance by setting thrust magnitude before changing gear', () => {
    const calls: string[] = [];
    const setThrustMagnitude = vi.fn(() => calls.push('thrust'));
    const setGear = vi.fn(() => calls.push('gear'));

    const applied = applyGuidanceThrottle(makeGuidance({
      recommendedGear: 'D',
      recommendedThrustMagnitude: 35,
    }), {
      setThrustMagnitude,
      setGear,
    });

    expect(applied).toBe(true);
    expect(setThrustMagnitude).toHaveBeenCalledWith(35);
    expect(setGear).toHaveBeenCalledWith('D');
    expect(calls).toEqual(['thrust', 'gear']);
  });

  it('clears thrust and shifts to neutral for neutral or zero-thrust guidance', () => {
    const calls: string[] = [];
    const setThrustMagnitude = vi.fn(() => calls.push('thrust'));
    const setGear = vi.fn(() => calls.push('gear'));

    const applied = applyGuidanceThrottle(makeGuidance({
      recommendedGear: 'D',
      recommendedThrustMagnitude: 0,
    }), {
      setThrustMagnitude,
      setGear,
    });

    expect(applied).toBe(true);
    expect(setThrustMagnitude).toHaveBeenCalledWith(0);
    expect(setGear).toHaveBeenCalledWith('N');
    expect(calls).toEqual(['thrust', 'gear']);
  });

  it('applies guidance time scale without changing flight controls', () => {
    const setTimeScale = vi.fn();

    const applied = applyGuidanceTimeScale(makeGuidance({
      suggestedTimeScale: 10000,
    }), {
      setTimeScale,
    });

    expect(applied).toBe(true);
    expect(setTimeScale).toHaveBeenCalledWith(10000);
  });

  it('does not apply time scale when guidance has no suggested scale', () => {
    const setTimeScale = vi.fn();

    const applied = applyGuidanceTimeScale(makeGuidance({}), {
      setTimeScale,
    });

    expect(applied).toBe(false);
    expect(setTimeScale).not.toHaveBeenCalled();
  });

  it('does not auto-reduce high time scale during coast guidance', () => {
    const guidance = makeGuidance({
      operation: 'coast',
      suggestedTimeScale: 1000000,
    });

    expect(computeGuidanceAutoTimeScale(guidance, 1000000)).toBeNull();
  });

  it('auto-reduces high time scale only for critical guidance operations', () => {
    expect(computeGuidanceAutoTimeScale(makeGuidance({
      operation: 'turn',
      suggestedTimeScale: 1,
    }), 1000000)).toBe(1);
    expect(computeGuidanceAutoTimeScale(makeGuidance({
      operation: 'ignite',
      suggestedTimeScale: 1,
    }), 100)).toBe(1);
  });

  it('applies NavigationDirective controls without requiring legacy PhaseGuidance', () => {
    const calls: string[] = [];
    const setDirection = vi.fn(() => calls.push('direction'));
    const setAttitudeMode = vi.fn(() => calls.push('attitude'));
    const setThrustMagnitude = vi.fn(() => calls.push('thrust'));
    const setGear = vi.fn(() => calls.push('gear'));
    const setTimeScale = vi.fn(() => calls.push('time'));
    const directive = makeDirective({
      action: 'capture',
      desiredDirection: [0, 10, 0],
      recommendedGear: 'D',
      recommendedThrustMagnitude: 100,
      suggestedTimeScale: 1,
    });

    expect(applyGuidanceDirection(directive, { setDirection, setAttitudeMode })).toBe(true);
    expect(applyGuidanceThrottle(directive, { setThrustMagnitude, setGear })).toBe(true);
    expect(applyGuidanceTimeScale(directive, { setTimeScale })).toBe(true);

    expect(setDirection).toHaveBeenCalledWith([0, 1, 0]);
    expect(setAttitudeMode).toHaveBeenCalledWith('inertial');
    expect(setThrustMagnitude).toHaveBeenCalledWith(100);
    expect(setGear).toHaveBeenCalledWith('D');
    expect(setTimeScale).toHaveBeenCalledWith(1);
    expect(calls).toEqual(['direction', 'attitude', 'thrust', 'gear', 'time']);
  });

  it('auto-reduces high time scale for directive capture and circularize operations', () => {
    expect(computeGuidanceAutoTimeScale(makeDirective({
      action: 'capture',
      suggestedTimeScale: 1,
    }), 100000)).toBe(1);
    expect(computeGuidanceAutoTimeScale(makeDirective({
      action: 'circularize',
      suggestedTimeScale: 10,
    }), 1000)).toBe(10);
  });
});
