import { useEffect } from 'react';
import ExploreCanvas from '../components/explore/ExploreCanvas';
import Dashboard from '../components/explore/Dashboard';
import HUD from '../components/explore/HUD';
import PhaseGuide from '../components/explore/PhaseGuide';
import FlightParametersPanel from '../components/explore/FlightParametersPanel';
import CrashOverlay from '../components/explore/CrashOverlay';
import { useSpaceshipStore } from '../stores/spaceshipStore';
import { useExploreStore } from '../stores/exploreStore';
import { computeBodyState, computeLiveNavigationGuidance, getPhaseAngleDeg } from '../engine/navigation';
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
      setAttitudeMode: (mode: 'inertial' | 'prograde' | 'nadir' | 'target') => void;
      getStatus: () => Record<string, unknown>;
      checkNavigation: () => Record<string, unknown>;
      preventReplan: () => void;
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
      autoNavigate: () => Promise<{
        success: boolean;
        message: string;
        steps: string[];
      }>;
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
        if (!s.navigationPlan) return;
        const phase = s.navigationPlan.phases[s.activePhaseIndex];
        if (!phase?.name?.startsWith('等待')) return;
        const remainingDays = phase.expectedWaitDays;
        if (remainingDays && remainingDays > 0) {
          // Jump to ~98% of the way
          const jumpDays = Math.max(0, remainingDays * 0.98);
          s.timeJump(s.simulatedTime + jumpDays * 86400 * 1000);
          // Speed up to catch the remaining window
          useExploreStore.getState().setTimeScale(100000);
        }
      },

      checkNavigation: () => {
        const before = useSpaceshipStore.getState();
        const result = { 
          beforePhase: before.activePhaseIndex,
        };
        useSpaceshipStore.getState().checkNavigationalDeviation();
        const after = useSpaceshipStore.getState();
        const phase = after.navigationPlan?.phases?.[after.activePhaseIndex];
        const destinationId = after.targetBodyId ?? after.navigationPlan?.destinationId;
        const guidance = destinationId
          ? computeLiveNavigationGuidance({
              shipPosition: after.position,
              shipVelocity: after.velocity,
              shipDirection: after.direction,
              destinationId,
              simulatedTime: after.simulatedTime,
              thrustMagnitude: after.thrustMagnitude,
            })
          : null;
        return {
          ...result,
          afterPhase: after.activePhaseIndex,
          currentPhase: phase?.name,
          operation: guidance?.operation,
          title: guidance?.title,
          actionText: guidance?.actionText,
          completed: guidance?.completed,
          progress: guidance?.progress,
          metrics: guidance?.metrics,
          estimatedRemaining: guidance?.estimatedRemaining,
          phaseAngleDeg: getPhaseAngleDeg(after.position, after.simulatedTime),
        };
      },

      preventReplan: () => {
        const s = useSpaceshipStore.getState();
        // Set lastReplanTime far in the future to prevent any replan
        useSpaceshipStore.setState({ 
          lastReplanTime: s.simulatedTime + 86400 * 365 * 1000, // 1 year in ms
          deviationWarning: null,
        });
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
          activePhaseIndex: s.activePhaseIndex,
          orbitingBodyId: s.orbitingBodyId,
          nearestBodyId: s.nearestBodyId,
          attitudeMode: s.attitudeMode,
          thrustMagnitude: s.thrustMagnitude,
          position: s.position,
          velocity: s.velocity,
          deviationWarning: s.deviationWarning,
          exploded: s.exploded,
          simulatedTime: s.simulatedTime,
          navigationPlan: s.navigationPlan ? {
            destinationId: s.navigationPlan.destinationId,
            phases: s.navigationPlan.phases.map((p) => ({
              name: p.name,
              index: p.index,
              thrustDirection: p.thrustDirection,
              thrustMagnitude: p.thrustMagnitude,
              deltaV: p.deltaV,
              expectedWaitDays: p.expectedWaitDays,
              targetOrbit: p.targetOrbit,
            })),
          } : null,
        };
      },

      autoNavigate: async () => {
        const steps: string[] = [];
        const log = (msg: string) => { steps.push(msg); console.log('[autoNav]', msg); };

        try {
          // Step 1: Select Mars
          log('Setting target to mars...');
          useSpaceshipStore.getState().setTargetBody('mars');
          await new Promise(r => setTimeout(r, 300));

          let status = window.__debug.getStatus();
          log(`Status after select: phase=${status.activePhaseIndex}, plan=${!!status.navigationPlan}`);

          if (!status.navigationPlan || (status.navigationPlan as { phases: unknown[] }).phases.length === 0) {
            log('ERROR: No navigation plan generated');
            return { success: false, message: 'No navigation plan', steps };
          }

          ((status.navigationPlan as { phases: { name: string; index: number }[] }).phases).forEach((p: { name: string; index: number }) => {
            log(`Phase ${p.index}: ${p.name}`);
          });

          // Step 2: Wait for launch window using timeJump
          let waitIterations = 0;
          const maxWaitIterations = 100;

          while (waitIterations < maxWaitIterations) {
            status = window.__debug.getStatus();
            if (status.exploded) {
              log('ERROR: Spaceship exploded!');
              return { success: false, message: 'Spaceship exploded', steps };
            }

            const phases = (status.navigationPlan as { phases: { name: string }[] } | null)?.phases;
            const phase = phases?.[status.activePhaseIndex as number];
            if (!phase) {
              log('ERROR: No active phase');
              return { success: false, message: 'No active phase', steps };
            }

            if (phase.name !== '等待发射窗口') {
              log('Past waiting phase, proceeding');
              break;
            }

            // Try fast-forwarding to skip the wait phase
            log(`Wait iter ${waitIterations}: phase=${phase.name}`);
            useExploreStore.getState().setTimeScale(100000);
            useSpaceshipStore.getState().checkNavigationalDeviation();
            await new Promise(r => setTimeout(r, 2000));
            status = window.__debug.getStatus();
            const newPhases = (status.navigationPlan as { phases: { name: string }[] } | null)?.phases;
            if (newPhases?.[status.activePhaseIndex as number]?.name !== '等待发射窗口') {
              log('Window reached via simulation!');
              break;
            }

            // Try time jump to skip ahead
            const daysToSkip = 30;
            log(`Jumping ${daysToSkip} days ahead...`);
            window.__debug.timeJump(daysToSkip * 86400 * 1000);
            await new Promise(r => setTimeout(r, 200));

            waitIterations++;
          }

          if (waitIterations >= maxWaitIterations) {
            log('ERROR: Maximum wait iterations exceeded');
            return { success: false, message: 'Max wait iterations exceeded', steps };
          }

          // Step 3: Burn phase
          status = window.__debug.getStatus();
          const burnPhase = ((status.navigationPlan as { phases: { name: string }[] } | null)?.phases)?.[status.activePhaseIndex as number];
          if (!burnPhase) return { success: false, message: 'No burn phase', steps };

          log(`Starting burn: ${burnPhase.name}`);
          useSpaceshipStore.getState().setAttitudeMode('prograde');
          useExploreStore.getState().setTimeScale(10);       // Low scale during burn to prevent overshoot
          useSpaceshipStore.getState().setThrustMagnitude(100);
          useSpaceshipStore.getState().setForwardThrust(1);
          log('Burn: 100MN forward, timeScale=10');

          let burnIterations = 0;
          const maxBurn = 300;
          while (burnIterations < maxBurn) {
            await new Promise(r => setTimeout(r, 1000));
            status = window.__debug.getStatus();
            if (status.exploded) {
              useSpaceshipStore.getState().setThrustMagnitude(0);
              return { success: false, message: 'Spaceship exploded', steps };
            }
            const cp = ((status.navigationPlan as { phases: { name: string }[] } | null)?.phases)?.[status.activePhaseIndex as number];
            if (cp && cp.name !== burnPhase.name) {
              log(`Burn complete, now: ${cp.name}`);
              break;
            }
            burnIterations++;
            if (burnIterations % 5 === 0) log(`Burn progress: phase=${status.activePhaseIndex}`);
          }

          // Step 4: Coast
          useSpaceshipStore.getState().setThrustMagnitude(0);
          useSpaceshipStore.getState().setForwardThrust(0);
          status = window.__debug.getStatus();
          log(`Coast starting, phase=${status.activePhaseIndex}`);
          useExploreStore.getState().setTimeScale(100000);

          let coastIterations = 0;
          const maxCoast = 300;
          while (coastIterations < maxCoast) {
            await new Promise(r => setTimeout(r, 1000));
            status = window.__debug.getStatus();
            if (status.exploded) return { success: false, message: 'Exploded during coast', steps };
            const cp = ((status.navigationPlan as { phases: { name: string }[] } | null)?.phases)?.[status.activePhaseIndex as number];
            const pn = cp?.name || 'unknown';
            if (pn === '目标捕获制动' || pn === '目标捕获加速' || pn === '绕飞圆化') {
              log(`Coast done, now: ${pn}`);
              break;
            }
            coastIterations++;
            if (coastIterations % 10 === 0) log(`Coast: phase=${status.activePhaseIndex} (${pn})`);
          }

          // Step 5: Capture burn
          status = window.__debug.getStatus();
          const capturePhase = ((status.navigationPlan as { phases: { name: string }[] } | null)?.phases)?.[status.activePhaseIndex as number];
          log(`Capture: ${capturePhase?.name}`);
          useSpaceshipStore.getState().setAttitudeMode('prograde');
          useExploreStore.getState().setTimeScale(100000);
          useSpaceshipStore.getState().setThrustMagnitude(100);
          useSpaceshipStore.getState().setForwardThrust(1);
          log('Capture: 100MN forward, timeScale=100000');

          let capIter = 0;
          const maxCap = 300;
          while (capIter < maxCap) {
            await new Promise(r => setTimeout(r, 1000));
            status = window.__debug.getStatus();
            if (status.exploded) {
              useSpaceshipStore.getState().setThrustMagnitude(0);
              return { success: false, message: 'Exploded during capture', steps };
            }
            const cp = ((status.navigationPlan as { phases: { name: string }[] } | null)?.phases)?.[status.activePhaseIndex as number];
            if (cp && cp.name !== capturePhase?.name) {
              log(`Capture done, now: ${cp.name}`);
              break;
            }
            capIter++;
          }

          // Step 6: Circularization
          useSpaceshipStore.getState().setThrustMagnitude(0);
          useSpaceshipStore.getState().setForwardThrust(0);
          status = window.__debug.getStatus();
          const circPhase = ((status.navigationPlan as { phases: { name: string }[] } | null)?.phases)?.[status.activePhaseIndex as number];
          log(`Current: ${circPhase?.name}`);

          if (circPhase?.name === '绕飞圆化') {
            useSpaceshipStore.getState().setAttitudeMode('prograde');
            useSpaceshipStore.getState().setThrustMagnitude(50);
            useSpaceshipStore.getState().setForwardThrust(1);
            useExploreStore.getState().setTimeScale(100000);
            log('Circ: 50MN forward, timeScale=100000');

            let circIter = 0;
            const maxCirc = 300;
            while (circIter < maxCirc) {
              await new Promise(r => setTimeout(r, 1000));
              status = window.__debug.getStatus();
              if (status.exploded) {
                useSpaceshipStore.getState().setThrustMagnitude(0);
                return { success: false, message: 'Exploded during circ', steps };
              }
              const phases = (status.navigationPlan as { phases: unknown[] } | null)?.phases;
              if ((status.activePhaseIndex as number) >= (phases?.length || 0)) {
                log('All phases complete!');
                break;
              }
              circIter++;
              if (circIter % 5 === 0) log(`Circ: phase=${status.activePhaseIndex}, orb=${status.orbitingBodyId}`);
            }
          }

          // Final
          useSpaceshipStore.getState().setThrustMagnitude(0);
          useSpaceshipStore.getState().setForwardThrust(0);
          useExploreStore.getState().setTimeScale(1);
          status = window.__debug.getStatus();

          const pos = status.position as number[];
          log(`FINAL: orb=${status.orbitingBodyId}, near=${status.nearestBodyId}, pos=[${pos.map((v: number) => v.toFixed(4))}]`);

          const success = status.orbitingBodyId === 'mars' || status.nearestBodyId === 'mars';
          return { success, message: success ? 'Successfully reached Mars!' : `At ${status.nearestBodyId}, orb ${status.orbitingBodyId}`, steps };
        } catch (e) {
          log(`ERROR: ${String(e)}`);
          return { success: false, message: String(e), steps };
        }
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
      <FlightParametersPanel />
      <PhaseGuide />
      <CrashOverlay />
    </div>
  );
}

export default ExplorePage;
