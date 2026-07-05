import React from 'react';
import { describe, expect, it, vi } from 'vitest';
import { renderToStaticMarkup } from 'react-dom/server';
import type { NavigationPlan } from '../../../engine/navigation';
import { computeBodyState, computeLiveNavigationGuidance } from '../../../engine/navigation';
import { julianDate } from '../../../engine/orbital';
import { AU_TO_KM, G_AU, REAL_DATA } from '../../../engine/constants';

type MockGear = 'D' | 'N' | 'R' | 'T';

type MockSpaceshipState = {
  navigationPlan: NavigationPlan | null;
  activePhaseIndex: number;
  position: [number, number, number];
  velocity: [number, number, number];
  direction: [number, number, number];
  simulatedTime: number;
  attitudeMode: 'inertial' | 'prograde' | 'nadir' | 'target';
  thrustMagnitude: number;
  exploded: boolean;
  targetBodyId: string | null;
  setThrustMagnitude: (thrustMagnitude: number) => void;
  setGear: (gear: MockGear) => void;
  setDirection: (direction: [number, number, number]) => void;
  setAttitudeMode: (mode: 'inertial' | 'prograde' | 'nadir' | 'target') => void;
};

type MockExploreState = {
  timeScale: number;
  setTimeScale: (scale: number) => void;
};

function rotateXY(v: [number, number, number], angleDeg: number): [number, number, number] {
  const angle = angleDeg * Math.PI / 180;
  const cos = Math.cos(angle);
  const sin = Math.sin(angle);
  return [
    v[0] * cos - v[1] * sin,
    v[0] * sin + v[1] * cos,
    v[2],
  ];
}

const mockStores = vi.hoisted(() => {
  const spaceshipState = {} as MockSpaceshipState;
  const exploreState: MockExploreState = {
    timeScale: 100,
    setTimeScale: vi.fn(),
  };
  return { spaceshipState, exploreState };
});

vi.mock('../../../stores/spaceshipStore', () => ({
  useSpaceshipStore: Object.assign(
    <T,>(selector: (state: MockSpaceshipState) => T): T => selector(mockStores.spaceshipState),
    {
      getState: () => mockStores.spaceshipState,
    },
  ),
}));

vi.mock('../../../stores/exploreStore', () => ({
  useExploreStore: Object.assign(
    <T,>(selector: (state: MockExploreState) => T): T => selector(mockStores.exploreState),
    {
      getState: () => mockStores.exploreState,
    },
  ),
}));

