import { useEffect } from 'react';
import ExploreCanvas from '../components/explore/ExploreCanvas';
import Dashboard from '../components/explore/Dashboard';
import HUD from '../components/explore/HUD';
import CrashOverlay from '../components/explore/CrashOverlay';
import { useSpaceshipStore } from '../stores/spaceshipStore';
import { useExploreStore } from '../stores/exploreStore';
import { computeBodyState } from '../engine/navigation';
import { julianDate } from '../engine/orbital';
import './ExplorePage.css';

declare global {
  interface Window {
    __debug: {
      selectTarget: (id: string) => void;
      timeJump: (ms: number) => void;
      setThrust: (mag: number, forward?: number) => void;
      setBackwardThrust: (mag: number) => void;
      setForwardThrustAtomic: (mag: number) => void;
      setAttitudeMode: (mode: 'inertial' | 'prograde' | 'nadir' | 'target' | 'rendezvous') => void;
      getStatus: () => Record<string, unknown>;
      checkNavigation: () => Record<string, unknown>;
      jumpToTime: (targetTime: number) => void;
      setOrbitingBody: (id: string) => void;
      setDirection: (d: [number, number, number]) => void;
      setPosition: (p: [number, number, number]) => void;
      setVelocity: (v: [number, number, number]) => void;
      setPositionVelocity: (p: [number, number, number], v: [number, number, number]) => void;
      teleportToMars: () => boolean;
      setTimeScale: (scale: number) => void;
      forwardThrustMax: () => void;
      stopThrust: () => void;
      fastForward: () => void;
      isRunning: boolean;
    };
  }
}

function ExplorePage() {
  useEffect(() => {
    window.__debug = {
      isRunning: true,

      selectTarget: (id: string) => {
        useSpaceshipStore.getState().setTargetBody(id);
      },

      timeJump: (ms: number) => {
        const s = useSpaceshipStore.getState();
        useSpaceshipStore.getState().timeJump(s.simulatedTime + ms);
      },

      setThrust: (mag: number, forward?: number) => {
        const s = useSpaceshipStore.getState();
        useSpaceshipStore.setState({
          thrustMagnitude: mag,
          ...(forward !== undefined ? { thrust: [forward, s.thrust[1], s.thrust[2]] } : {}),
        });
      },

      setBackwardThrust: (mag: number) => {
        const s = useSpaceshipStore.getState();
        // Set both atomically in one call to avoid race conditions
        useSpaceshipStore.setState({
          thrustMagnitude: mag,
          thrust: [-1, s.thrust[1], s.thrust[2]],
        });
      },
      
      setForwardThrustAtomic: (mag: number) => {
        const s = useSpaceshipStore.getState();
        useSpaceshipStore.setState({
          thrustMagnitude: mag,
          thrust: [1, s.thrust[1], s.thrust[2]],
        });
      },

      setAttitudeMode: (mode) => {
        useSpaceshipStore.getState().setAttitudeMode(mode);
      },

      forwardThrustMax: () => {
        const s = useSpaceshipStore.getState();
        useSpaceshipStore.setState({
          thrustMagnitude: 100,
          thrust: [1, s.thrust[1], s.thrust[2]],
        });
      },

      stopThrust: () => {
        const s = useSpaceshipStore.getState();
        useSpaceshipStore.setState({
          thrustMagnitude: 0,
          thrust: [0, s.thrust[1], s.thrust[2]],
        });
      },

      fastForward: () => {
        const s = useSpaceshipStore.getState();
        const rendezvousTime = s.navigationPlan?.rendezvous?.rendezvousTime;
        if (!rendezvousTime) return;
        s.timeJump(Math.min(rendezvousTime - 1000, s.simulatedTime + 30 * 86400 * 1000));
        useExploreStore.getState().setTimeScale(100000);
      },

      checkNavigation: () => {
        const before = useSpaceshipStore.getState();
        const result = { 
          beforeRendezvousTime: before.navigationPlan?.rendezvous?.rendezvousTime,
        };
        useSpaceshipStore.getState().maybeReplanRendezvous();
        const after = useSpaceshipStore.getState();
        return {
          ...result,
          afterRendezvousTime: after.navigationPlan?.rendezvous?.rendezvousTime,
          rendezvous: after.navigationPlan?.rendezvous ?? null,
        };
      },

      jumpToTime: (targetTime: number) => {
        const s = useSpaceshipStore.getState();
        if (!s.orbitingBodyId) return;
        useSpaceshipStore.getState().timeJump(targetTime);
      },

      setOrbitingBody: (id: string) => {
        useSpaceshipStore.getState().setOrbitingBodyId(id);
      },

      setDirection: (d: [number, number, number]) => {
        useSpaceshipStore.getState().setDirection(d);
        useSpaceshipStore.getState().setAttitudeMode('inertial');
      },

      setPosition: (p: [number, number, number]) => {
        useSpaceshipStore.getState().updatePhysics(p, useSpaceshipStore.getState().velocity);
      },

      setVelocity: (v: [number, number, number]) => {
        useSpaceshipStore.getState().updatePhysics(useSpaceshipStore.getState().position, v);
      },

      setPositionVelocity: (p: [number, number, number], v: [number, number, number]) => {
        useSpaceshipStore.getState().updatePhysics(p, v);
      },

      teleportToMars: () => {
        const s = useSpaceshipStore.getState();
        const jd = julianDate(s.simulatedTime);
        const marsState = computeBodyState('mars', jd);
        if (!marsState) return false;
        // Place ship slightly offset from Mars center (avoid collision)
        const offsetAU = 0.0001; // ~15000 km, safe distance
        const marsV = Math.sqrt(marsState.velocity[0]**2 + marsState.velocity[1]**2 + marsState.velocity[2]**2);
        const vDir = [marsState.velocity[0]/marsV, marsState.velocity[1]/marsV, marsState.velocity[2]/marsV];
        // Place ship ahead of Mars in its orbit
        const pos: [number, number, number] = [
          marsState.position[0] + vDir[0] * offsetAU,
          marsState.position[1] + vDir[1] * offsetAU,
          marsState.position[2] + vDir[2] * offsetAU,
        ];
        const scale = 0.97;
        const newVel: [number, number, number] = [marsState.velocity[0]*scale, marsState.velocity[1]*scale, marsState.velocity[2]*scale];
        useSpaceshipStore.setState({
          position: pos,
          velocity: newVel,
          orbitingBodyId: 'sun',
          exploded: false,
          isRunning: true,
          explosionPhase: 'none',
          crashBodyId: null,
          thrust: [0, 0, 0],
          thrustMagnitude: 0,
        });
        return true;
      },

      setTimeScale: (scale: number) => {
        useExploreStore.getState().setTimeScale(scale);
      },

      getStatus: () => {
        const s = useSpaceshipStore.getState();
        return {
          targetBodyId: s.targetBodyId,
          orbitingBodyId: s.orbitingBodyId,
          nearestBodyId: s.nearestBodyId,
          attitudeMode: s.attitudeMode,
          thrustMagnitude: s.thrustMagnitude,
          position: s.position,
          velocity: s.velocity,
          exploded: s.exploded,
          simulatedTime: s.simulatedTime,
          navigationPlan: s.navigationPlan ? {
            destinationId: s.navigationPlan.destinationId,
            rendezvous: s.navigationPlan.rendezvous,
          } : null,
        };
      },
    };

  }, []);

  return (
    <div className="explore-page">
      <div className="explore-canvas-area">
        <ExploreCanvas />
      </div>
      <HUD />
      <Dashboard />
      <CrashOverlay />
    </div>
  );
}

export default ExplorePage;
