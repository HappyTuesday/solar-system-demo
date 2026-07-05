import type { SpaceshipState } from '../types';
import { AU_TO_KM, REAL_DATA } from './constants';
import { julianDate } from './orbital';
import { computeBodyState } from './navigation';
import {
  applyThrustInBodyFrame,
  hasEffectiveThrust,
  rk4StepSpaceship,
  type BodyInfo,
} from './spaceship';

export const EXPLORE_BODY_IDS = [
  'sun',
  'mercury',
  'venus',
  'earth',
  'mars',
  'jupiter',
  'saturn',
  'uranus',
  'neptune',
] as const;

export type ExploreBodyId = typeof EXPLORE_BODY_IDS[number];

export interface ExploreBodyState extends BodyInfo {
  velocity: [number, number, number];
}

export interface AdvanceExploreShipPhysicsInput {
  ship: SpaceshipState;
  simulatedTime: number;
  frameDt: number;
  timeScale: number;
  bodyIds?: readonly string[];
}

export interface AdvanceExploreShipPhysicsResult {
  ship: SpaceshipState;
  simulatedTime: number;
  simDelta: number;
  speedKms: number;
  travelKm: number;
  finalBodies: ExploreBodyState[];
}

export function computeExploreBodyStates(
  simulatedTime: number,
  bodyIds: readonly string[] = EXPLORE_BODY_IDS,
): ExploreBodyState[] {
  const jd = julianDate(simulatedTime);
  const states: ExploreBodyState[] = [];

  for (const id of bodyIds) {
    const data = REAL_DATA[id];
    if (!data) continue;

    if (id === 'sun') {
      states.push({
        id,
        position: [0, 0, 0],
        velocity: [0, 0, 0],
        mass: data.mass,
        radius: data.radius,
      });
      continue;
    }

    const state = computeBodyState(id, jd);
    if (!state) continue;

    states.push({
      id,
      position: state.position,
      velocity: state.velocity,
      mass: data.mass,
      radius: data.radius,
    });
  }

  return states;
}

function bodyInfosAtOffset(states: ExploreBodyState[], timeOffset: number): BodyInfo[] {
  return states.map(body => ({
    id: body.id,
    position: [
      body.position[0] + body.velocity[0] * timeOffset,
      body.position[1] + body.velocity[1] * timeOffset,
      body.position[2] + body.velocity[2] * timeOffset,
    ],
    mass: body.mass,
    radius: body.radius,
  }));
}

export function advanceExploreShipPhysics(
  input: AdvanceExploreShipPhysicsInput,
): AdvanceExploreShipPhysicsResult {
  const frameDt = Math.max(0, input.frameDt);
  const simDelta = frameDt * input.timeScale;
  const isThrusting = hasEffectiveThrust(input.ship.thrust, input.ship.thrustMagnitude);

  const worldThrust = applyThrustInBodyFrame(
    input.ship.thrust[0],
    input.ship.thrust[1],
    input.ship.thrust[2],
    input.ship.thrustMagnitude,
    input.ship.direction,
  );

  const ship: SpaceshipState = {
    position: [...input.ship.position],
    velocity: [...input.ship.velocity],
    direction: [...input.ship.direction],
    thrust: worldThrust,
    thrustMagnitude: input.ship.thrustMagnitude,
    exploded: input.ship.exploded,
  };

  const targetSubDt = isThrusting ? 0.02 : 0.016;
  const steps = Math.min(Math.max(1, Math.ceil(simDelta / targetSubDt)), 200);
  const subDt = simDelta / steps;
  const bodyIds = input.bodyIds ?? EXPLORE_BODY_IDS;

  for (let step = 0; step < steps; step++) {
    const subSimTime = input.simulatedTime + step * subDt * 1000;
    const bodyStates = computeExploreBodyStates(subSimTime, bodyIds);
    const getBodies = (timeOffset: number): BodyInfo[] => bodyInfosAtOffset(bodyStates, timeOffset);
    rk4StepSpaceship(ship, getBodies, subDt);
  }

  const speedKms = Math.sqrt(
    ship.velocity[0] ** 2 + ship.velocity[1] ** 2 + ship.velocity[2] ** 2,
  ) * AU_TO_KM;

  return {
    ship,
    simulatedTime: input.simulatedTime + simDelta * 1000,
    simDelta,
    speedKms,
    travelKm: speedKms * simDelta,
    finalBodies: computeExploreBodyStates(input.simulatedTime + simDelta * 1000, bodyIds),
  };
}