describe('PhaseGuide', () => {
  it('renders direct rendezvous departure text without exposing time jump as a navigation action', async () => {
    const { default: PhaseGuide } = await import('../PhaseGuide');
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

    mockStores.spaceshipState.navigationPlan = {
      phases: [{
        index: 0,
        name: '等待发射窗口',
        thrustDirection: 'none',
        thrustMagnitude: 0,
        deltaV: 0,
        expectedSpeedKms: 0,
        expectedWaitDays: 300,
        targetOrbit: { semiMajorAxis: 1, eccentricity: 0 },
      }],
      method: 'hohmann',
      destinationId: 'mars',
      plannedAt: simulatedTime,
    };
    mockStores.spaceshipState.activePhaseIndex = 0;
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
    mockStores.spaceshipState.direction = prograde;
    mockStores.spaceshipState.simulatedTime = simulatedTime;
    mockStores.spaceshipState.attitudeMode = 'prograde';
    mockStores.spaceshipState.thrustMagnitude = 0;
    mockStores.spaceshipState.exploded = false;
    mockStores.spaceshipState.targetBodyId = 'mars';
    mockStores.spaceshipState.setThrustMagnitude = vi.fn();
    mockStores.spaceshipState.setGear = vi.fn();
    mockStores.spaceshipState.setDirection = vi.fn();
    mockStores.spaceshipState.setAttitudeMode = vi.fn();

    const html = renderToStaticMarkup(React.createElement(PhaseGuide));

    expect(html).toContain('脱离当前天体引力范围');
    expect(html).toContain('指向汇合点方向');
    expect(html).toContain('当前有效速度');
    expect(html).toContain('按当前有效速度到达');
    expect(html).toContain('火星到达汇合点');
    expect(html).toContain('径向速度');
    expect(html).toContain('切向速度');
    expect(html).toContain('理想滑行速度');
    expect(html).toContain('船身夹角');
    expect(html).not.toContain('船身方向偏差');
    expect(html).not.toContain('建议倍率');
    expect(html).not.toContain('按指引设置倍率');
    expect(html).not.toContain('对准导航方向');
    expect(html).not.toContain('按指引设置推力');
    expect(html).not.toContain('详细轨道参数');
    expect(html).not.toContain('日心半长轴');
    expect(html).not.toContain('快进到发射窗口');
  });

  it('renders live Mars operation text without shortcut controls', async () => {
    const { default: PhaseGuide } = await import('../PhaseGuide');
    const simulatedTime = Date.UTC(2026, 6, 4);
    const marsState = computeBodyState('mars', julianDate(simulatedTime));
    expect(marsState).not.toBeNull();
    if (!marsState) return;

    const hillRadius = REAL_DATA.mars.semiMajorAxis!
      * Math.pow(REAL_DATA.mars.mass / (3 * REAL_DATA.sun.mass), 1 / 3);
    const relativeDistance = hillRadius * 2;
    const highRelativeSpeed = 8 / AU_TO_KM;

    mockStores.spaceshipState.navigationPlan = null;
    mockStores.spaceshipState.activePhaseIndex = -1;
    mockStores.spaceshipState.position = [
      marsState.position[0] + relativeDistance,
      marsState.position[1],
      marsState.position[2],
    ];
    mockStores.spaceshipState.velocity = [
      marsState.velocity[0] - highRelativeSpeed,
      marsState.velocity[1] + highRelativeSpeed * 0.2,
      marsState.velocity[2],
    ];
    mockStores.spaceshipState.direction = [1, 0, 0];
    mockStores.spaceshipState.simulatedTime = simulatedTime;
    mockStores.spaceshipState.attitudeMode = 'inertial';
    mockStores.spaceshipState.thrustMagnitude = 0;
    mockStores.spaceshipState.exploded = false;
    mockStores.spaceshipState.targetBodyId = 'mars';
    mockStores.spaceshipState.setThrustMagnitude = vi.fn();
    mockStores.spaceshipState.setGear = vi.fn();
    mockStores.spaceshipState.setDirection = vi.fn();
    mockStores.spaceshipState.setAttitudeMode = vi.fn();

    const html = renderToStaticMarkup(React.createElement(PhaseGuide));

    expect(html).toContain('目标：火星');
    expect(html).toContain('参考方向：火星相对顺行方向');
    expect(html).toContain('档位：N');
    expect(html).toContain('推力：0 MN');
    expect(html).toContain('导航夹角');
    expect(html).not.toContain('对准导航方向');
    expect(html).toContain('指引：N · 0 MN');
    expect(html).not.toContain('按指引设置推力');
    expect(html).not.toContain('建议倍率');
    expect(html).not.toContain('按指引设置倍率');
    expect(html).not.toContain('详细轨道参数');
    expect(html).not.toContain('日心半长轴');
  });

  it('renders signed ship nose angle against the guidance reference direction', async () => {
    const { default: PhaseGuide } = await import('../PhaseGuide');
    const simulatedTime = Date.UTC(2026, 6, 4);
    const position: [number, number, number] = [1, 0, 0];
    const velocity: [number, number, number] = [0, 0, 0];
    const baseGuidance = computeLiveNavigationGuidance({
      shipPosition: position,
      shipVelocity: velocity,
      shipDirection: [1, 0, 0],
      destinationId: 'mars',
      simulatedTime,
      thrustMagnitude: 0,
    });
    expect(baseGuidance.desiredDirection).toBeDefined();
    if (!baseGuidance.desiredDirection) return;

    mockStores.spaceshipState.navigationPlan = null;
    mockStores.spaceshipState.activePhaseIndex = -1;
    mockStores.spaceshipState.position = position;
    mockStores.spaceshipState.velocity = velocity;
    mockStores.spaceshipState.direction = rotateXY(baseGuidance.desiredDirection, -10);
    mockStores.spaceshipState.simulatedTime = simulatedTime;
    mockStores.spaceshipState.attitudeMode = 'inertial';
    mockStores.spaceshipState.thrustMagnitude = 0;
    mockStores.spaceshipState.exploded = false;
    mockStores.spaceshipState.targetBodyId = 'mars';
    mockStores.spaceshipState.setThrustMagnitude = vi.fn();
    mockStores.spaceshipState.setGear = vi.fn();
    mockStores.spaceshipState.setDirection = vi.fn();
    mockStores.spaceshipState.setAttitudeMode = vi.fn();

    const html = renderToStaticMarkup(React.createElement(PhaseGuide));

    expect(html).toContain('船身夹角：-10.0°');
  });

  it('renders direct rendezvous guidance for Earth departure without shortcut buttons', async () => {
    const { default: PhaseGuide } = await import('../PhaseGuide');
    const simulatedTime = Date.UTC(2027, 4, 13, 6);
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

    mockStores.spaceshipState.navigationPlan = {
      phases: [{
        index: 1,
        name: '提升远日点',
        thrustDirection: 'forward',
        thrustMagnitude: 100,
        deltaV: 0,
        expectedSpeedKms: 0,
        targetOrbit: { semiMajorAxis: 1, eccentricity: 0 },
      }],
      method: 'hohmann',
      destinationId: 'mars',
      plannedAt: simulatedTime,
    };
    mockStores.spaceshipState.activePhaseIndex = 0;
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
    mockStores.spaceshipState.direction = prograde;
    mockStores.spaceshipState.simulatedTime = simulatedTime;
    mockStores.spaceshipState.attitudeMode = 'prograde';
    mockStores.spaceshipState.thrustMagnitude = 0;
    mockStores.spaceshipState.exploded = false;
    mockStores.spaceshipState.targetBodyId = 'mars';
    mockStores.spaceshipState.setThrustMagnitude = vi.fn();
    mockStores.spaceshipState.setGear = vi.fn();
    mockStores.spaceshipState.setDirection = vi.fn();
    mockStores.spaceshipState.setAttitudeMode = vi.fn();

    const html = renderToStaticMarkup(React.createElement(PhaseGuide));

    expect(html).toContain('脱离当前天体引力范围');
    expect(html).toContain('汇合点');
    expect(html).toContain('当前有效速度');
    expect(html).toContain('理想滑行速度');
    expect(html).toContain('按当前有效速度到达');
    expect(html).toContain('火星到达汇合点');
    expect(html).not.toContain('对准导航方向');
    expect(html).not.toContain('按指引设置推力');
    expect(html).toContain('指引：D · 100 MN');
  });
});
