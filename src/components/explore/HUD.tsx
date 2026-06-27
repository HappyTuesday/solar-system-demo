import { useSpaceshipStore } from '../../stores/spaceshipStore';
import { REAL_DATA } from '../../engine/constants';
import { julianDate, solveKepler, trueAnomaly, stateVectors, orbitalPeriod, meanAnomalyAtTime } from '../../engine/orbital';
import './HUD.css';

const SCALE = 1 / 1.496e11;
const AU_TO_KM = 1.496e8;
const MU_SUN_VALUE = 1.32712440018e20;
const ORBIT_THRESHOLD_AU = 0.005;

function computeBodyStateFull(templateId: string, jd: number) {
  const data = REAL_DATA[templateId];
  if (!data || !data.semiMajorAxis || !data.orbital) return null;
  const o = data.orbital;
  const period = orbitalPeriod(data.semiMajorAxis, MU_SUN_VALUE);
  const M = meanAnomalyAtTime(o.meanAnomalyAtEpoch, period, o.epoch, jd);
  const Mmod = ((M % (2 * Math.PI)) + 2 * Math.PI) % (2 * Math.PI);
  const E = solveKepler(Mmod, o.eccentricity);
  const nu = trueAnomaly(E, o.eccentricity);
  const sv = stateVectors(data.semiMajorAxis, o.eccentricity, o.inclination, o.longitudeAscendingNode, o.argumentOfPeriapsis, nu, MU_SUN_VALUE);
  return {
    position: [sv.position[0] * SCALE, sv.position[1] * SCALE, sv.position[2] * SCALE] as [number, number, number],
    velocity: [sv.velocity[0] * SCALE, sv.velocity[1] * SCALE, sv.velocity[2] * SCALE] as [number, number, number],
  };
}

