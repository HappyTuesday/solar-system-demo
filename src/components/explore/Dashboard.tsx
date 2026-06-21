import { useCallback, useRef } from 'react';
import { useSpaceshipStore } from '../../stores/spaceshipStore';
import { REAL_DATA, MU_SUN } from '../../engine/constants';
import { julianDate, solveKepler, trueAnomaly, stateVectors, orbitalPeriod, meanAnomalyAtTime } from '../../engine/orbital';
import MiniMap from './MiniMap';
import './Dashboard.css';

const SCALE = 1 / 1.496e11;
const AU_TO_KM = 1.496e8;
const ORBIT_THRESHOLD_AU = 0.005;

const ALL_IDS = ['sun', 'mercury', 'venus', 'earth', 'mars', 'jupiter', 'saturn', 'uranus', 'neptune'];

function computeBodyStateFull(templateId: string, jd: number): { position: [number, number, number]; velocity: [number, number, number] } | null {
  const data = REAL_DATA[templateId];
  if (!data || !data.semiMajorAxis || !data.orbital) return null;
  const o = data.orbital;
  const period = orbitalPeriod(data.semiMajorAxis, MU_SUN);
  const M = meanAnomalyAtTime(o.meanAnomalyAtEpoch, period, o.epoch, jd);
  const Mmod = ((M % (2 * Math.PI)) + 2 * Math.PI) % (2 * Math.PI);
  const E = solveKepler(Mmod, o.eccentricity);
  const nu = trueAnomaly(E, o.eccentricity);
  const sv = stateVectors(data.semiMajorAxis, o.eccentricity, o.inclination, o.longitudeAscendingNode, o.argumentOfPeriapsis, nu, MU_SUN);
  return {
    position: [sv.position[0] * SCALE, sv.position[1] * SCALE, sv.position[2] * SCALE],
    velocity: [sv.velocity[0] * SCALE, sv.velocity[1] * SCALE, sv.velocity[2] * SCALE],
  };
}

