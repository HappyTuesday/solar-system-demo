import { describe, expect, it } from 'vitest';
import { AU_TO_KM, G_AU, MU_SUN_AU, REAL_DATA } from '../constants';
import { computeBodyState } from '../navigation';
import { julianDate, stateVectors } from '../orbital';
import { computeMarsMissionDirective } from '../marsMissionNavigator';

function marsStateAt(simulatedTime: number) {
  const marsState = computeBodyState('mars', julianDate(simulatedTime));
  expect(marsState).not.toBeNull();
  if (!marsState) throw new Error('missing Mars state');
  return marsState;
}

function makeMarsRelativeState(
  simulatedTime: number,
  relativePosition: [number, number, number],
  relativeVelocity: [number, number, number],
) {
  const marsState = marsStateAt(simulatedTime);
  return {
    position: [
      marsState.position[0] + relativePosition[0],
      marsState.position[1] + relativePosition[1],
      marsState.position[2] + relativePosition[2],
    ] as [number, number, number],
    velocity: [
      marsState.velocity[0] + relativeVelocity[0],
      marsState.velocity[1] + relativeVelocity[1],
      marsState.velocity[2] + relativeVelocity[2],
    ] as [number, number, number],
  };
}

describe('marsMissionNavigator', () => {
  it('returns direct rendezvous guidance without exposing jumpTime as a navigation action', () => {
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

    const directive = computeMarsMissionDirective({
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
      shipDirection: prograde,
      simulatedTime,
      thrustMagnitude: 0,
    });

    expect(directive.action).not.toBe('wait');
    expect(directive.title).toContain('地球出发点火');
    expect(directive.target).not.toContain('霍曼');
    expect(directive.recommendedGear).toBe('D');
    expect(directive.recommendedThrustMagnitude).toBeGreaterThan(0);
  });

  it('keeps Earth departure guidance when Mars is nearby but the ship is still in Earth parking orbit', () => {
    const simulatedTime = Date.UTC(2026, 10, 4);
    const earthState = computeBodyState('earth', julianDate(simulatedTime));
    const marsState = computeBodyState('mars', julianDate(simulatedTime));
    expect(earthState).not.toBeNull();
    expect(marsState).not.toBeNull();
    if (!earthState || !marsState) return;

    const earthMarsDistance = Math.sqrt(
      (earthState.position[0] - marsState.position[0]) ** 2
      + (earthState.position[1] - marsState.position[1]) ** 2
      + (earthState.position[2] - marsState.position[2]) ** 2,
    );
    expect(earthMarsDistance).toBeLessThan(1.5);

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

    const directive = computeMarsMissionDirective({
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
      shipDirection: prograde,
      simulatedTime,
      thrustMagnitude: 0,
    });

    expect(directive.title).not.toContain('火星远距离');
    expect(directive.target).not.toBe('火星远距离接近');
    expect(['wait', 'turn', 'ignite']).toContain(directive.action);
  });

  it('leaves launch-window wait guidance once the Hohmann window is completed', () => {
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

    const directive = computeMarsMissionDirective({
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
      shipDirection: prograde,
      simulatedTime,
      thrustMagnitude: 0,
    });

    expect(directive.title).not.toBe('窗口已就绪！');
    expect(directive.action).not.toBe('wait');
  });

  it('uses low departure thrust so a human can react to live replanning', () => {
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

    const directive = computeMarsMissionDirective({
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
      shipDirection: prograde,
      simulatedTime,
      thrustMagnitude: 0,
    });

    expect(directive.action).toBe('ignite');
    expect(directive.recommendedGear).toBe('D');
    expect(directive.recommendedThrustMagnitude).toBe(0.2);
  });

  it('waits at the 90 degree Earth parking phase when departure prograde opposes Earth heliocentric motion', () => {
    const simulatedTime = Date.UTC(2027, 4, 13, 6);
    const earthState = computeBodyState('earth', julianDate(simulatedTime));
    expect(earthState).not.toBeNull();
    if (!earthState) return;

    const earthSpeed = Math.sqrt(
      earthState.velocity[0] ** 2 + earthState.velocity[1] ** 2 + earthState.velocity[2] ** 2,
    );
    const earthPrograde: [number, number, number] = [
      earthState.velocity[0] / earthSpeed,
      earthState.velocity[1] / earthSpeed,
      earthState.velocity[2] / earthSpeed,
    ];
    const radial: [number, number, number] = [-earthPrograde[1], earthPrograde[0], 0];
    const parkingRadius = REAL_DATA.earth.radius + 400 / AU_TO_KM;
    const localSpeed = Math.sqrt(G_AU * REAL_DATA.earth.mass / parkingRadius);
    const departureRetrograde: [number, number, number] = [
      -earthPrograde[0],
      -earthPrograde[1],
      -earthPrograde[2],
    ];

    const directive = computeMarsMissionDirective({
      shipPosition: [
        earthState.position[0] + radial[0] * parkingRadius,
        earthState.position[1] + radial[1] * parkingRadius,
        earthState.position[2],
      ],
      shipVelocity: [
        earthState.velocity[0] + departureRetrograde[0] * localSpeed,
        earthState.velocity[1] + departureRetrograde[1] * localSpeed,
        earthState.velocity[2] + departureRetrograde[2] * localSpeed,
      ],
      shipDirection: departureRetrograde,
      simulatedTime,
      thrustMagnitude: 0,
    });

    expect(directive.action).toBe('wait');
    expect(directive.title).toContain('等待地球绕飞点火相位');
    expect(directive.metrics).toContainEqual(expect.objectContaining({
      label: '出发方向顺行性',
      current: 0,
      target: 1,
      warn: true,
    }));
    expect(directive.recommendedGear).toBe('N');
    expect(directive.recommendedThrustMagnitude).toBe(0);
  });

  it('ignites at the 90 degree Earth parking phase when departure prograde aligns with Earth heliocentric motion', () => {
    const simulatedTime = Date.UTC(2027, 4, 13, 6);
    const earthState = computeBodyState('earth', julianDate(simulatedTime));
    expect(earthState).not.toBeNull();
    if (!earthState) return;

    const earthSpeed = Math.sqrt(
      earthState.velocity[0] ** 2 + earthState.velocity[1] ** 2 + earthState.velocity[2] ** 2,
    );
    const earthPrograde: [number, number, number] = [
      earthState.velocity[0] / earthSpeed,
      earthState.velocity[1] / earthSpeed,
      earthState.velocity[2] / earthSpeed,
    ];
    const radial: [number, number, number] = [-earthPrograde[1], earthPrograde[0], 0];
    const parkingRadius = REAL_DATA.earth.radius + 400 / AU_TO_KM;
    const localSpeed = Math.sqrt(G_AU * REAL_DATA.earth.mass / parkingRadius);

    const directive = computeMarsMissionDirective({
      shipPosition: [
        earthState.position[0] + radial[0] * parkingRadius,
        earthState.position[1] + radial[1] * parkingRadius,
        earthState.position[2],
      ],
      shipVelocity: [
        earthState.velocity[0] + earthPrograde[0] * localSpeed,
        earthState.velocity[1] + earthPrograde[1] * localSpeed,
        earthState.velocity[2] + earthPrograde[2] * localSpeed,
      ],
      shipDirection: earthPrograde,
      simulatedTime,
      thrustMagnitude: 0,
    });

    expect(directive.action).toBe('ignite');
    expect(directive.title).toContain('地球出发点火');
    expect(directive.metrics).toContainEqual(expect.objectContaining({
      label: '出发方向顺行性',
      current: 1,
      target: 1,
      highlight: true,
    }));
    expect(directive.recommendedGear).toBe('D');
    expect(directive.recommendedThrustMagnitude).toBe(0.2);
  });

  it('waits for the narrow Earth parking departure phase instead of igniting at 40 degrees', () => {
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
    const normal: [number, number, number] = [-prograde[1], prograde[0], 0];
    const phaseRad = 40 * Math.PI / 180;
    const relativePositionDirection: [number, number, number] = [
      prograde[0] * Math.cos(phaseRad) + normal[0] * Math.sin(phaseRad),
      prograde[1] * Math.cos(phaseRad) + normal[1] * Math.sin(phaseRad),
      0,
    ];
    const parkingRadius = REAL_DATA.earth.radius + 400 / AU_TO_KM;
    const localSpeed = Math.sqrt(G_AU * REAL_DATA.earth.mass / parkingRadius);

    const directive = computeMarsMissionDirective({
      shipPosition: [
        earthState.position[0] + relativePositionDirection[0] * parkingRadius,
        earthState.position[1] + relativePositionDirection[1] * parkingRadius,
        earthState.position[2],
      ],
      shipVelocity: [
        earthState.velocity[0] + prograde[0] * localSpeed,
        earthState.velocity[1] + prograde[1] * localSpeed,
        earthState.velocity[2],
      ],
      shipDirection: prograde,
      simulatedTime,
      thrustMagnitude: 0,
    });

    expect(directive.action).toBe('wait');
    expect(directive.title).toContain('等待地球绕飞点火相位');
    expect(directive.recommendedGear).toBe('N');
    expect(directive.recommendedThrustMagnitude).toBe(0);
  });

  it('cuts off an overburned Earth departure before asking for correction', () => {
    const simulatedTime = Date.UTC(2027, 4, 10);
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
    const excessiveEscapeSpeed = 80 / AU_TO_KM;

    const directive = computeMarsMissionDirective({
      shipPosition: [
        earthState.position[0] + radial[0] * parkingRadius,
        earthState.position[1] + radial[1] * parkingRadius,
        earthState.position[2],
      ],
      shipVelocity: [
        earthState.velocity[0] + prograde[0] * excessiveEscapeSpeed,
        earthState.velocity[1] + prograde[1] * excessiveEscapeSpeed,
        earthState.velocity[2] + prograde[2] * excessiveEscapeSpeed,
      ],
      shipDirection: prograde,
      simulatedTime,
      thrustMagnitude: 100,
    });

    expect(directive.action).toBe('cutoff');
    expect(directive.recommendedGear).toBe('N');
    expect(directive.recommendedThrustMagnitude).toBe(0);
    expect(directive.title).toContain('过燃');
  });

  it('continues overburn correction when already aligned to heliocentric retrograde', () => {
    const simulatedTime = Date.UTC(2027, 4, 10);
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
    const excessiveEscapeSpeed = 80 / AU_TO_KM;
    const shipVelocity: [number, number, number] = [
      earthState.velocity[0] + prograde[0] * excessiveEscapeSpeed,
      earthState.velocity[1] + prograde[1] * excessiveEscapeSpeed,
      earthState.velocity[2] + prograde[2] * excessiveEscapeSpeed,
    ];
    const speed = Math.sqrt(shipVelocity[0] ** 2 + shipVelocity[1] ** 2 + shipVelocity[2] ** 2);
    const retrograde: [number, number, number] = [
      -shipVelocity[0] / speed,
      -shipVelocity[1] / speed,
      -shipVelocity[2] / speed,
    ];

    const directive = computeMarsMissionDirective({
      shipPosition: [
        earthState.position[0] + radial[0] * parkingRadius,
        earthState.position[1] + radial[1] * parkingRadius,
        earthState.position[2],
      ],
      shipVelocity,
      shipDirection: retrograde,
      simulatedTime,
      thrustMagnitude: 10,
    });

    expect(directive.action).toBe('ignite');
    expect(directive.recommendedGear).toBe('D');
    expect(directive.recommendedThrustMagnitude).toBe(0.2);
    expect(directive.title).toContain('反向修正');
  });

  it('prioritizes Earth departure overburn correction before transfer coast when the orbit still covers Mars', () => {
    const simulatedTime = Date.UTC(2027, 4, 12, 6, 41);
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
    const hillRadius = REAL_DATA.earth.semiMajorAxis!
      * Math.pow(REAL_DATA.earth.mass / (3 * REAL_DATA.sun.mass), 1 / 3);
    const departureDistance = hillRadius * 0.05;
    const delayedCutoffEscapeSpeed = 13 / AU_TO_KM;

    const directive = computeMarsMissionDirective({
      shipPosition: [
        earthState.position[0] + radial[0] * departureDistance,
        earthState.position[1] + radial[1] * departureDistance,
        earthState.position[2],
      ],
      shipVelocity: [
        earthState.velocity[0] + prograde[0] * delayedCutoffEscapeSpeed,
        earthState.velocity[1] + prograde[1] * delayedCutoffEscapeSpeed,
        earthState.velocity[2] + prograde[2] * delayedCutoffEscapeSpeed,
      ],
      shipDirection: prograde,
      simulatedTime,
      thrustMagnitude: 0,
    });

    expect(directive.action).not.toBe('coast');
    expect(directive.title).toContain('过燃');
    expect(directive.recommendedGear).toBe('N');
    expect(directive.recommendedThrustMagnitude).toBe(0);
  });

  it('returns coast guidance once the heliocentric transfer orbit covers Mars orbit', () => {
    const marsA = REAL_DATA.mars.semiMajorAxis!;
    const transferA = (1 + marsA) / 2;
    const transferEcc = (marsA - 1) / (marsA + 1);
    const sv = stateVectors(transferA, transferEcc, 0, 0, 0, 0, MU_SUN_AU);
    let directive: ReturnType<typeof computeMarsMissionDirective> | null = null;

    for (let day = 0; day <= 780; day += 20) {
      const current = computeMarsMissionDirective({
        shipPosition: sv.position,
        shipVelocity: sv.velocity,
        shipDirection: [0, 1, 0],
        simulatedTime: Date.UTC(2026, 6, 4) + day * 86400 * 1000,
        thrustMagnitude: 0,
      });
      if (current.action === 'coast') {
        directive = current;
        break;
      }
    }

    expect(directive).not.toBeNull();
    expect(directive?.action).toBe('coast');
    expect(directive?.title).toContain('转移');
    expect(directive?.recommendedGear).toBe('N');
    expect(directive?.recommendedThrustMagnitude).toBe(0);
    expect(directive?.suggestedTimeScale).toBeGreaterThan(1);
  });

  it('corrects a transfer cruise that covers Mars orbit but predicts a wide Mars miss', () => {
    const marsA = REAL_DATA.mars.semiMajorAxis!;
    const transferA = (1 + marsA) / 2;
    const transferEcc = (marsA - 1) / (marsA + 1);
    const sv = stateVectors(transferA, transferEcc, 0, 0, 0, 0, MU_SUN_AU);
    let candidate: {
      directive: ReturnType<typeof computeMarsMissionDirective>;
      closestApproach: number;
    } | null = null;

    for (let day = 0; day <= 780; day += 20) {
      const simulatedTime = Date.UTC(2026, 6, 4) + day * 86400 * 1000;
      const marsState = computeBodyState('mars', julianDate(simulatedTime));
      expect(marsState).not.toBeNull();
      if (!marsState) return;

      const relativePosition: [number, number, number] = [
        sv.position[0] - marsState.position[0],
        sv.position[1] - marsState.position[1],
        sv.position[2] - marsState.position[2],
      ];
      const relativeVelocity: [number, number, number] = [
        sv.velocity[0] - marsState.velocity[0],
        sv.velocity[1] - marsState.velocity[1],
        sv.velocity[2] - marsState.velocity[2],
      ];
      const relativeSpeedSq = relativeVelocity[0] ** 2 + relativeVelocity[1] ** 2 + relativeVelocity[2] ** 2;
      const tca = -(
        relativePosition[0] * relativeVelocity[0]
        + relativePosition[1] * relativeVelocity[1]
        + relativePosition[2] * relativeVelocity[2]
      ) / relativeSpeedSq;
      const closestApproach = Math.sqrt(
        (relativePosition[0] + relativeVelocity[0] * tca) ** 2
        + (relativePosition[1] + relativeVelocity[1] * tca) ** 2
        + (relativePosition[2] + relativeVelocity[2] * tca) ** 2,
      );

      if (tca > 0 && closestApproach > 0.3) {
        candidate = {
          closestApproach,
          directive: computeMarsMissionDirective({
            shipPosition: sv.position,
            shipVelocity: sv.velocity,
            shipDirection: [0, 1, 0],
            simulatedTime,
            thrustMagnitude: 0,
          }),
        };
        break;
      }
    }

    expect(candidate).not.toBeNull();
    expect(candidate?.closestApproach).toBeGreaterThan(0.3);
    expect(candidate?.directive.action).not.toBe('coast');
    expect(candidate?.directive.title).toContain('交会修正');
    expect(candidate?.directive.recommendedThrustMagnitude).toBeLessThanOrEqual(1);
  });

  it('uses heliocentric tangential prograde for post-escape Earth補燃', () => {
    const simulatedTime = Date.UTC(2027, 4, 13, 6);
    const earthState = computeBodyState('earth', julianDate(simulatedTime));
    expect(earthState).not.toBeNull();
    if (!earthState) return;

    const earthSpeed = Math.sqrt(
      earthState.velocity[0] ** 2 + earthState.velocity[1] ** 2 + earthState.velocity[2] ** 2,
    );
    const earthPrograde: [number, number, number] = [
      earthState.velocity[0] / earthSpeed,
      earthState.velocity[1] / earthSpeed,
      earthState.velocity[2] / earthSpeed,
    ];
    const radial: [number, number, number] = [-earthPrograde[1], earthPrograde[0], 0];
    const hillRadius = REAL_DATA.earth.semiMajorAxis!
      * Math.pow(REAL_DATA.earth.mass / (3 * REAL_DATA.sun.mass), 1 / 3);
    const departureDistance = hillRadius * 0.05;
    const relativeEscapeSpeed = 4.5 / AU_TO_KM;
    const shipVelocity: [number, number, number] = [
      earthState.velocity[0] - earthPrograde[0] * relativeEscapeSpeed,
      earthState.velocity[1] - earthPrograde[1] * relativeEscapeSpeed,
      earthState.velocity[2] - earthPrograde[2] * relativeEscapeSpeed,
    ];
    const shipPosition: [number, number, number] = [
      earthState.position[0] + radial[0] * departureDistance,
      earthState.position[1] + radial[1] * departureDistance,
      earthState.position[2],
    ];
    const tangential: [number, number, number] = [-shipPosition[1], shipPosition[0], 0];
    const tangentialLen = Math.sqrt(tangential[0] ** 2 + tangential[1] ** 2);
    const heliocentricTangential: [number, number, number] = [
      tangential[0] / tangentialLen,
      tangential[1] / tangentialLen,
      0,
    ];

    const directive = computeMarsMissionDirective({
      shipPosition,
      shipVelocity,
      shipDirection: heliocentricTangential,
      simulatedTime,
      thrustMagnitude: 0,
    });

    expect(directive.title).toContain('补燃');
    expect(directive.desiredDirectionLabel).toContain('日心切向顺行');
    expect(directive.desiredDirection?.[0]).toBeCloseTo(heliocentricTangential[0], 5);
    expect(directive.desiredDirection?.[1]).toBeCloseTo(heliocentricTangential[1], 5);
  });

  it('does not wait for Earth parking phase after Earth-relative escape', () => {
    const simulatedTime = Date.UTC(2027, 4, 13, 8);
    const earthState = computeBodyState('earth', julianDate(simulatedTime));
    expect(earthState).not.toBeNull();
    if (!earthState) return;

    const earthSpeed = Math.sqrt(
      earthState.velocity[0] ** 2 + earthState.velocity[1] ** 2 + earthState.velocity[2] ** 2,
    );
    const earthPrograde: [number, number, number] = [
      earthState.velocity[0] / earthSpeed,
      earthState.velocity[1] / earthSpeed,
      earthState.velocity[2] / earthSpeed,
    ];
    const radial: [number, number, number] = [-earthPrograde[1], earthPrograde[0], 0];
    const parkingRadius = REAL_DATA.earth.radius + 400 / AU_TO_KM;
    const partialEscapeSpeed = 8.5 / AU_TO_KM;
    const shipVelocity: [number, number, number] = [
      earthState.velocity[0] + earthPrograde[0] * partialEscapeSpeed,
      earthState.velocity[1] + earthPrograde[1] * partialEscapeSpeed,
      earthState.velocity[2] + earthPrograde[2] * partialEscapeSpeed,
    ];

    const shipSpeed = Math.sqrt(shipVelocity[0] ** 2 + shipVelocity[1] ** 2 + shipVelocity[2] ** 2);
    const shipPrograde: [number, number, number] = [
      shipVelocity[0] / shipSpeed,
      shipVelocity[1] / shipSpeed,
      shipVelocity[2] / shipSpeed,
    ];

    const directive = computeMarsMissionDirective({
      shipPosition: [
        earthState.position[0] + radial[0] * parkingRadius,
        earthState.position[1] + radial[1] * parkingRadius,
        earthState.position[2],
      ],
      shipVelocity,
      shipDirection: shipPrograde,
      simulatedTime,
      thrustMagnitude: 0,
    });

    expect(directive.title).not.toContain('等待地球绕飞点火相位');
    expect(directive.reason).not.toContain('绕飞相位');
    expect(['turn', 'ignite', 'coast', 'cutoff']).toContain(directive.action);
  });

  it('switches to heliocentric tangential prograde after Earth-relative escape has enough speed margin', () => {
    const simulatedTime = Date.UTC(2027, 4, 13, 8);
    const earthState = computeBodyState('earth', julianDate(simulatedTime));
    expect(earthState).not.toBeNull();
    if (!earthState) return;

    const earthSpeed = Math.sqrt(
      earthState.velocity[0] ** 2 + earthState.velocity[1] ** 2 + earthState.velocity[2] ** 2,
    );
    const earthPrograde: [number, number, number] = [
      earthState.velocity[0] / earthSpeed,
      earthState.velocity[1] / earthSpeed,
      earthState.velocity[2] / earthSpeed,
    ];
    const radial: [number, number, number] = [-earthPrograde[1], earthPrograde[0], 0];
    const hillRadius = REAL_DATA.earth.semiMajorAxis!
      * Math.pow(REAL_DATA.earth.mass / (3 * REAL_DATA.sun.mass), 1 / 3);
    const departureDistance = hillRadius * 0.05;
    const relativeEscapeSpeed = 4.5 / AU_TO_KM;
    const shipPosition: [number, number, number] = [
      earthState.position[0] + radial[0] * departureDistance,
      earthState.position[1] + radial[1] * departureDistance,
      earthState.position[2],
    ];
    const shipVelocity: [number, number, number] = [
      earthState.velocity[0] - earthPrograde[0] * relativeEscapeSpeed,
      earthState.velocity[1] - earthPrograde[1] * relativeEscapeSpeed,
      earthState.velocity[2] - earthPrograde[2] * relativeEscapeSpeed,
    ];
    const tangential: [number, number, number] = [-shipPosition[1], shipPosition[0], 0];
    const tangentialLen = Math.sqrt(tangential[0] ** 2 + tangential[1] ** 2);
    const heliocentricTangential: [number, number, number] = [
      tangential[0] / tangentialLen,
      tangential[1] / tangentialLen,
      0,
    ];

    const directive = computeMarsMissionDirective({
      shipPosition,
      shipVelocity,
      shipDirection: heliocentricTangential,
      simulatedTime,
      thrustMagnitude: 0,
    });

    expect(directive.title).toContain('稳定离场补燃');
    expect(directive.desiredDirectionLabel).toContain('日心切向顺行');
    expect(directive.desiredDirection?.[0]).toBeCloseTo(heliocentricTangential[0], 5);
    expect(directive.desiredDirection?.[1]).toBeCloseTo(heliocentricTangential[1], 5);
  });

  it('keeps Earth departure control after escape instead of braking for distant Mars', () => {
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
    const transferEscapeSpeed = 13 / AU_TO_KM;

    const directive = computeMarsMissionDirective({
      shipPosition: [
        earthState.position[0] + radial[0] * parkingRadius,
        earthState.position[1] + radial[1] * parkingRadius,
        earthState.position[2],
      ],
      shipVelocity: [
        earthState.velocity[0] + prograde[0] * transferEscapeSpeed,
        earthState.velocity[1] + prograde[1] * transferEscapeSpeed,
        earthState.velocity[2] + prograde[2] * transferEscapeSpeed,
      ],
      shipDirection: prograde,
      simulatedTime,
      thrustMagnitude: 0,
    });

    expect(['coast', 'turn', 'cutoff', 'ignite']).toContain(directive.action);
    expect(directive.title).not.toContain('火星远距离');
    expect(directive.target).not.toBe('火星远距离接近');
  });

  it('returns Mars far approach braking guidance when relative speed is high', () => {
    const simulatedTime = Date.UTC(2026, 6, 4);
    const hillRadius = REAL_DATA.mars.semiMajorAxis!
      * Math.pow(REAL_DATA.mars.mass / (3 * REAL_DATA.sun.mass), 1 / 3);
    const ship = makeMarsRelativeState(
      simulatedTime,
      [hillRadius * 2, 0, 0],
      [-8 / AU_TO_KM, 1.6 / AU_TO_KM, 0],
    );

    const directive = computeMarsMissionDirective({
      shipPosition: ship.position,
      shipVelocity: ship.velocity,
      shipDirection: [1, 0, 0],
      simulatedTime,
      thrustMagnitude: 0,
    });

    expect(directive.action === 'turn' || directive.action === 'capture').toBe(true);
    expect(directive.title).toContain('火星');
    expect(directive.desiredDirectionLabel).toContain('逆行');
    expect(directive.recommendedGear).toBe(directive.action === 'turn' ? 'N' : 'D');
  });

  it('does not start Mars far approach braking at AU-scale transfer distance', () => {
    const simulatedTime = Date.UTC(2027, 4, 13);
    const ship = makeMarsRelativeState(
      simulatedTime,
      [1, 0, 0],
      [-8 / AU_TO_KM, 1 / AU_TO_KM, 0],
    );

    const directive = computeMarsMissionDirective({
      shipPosition: ship.position,
      shipVelocity: ship.velocity,
      shipDirection: [1, 0, 0],
      simulatedTime,
      thrustMagnitude: 0,
    });

    expect(directive.title).not.toContain('火星远距离');
    expect(directive.target).not.toBe('火星远距离接近');
  });

  it('cuts off wrong-direction thrust before Mars far approach braking', () => {
    const simulatedTime = Date.UTC(2026, 6, 4);
    const hillRadius = REAL_DATA.mars.semiMajorAxis!
      * Math.pow(REAL_DATA.mars.mass / (3 * REAL_DATA.sun.mass), 1 / 3);
    const ship = makeMarsRelativeState(
      simulatedTime,
      [hillRadius * 2, 0, 0],
      [-8 / AU_TO_KM, 1.6 / AU_TO_KM, 0],
    );

    const directive = computeMarsMissionDirective({
      shipPosition: ship.position,
      shipVelocity: ship.velocity,
      shipDirection: [0, 1, 0],
      simulatedTime,
      thrustMagnitude: 100,
    });

    expect(directive.action).toBe('cutoff');
    expect(directive.recommendedGear).toBe('N');
    expect(directive.recommendedThrustMagnitude).toBe(0);
    expect(directive.title).toContain('先熄火');
  });

  it('brakes near the Mars Hill boundary when relative speed is still hyperbolic', () => {
    const simulatedTime = Date.UTC(2026, 6, 4);
    const hillRadius = REAL_DATA.mars.semiMajorAxis!
      * Math.pow(REAL_DATA.mars.mass / (3 * REAL_DATA.sun.mass), 1 / 3);
    const ship = makeMarsRelativeState(
      simulatedTime,
      [hillRadius * 1.3, 0, 0],
      [-0.22 / AU_TO_KM, 0.79 / AU_TO_KM, 0],
    );

    const directive = computeMarsMissionDirective({
      shipPosition: ship.position,
      shipVelocity: ship.velocity,
      shipDirection: [1, 0, 0],
      simulatedTime,
      thrustMagnitude: 0,
    });

    expect(['turn', 'capture']).toContain(directive.action);
    expect(directive.title).toContain('制动');
  });

  it('brakes near the Mars Hill boundary while Mars-relative energy is still positive', () => {
    const simulatedTime = Date.UTC(2026, 6, 4);
    const hillRadius = REAL_DATA.mars.semiMajorAxis!
      * Math.pow(REAL_DATA.mars.mass / (3 * REAL_DATA.sun.mass), 1 / 3);
    const ship = makeMarsRelativeState(
      simulatedTime,
      [hillRadius * 1.25, 0, 0],
      [-0.2 / AU_TO_KM, 0.36 / AU_TO_KM, 0],
    );

    const directive = computeMarsMissionDirective({
      shipPosition: ship.position,
      shipVelocity: ship.velocity,
      shipDirection: [1, 0, 0],
      simulatedTime,
      thrustMagnitude: 0,
    });

    expect(['turn', 'capture']).toContain(directive.action);
    expect(directive.title).toContain('制动');
  });

  it('returns arrived for a stable Mars parking orbit', () => {
    const simulatedTime = Date.UTC(2026, 6, 4);
    const marsMu = G_AU * REAL_DATA.mars.mass;
    const orbitRadius = REAL_DATA.mars.radius + 30000 / AU_TO_KM;
    const circularSpeed = Math.sqrt(marsMu / orbitRadius);
    const ship = makeMarsRelativeState(simulatedTime, [orbitRadius, 0, 0], [0, circularSpeed, 0]);

    const directive = computeMarsMissionDirective({
      shipPosition: ship.position,
      shipVelocity: ship.velocity,
      shipDirection: [0, 1, 0],
      simulatedTime,
      thrustMagnitude: 0,
    });

    expect(directive.action).toBe('arrived');
    expect(directive.completed).toBe(true);
    expect(directive.recommendedGear).toBe('N');
    expect(directive.recommendedThrustMagnitude).toBe(0);
  });
});