export default function HUD() {
  const position = useSpaceshipStore(s => s.position);
  const velocity = useSpaceshipStore(s => s.velocity);
  const direction = useSpaceshipStore(s => s.direction);
  const thrustMagnitude = useSpaceshipStore(s => s.thrustMagnitude);
  const exploded = useSpaceshipStore(s => s.exploded);
  const simulatedTime = useSpaceshipStore(s => s.simulatedTime);
  const targetBodyId = useSpaceshipStore(s => s.targetBodyId);
  const nearestBodyId = useSpaceshipStore(s => s.nearestBodyId);
  const orbitingBodyId = useSpaceshipStore(s => s.orbitingBodyId);

  if (exploded) return null;

  const speedMs = Math.sqrt(velocity[0] ** 2 + velocity[1] ** 2 + velocity[2] ** 2) * AU_TO_KM;
  const effectiveSpeedKms = (velocity[0] * direction[0] + velocity[1] * direction[1] + velocity[2] * direction[2]) * AU_TO_KM;
  const jd = julianDate(simulatedTime);

  // Use nearest body from store (updated each frame in ExploreCanvas)
  const nearestBodyName = nearestBodyId ? (REAL_DATA[nearestBodyId]?.name || '') : '';
  const nearestBodyRadiusKm = nearestBodyId ? (REAL_DATA[nearestBodyId]?.radius ?? 0) / 1000 : 0;

  let nearestDistAU = Infinity;
  let nearestBodyVel: [number, number, number] = [0, 0, 0];

  if (nearestBodyId) {
    if (nearestBodyId === 'sun') {
      const dx2 = position[0] ** 2 + position[1] ** 2 + position[2] ** 2;
      nearestDistAU = Math.sqrt(dx2);
      nearestBodyVel = [0, 0, 0];
    } else {
      const state = computeBodyStateFull(nearestBodyId, jd);
      if (state) {
        const dx = state.position[0] - position[0];
        const dy = state.position[1] - position[1];
        const dz = state.position[2] - position[2];
        nearestDistAU = Math.sqrt(dx * dx + dy * dy + dz * dz);
        nearestBodyVel = state.velocity;
      }
    }
  }

  const nearestDistKm = nearestDistAU * AU_TO_KM;
  const altitudeKm = nearestDistKm - nearestBodyRadiusKm;
  const isOrbiting = nearestDistAU < ORBIT_THRESHOLD_AU && nearestDistAU > 1e-12;

  // Orbital params (only when orbiting)
  let relSpeedKms = 0;
  let angularVelDegS = 0;
  let orbitalPeriodMin = 0;
  let headingAngleDeg = 0;

  if (isOrbiting) {
    const relVelX = velocity[0] - nearestBodyVel[0];
    const relVelY = velocity[1] - nearestBodyVel[1];
    const relVelZ = velocity[2] - nearestBodyVel[2];
    const relSpeedAU = Math.sqrt(relVelX ** 2 + relVelY ** 2 + relVelZ ** 2);
    relSpeedKms = relSpeedAU * AU_TO_KM;
    angularVelDegS = nearestDistAU > 1e-12 ? (relSpeedAU / nearestDistAU) * 180 / Math.PI : 0;
    orbitalPeriodMin = relSpeedKms > 1e-6 ? (2 * Math.PI * nearestDistKm / relSpeedKms) / 60 : 0;

    const velLen = Math.sqrt(relVelX ** 2 + relVelY ** 2 + relVelZ ** 2);
    const dirLen = Math.sqrt(direction[0] ** 2 + direction[1] ** 2 + direction[2] ** 2);
    if (velLen > 1e-15 && dirLen > 1e-15) {
      const dot = (direction[0] * relVelX + direction[1] * relVelY + direction[2] * relVelZ) / (dirLen * velLen);
      headingAngleDeg = Math.acos(Math.max(-1, Math.min(1, dot))) * 180 / Math.PI;
    }
  }

  // Distance to destination
  let targetDistAU = 0;
  let targetDistKm = 0;
  if (targetBodyId) {
    if (targetBodyId === 'sun') {
      const dx2 = position[0] ** 2 + position[1] ** 2 + position[2] ** 2;
      targetDistAU = Math.sqrt(dx2);
    } else {
      const ts = computeBodyStateFull(targetBodyId, jd);
      if (ts) {
        const dx = ts.position[0] - position[0];
        const dy = ts.position[1] - position[1];
        const dz = ts.position[2] - position[2];
        targetDistAU = Math.sqrt(dx * dx + dy * dy + dz * dz);
      }
    }
    targetDistKm = targetDistAU * AU_TO_KM;
  }

  const eclipticHeightKm = Math.abs(position[2]) * AU_TO_KM;

  return (
    <div className="hud-container">
      <div className="hud-row">
        {isOrbiting && (
          <div className="hud-row-orbital">
            绕飞 · <span className="hud-value-blue">{orbitingBodyId ? (REAL_DATA[orbitingBodyId]?.name || '') : nearestBodyName}</span>
            <span className="hud-label">&nbsp;&nbsp;速度</span> <span className="hud-value-green">{relSpeedKms.toFixed(2)} km/s</span>
            <span className="hud-label">&nbsp;&nbsp;高度</span> <span className="hud-value-blue">{altitudeKm.toFixed(0)} km</span>
            <span className="hud-label">&nbsp;&nbsp;角速度</span> <span className="hud-value-yellow">{angularVelDegS.toFixed(4)} °/s</span>
            <span className="hud-label">&nbsp;&nbsp;周期</span> <span className="hud-value-orange">{orbitalPeriodMin.toFixed(1)} min</span>
            <span className="hud-label">&nbsp;&nbsp;船身夹角</span> <span className="hud-value-yellow">{headingAngleDeg.toFixed(1)}°</span>
          </div>
        )}
        <div className="hud-row-basic">
          <span className="hud-label">X</span> <span className="hud-value-green">{position[0].toFixed(4)}</span>
          <span className="hud-label">&nbsp;&nbsp;Y</span> <span className="hud-value-green">{position[1].toFixed(4)}</span>
          <span className="hud-label">&nbsp;&nbsp;Z</span> <span className="hud-value-green">{position[2].toFixed(4)}</span>
          <span className="hud-label">&nbsp;&nbsp;速度</span> <span className="hud-value-yellow">{speedMs.toFixed(0)} km/s</span>
          <span className="hud-label">&nbsp;&nbsp;有效速度</span> <span className="hud-value-green">{effectiveSpeedKms.toFixed(0)} km/s</span>
          <span className="hud-label">&nbsp;&nbsp;推力</span> <span className="hud-value-cyan">{thrustMagnitude} MN</span>
          <span className="hud-label">&nbsp;&nbsp;距{nearestBodyName}</span> <span className="hud-value-brown">{nearestDistAU < 0.1 ? `${nearestDistKm.toFixed(0)} km` : `${nearestDistAU.toFixed(3)} AU`}</span>
          {targetBodyId && (
            <>
              <span className="hud-label">&nbsp;&nbsp;距{REAL_DATA[targetBodyId]?.name || ''}</span> <span className="hud-value-green">{targetDistAU < 0.1 ? `${targetDistKm.toFixed(0)} km` : `${targetDistAU.toFixed(3)} AU`}</span>
            </>
          )}
          <span className="hud-label">&nbsp;&nbsp;黄道面</span> <span className="hud-value-purple">{eclipticHeightKm.toFixed(0)} km</span>
        </div>
      </div>
    </div>
  );
}