function Dashboard() {
  const position = useSpaceshipStore(s => s.position);
  const velocity = useSpaceshipStore(s => s.velocity);
  const thrustMagnitude = useSpaceshipStore(s => s.thrustMagnitude);
  const exploded = useSpaceshipStore(s => s.exploded);
  const simulatedTime = useSpaceshipStore(s => s.simulatedTime);
  const setForwardThrust = useSpaceshipStore(s => s.setForwardThrust);
  const setLateralThrust = useSpaceshipStore(s => s.setLateralThrust);
  const setVerticalThrust = useSpaceshipStore(s => s.setVerticalThrust);
  const setThrustMagnitude = useSpaceshipStore(s => s.setThrustMagnitude);
  const isRunning = useSpaceshipStore(s => s.isRunning);
  const toggleRunning = useSpaceshipStore(s => s.toggleRunning);
  const intervalRef = useRef<ReturnType<typeof setInterval> | null>(null);
  const reset = useSpaceshipStore(s => s.reset);

  const speedMs = Math.sqrt(
    velocity[0] ** 2 + velocity[1] ** 2 + velocity[2] ** 2
  ) * AU_TO_KM;

  const jd = julianDate(simulatedTime);

  let nearestBodyId = '';
  let nearestBodyName = '';
  let nearestDistAU = Infinity;
  let nearestBodyPos: [number, number, number] = [0, 0, 0];
  let nearestBodyVel: [number, number, number] = [0, 0, 0];
  let nearestBodyRadiusKm = 0;

  for (const id of ALL_IDS) {
    if (id === 'sun') {
      const dx2 = position[0] ** 2 + position[1] ** 2 + position[2] ** 2;
      const dist = Math.sqrt(dx2);
      if (dist < nearestDistAU) { nearestDistAU = dist; nearestBodyId = id; nearestBodyName = '太阳'; nearestBodyPos = [0, 0, 0]; nearestBodyVel = [0, 0, 0]; nearestBodyRadiusKm = REAL_DATA.sun.radius / 1000; }
    } else {
      const state = computeBodyStateFull(id, jd);
      if (!state) continue;
      const dx = state.position[0] - position[0];
      const dy = state.position[1] - position[1];
      const dz = state.position[2] - position[2];
      const dist = Math.sqrt(dx * dx + dy * dy + dz * dz);
      if (dist < nearestDistAU) {
        nearestDistAU = dist; nearestBodyId = id; nearestBodyName = REAL_DATA[id].name;
        nearestBodyPos = state.position; nearestBodyVel = state.velocity;
        nearestBodyRadiusKm = REAL_DATA[id].radius / 1000;
      }
    }
  }

  const nearestDistKm = nearestDistAU * AU_TO_KM;
  const isOrbiting = nearestDistAU < ORBIT_THRESHOLD_AU && nearestDistAU > 1e-12;

  const relVelX = velocity[0] - nearestBodyVel[0];
  const relVelY = velocity[1] - nearestBodyVel[1];
  const relVelZ = velocity[2] - nearestBodyVel[2];
  const relSpeedAU = Math.sqrt(relVelX ** 2 + relVelY ** 2 + relVelZ ** 2);
  const relSpeedKms = relSpeedAU * AU_TO_KM;

  const headingAngleDeg = nearestDistAU > 1e-12 ? (() => {
    const rx = position[0] - nearestBodyPos[0];
    const ry = position[1] - nearestBodyPos[1];
    const rz = position[2] - nearestBodyPos[2];
    const rLen = Math.sqrt(rx * rx + ry * ry + rz * rz);
    if (rLen < 1e-15 || relSpeedAU < 1e-15) return 0;
    const radialDotRel = Math.abs(rx * relVelX + ry * relVelY + rz * relVelZ) / (rLen * relSpeedAU);
    return Math.asin(Math.min(1, radialDotRel)) * 180 / Math.PI;
  })() : 0;

  const altitudeKm = nearestDistKm - nearestBodyRadiusKm;
  const angularVelDegS = nearestDistAU > 1e-12 ? (relSpeedAU / nearestDistAU) * 180 / Math.PI : 0;
  const orbitalPeriodMin = relSpeedKms > 1e-6 ? (2 * Math.PI * nearestDistKm / relSpeedKms) / 60 : 0;

  const startHold = useCallback((action: () => void) => {
    action();
    if (intervalRef.current) clearInterval(intervalRef.current);
    intervalRef.current = setInterval(action, 100);
  }, []);

  const stopHold = useCallback(() => {
    if (intervalRef.current) {
      clearInterval(intervalRef.current);
      intervalRef.current = null;
    }
  }, []);

  return (
    <div className="dashboard-container">
      <div className="dashboard-tab">飞船仪表</div>
      <div className="dashboard-panel">

        {exploded ? (
          <div className="dashboard-exploded">
            飞行终止
            {' '}
            <button
              className="dashboard-ctrl-btn"
              onClick={reset}
            >
              重新出发
            </button>
          </div>
        ) : (
          <div className="dashboard-panel-body">
            <div className="dashboard-column">
              <div className="dashboard-column-title">基本参数</div>
              <div className="dashboard-position-row">
                <div className="dashboard-readout">
                  <div className="dashboard-readout-label">X</div>
                  <div className="dashboard-readout-value" style={{ color: '#00ff88' }}>
                    {position[0].toFixed(4)}
                  </div>
                </div>
                <div className="dashboard-readout">
                  <div className="dashboard-readout-label">Y</div>
                  <div className="dashboard-readout-value" style={{ color: '#00ff88' }}>
                    {position[1].toFixed(4)}
                  </div>
                </div>
                <div className="dashboard-readout">
                  <div className="dashboard-readout-label">Z</div>
                  <div className="dashboard-readout-value" style={{ color: '#00ff88' }}>
                    {position[2].toFixed(4)}
                  </div>
                </div>
              </div>
              <div className="dashboard-stat-row">
                <div className="dashboard-stat">
                  <div className="dashboard-stat-label">飞行速度</div>
                  <div className="dashboard-stat-value" style={{ color: '#ffff00' }}>
                    {speedMs.toFixed(1)} <span style={{ fontSize: 8, color: '#556677' }}>km/s</span>
                  </div>
                </div>
                <div className="dashboard-stat">
                  <div className="dashboard-stat-label">推力</div>
                  <div className="dashboard-stat-value" style={{ color: '#00b8ff' }}>
                    {thrustMagnitude} <span style={{ fontSize: 8, color: '#556677' }}>%</span>
                  </div>
                </div>
              </div>
              <div className="dashboard-stat-row">
                <div className="dashboard-stat" style={{ background: 'rgba(204,170,136,0.06)', borderColor: 'rgba(204,170,136,0.15)' }}>
                  <div className="dashboard-stat-label">距{nearestBodyName}</div>
                  <div className="dashboard-stat-value" style={{ color: '#ccaa88', fontSize: 11 }}>
                    {nearestDistAU < 0.1
                      ? `${nearestDistKm.toFixed(0)} km`
                      : `${nearestDistAU.toFixed(3)} AU`}
                  </div>
                </div>
              </div>
            </div>

            <div className="dashboard-column">
              <div className="dashboard-column-title">绕飞参数{isOrbiting ? ` · ${nearestBodyName}` : ''}</div>
              {isOrbiting ? (
                <div className="dashboard-orbital-grid">
                  <div className="dashboard-stat">
                    <div className="dashboard-stat-label">轨道速度</div>
                    <div className="dashboard-stat-value" style={{ color: '#00ff88', fontSize: 11 }}>
                      {relSpeedKms.toFixed(2)} <span style={{ fontSize: 7, color: '#445566' }}>km/s</span>
                    </div>
                  </div>
                  <div className="dashboard-stat">
                    <div className="dashboard-stat-label">轨道高度</div>
                    <div className="dashboard-stat-value" style={{ color: '#88ccff', fontSize: 11 }}>
                      {altitudeKm.toFixed(0)} <span style={{ fontSize: 7, color: '#445566' }}>km</span>
                    </div>
                  </div>
                  <div className="dashboard-stat">
                    <div className="dashboard-stat-label">角速度</div>
                    <div className="dashboard-stat-value" style={{ color: '#ffcc00', fontSize: 11 }}>
                      {angularVelDegS.toFixed(4)} <span style={{ fontSize: 7, color: '#445566' }}>°/s</span>
                    </div>
                  </div>
                  <div className="dashboard-stat">
                    <div className="dashboard-stat-label">轨道周期</div>
                    <div className="dashboard-stat-value" style={{ color: '#ddaa88', fontSize: 11 }}>
                      {orbitalPeriodMin.toFixed(1)} <span style={{ fontSize: 7, color: '#445566' }}>min</span>
                    </div>
                  </div>
                  <div className="dashboard-stat">
                    <div className="dashboard-stat-label">船身·切线夹角</div>
                    <div className="dashboard-stat-value" style={{ color: headingAngleDeg > 5 ? '#ff8855' : '#aaddff', fontSize: 11 }}>
                      {headingAngleDeg.toFixed(1)}°
                    </div>
                  </div>
                </div>
              ) : (
                <div style={{ color: '#334455', fontSize: 10, padding: '4px 0' }}>远离天体</div>
              )}
            </div>

            <div className="dashboard-column">
              <div className="dashboard-column-title">飞行控制</div>
              <div>
                <div className="dashboard-controls-grid">
                  <button
                    className="dashboard-ctrl-btn"
                    onMouseDown={() => startHold(() => setVerticalThrust(1))}
                    onMouseUp={() => { stopHold(); setVerticalThrust(0); }}
                    onMouseLeave={stopHold}
                  >
                    ↑ 抬头
                  </button>
                  <button
                    className="dashboard-ctrl-btn"
                    onMouseDown={() => startHold(() => setVerticalThrust(-1))}
                    onMouseUp={() => { stopHold(); setVerticalThrust(0); }}
                    onMouseLeave={stopHold}
                  >
                    ↓ 俯冲
                  </button>
                  <button
                    className="dashboard-ctrl-btn"
                    onMouseDown={() => startHold(() => setLateralThrust(1))}
                    onMouseUp={() => { stopHold(); setLateralThrust(0); }}
                    onMouseLeave={stopHold}
                  >
                    ← 左转
                  </button>
                  <button
                    className="dashboard-ctrl-btn"
                    onMouseDown={() => startHold(() => setLateralThrust(-1))}
                    onMouseUp={() => { stopHold(); setLateralThrust(0); }}
                    onMouseLeave={stopHold}
                  >
                    → 右转
                  </button>
                </div>
                <div className="dashboard-thrust-row">
                  <button
                    className="dashboard-accel-btn"
                    onClick={() => {
                      setForwardThrust(1);
                      setThrustMagnitude(Math.min(100, thrustMagnitude + 10));
                    }}
                  >
                    + 加速
                  </button>
                  <button
                    className="dashboard-decel-btn"
                    onClick={() => {
                      const newMag = Math.max(0, thrustMagnitude - 10);
                      setThrustMagnitude(newMag);
                      setForwardThrust(newMag > 0 ? 1 : 0);
                    }}
                  >
                    − 减速
                  </button>
                </div>
              </div>
              <button className="dashboard-pause-btn" onClick={toggleRunning}>
                {isRunning ? '⏸ 暂停' : '▶ 继续'}
              </button>
            </div>

            <div className="dashboard-column">
              <div className="dashboard-column-title">导航图</div>
              <div className="dashboard-minimap-wrap">
                <MiniMap />
              </div>
            </div>
          </div>
        )}
      </div>
    </div>
  );
}

export default Dashboard;
