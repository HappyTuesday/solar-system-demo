import { useCallback, useRef, useState } from 'react';
import { useSpaceshipStore } from '../../stores/spaceshipStore';
import { REAL_DATA, MU_SUN, SPACECRAFT_CONFIG, AU_TO_M } from '../../engine/constants';
import type { AttitudeMode } from '../../types';
import { julianDate, solveKepler, trueAnomaly, stateVectors, orbitalPeriod, meanAnomalyAtTime } from '../../engine/orbital';
import MiniMap from './MiniMap';
import TargetSelectionModal from './TargetSelectionModal';
import './Dashboard.css';

const SCALE = 1 / 1.496e11;
const AU_TO_KM = 1.496e8;
const ORBIT_THRESHOLD_AU = 0.005;
const RotationRate = Math.PI / 3;
const G_EARTH = 9.81;

function thrustToG(magnitude: number): number {
  const accelAU = SPACECRAFT_CONFIG.maxThrustAU * (magnitude / 100);
  return (accelAU * AU_TO_M) / G_EARTH;
}

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
  const direction = useSpaceshipStore(s => s.direction);
  const thrustMagnitude = useSpaceshipStore(s => s.thrustMagnitude);
  const exploded = useSpaceshipStore(s => s.exploded);
  const simulatedTime = useSpaceshipStore(s => s.simulatedTime);
  const setForwardThrust = useSpaceshipStore(s => s.setForwardThrust);
  const setLateralThrust = useSpaceshipStore(s => s.setLateralThrust);
  const setVerticalThrust = useSpaceshipStore(s => s.setVerticalThrust);
  const setThrustMagnitude = useSpaceshipStore(s => s.setThrustMagnitude);
  const yaw = useSpaceshipStore(s => s.yaw);
  const pitch = useSpaceshipStore(s => s.pitch);
  const setDirection = useSpaceshipStore(s => s.setDirection);
  const intervalRef = useRef<ReturnType<typeof setInterval> | null>(null);
  const attitudeMode = useSpaceshipStore(s => s.attitudeMode);
  const setAttitudeMode = useSpaceshipStore(s => s.setAttitudeMode);
  const targetBodyId = useSpaceshipStore(s => s.targetBodyId);
  const setTargetBody = useSpaceshipStore(s => s.setTargetBody);
  const [showTargetModal, setShowTargetModal] = useState(false);

  const speedMs = Math.sqrt(
    velocity[0] ** 2 + velocity[1] ** 2 + velocity[2] ** 2
  ) * AU_TO_KM;

  const effectiveSpeedKms = (
    velocity[0] * direction[0] + velocity[1] * direction[1] + velocity[2] * direction[2]
  ) * AU_TO_KM;

  const jd = julianDate(simulatedTime);

  let targetDistKm = 0;
  let targetDistAU = 0;
  if (targetBodyId) {
    if (targetBodyId === 'sun') {
      const dx2 = position[0] ** 2 + position[1] ** 2 + position[2] ** 2;
      targetDistAU = Math.sqrt(dx2);
      targetDistKm = targetDistAU * AU_TO_KM;
    } else {
      const ts = computeBodyStateFull(targetBodyId, jd);
      if (ts) {
        const dx = ts.position[0] - position[0];
        const dy = ts.position[1] - position[1];
        const dz = ts.position[2] - position[2];
        targetDistAU = Math.sqrt(dx * dx + dy * dy + dz * dz);
        targetDistKm = targetDistAU * AU_TO_KM;
      }
    }
  }

  let nearestBodyName = '';
  let nearestBodyId = '';
  let nearestDistAU = Infinity;
  let nearestBodyVel: [number, number, number] = [0, 0, 0];
  let nearestBodyRadiusKm = 0;
  let nearestBodyPos: [number, number, number] = [0, 0, 0];

  for (const id of ALL_IDS) {
    if (id === 'sun') {
      const dx2 = position[0] ** 2 + position[1] ** 2 + position[2] ** 2;
      const dist = Math.sqrt(dx2);
      if (dist < nearestDistAU) { nearestDistAU = dist; nearestBodyId = 'sun'; nearestBodyName = '太阳'; nearestBodyVel = [0, 0, 0]; nearestBodyRadiusKm = REAL_DATA.sun.radius / 1000; nearestBodyPos = [0, 0, 0]; }
    } else {
      const state = computeBodyStateFull(id, jd);
      if (!state) continue;
      const dx = state.position[0] - position[0];
      const dy = state.position[1] - position[1];
      const dz = state.position[2] - position[2];
      const dist = Math.sqrt(dx * dx + dy * dy + dz * dz);
      if (dist < nearestDistAU) {
        nearestDistAU = dist; nearestBodyId = id; nearestBodyName = REAL_DATA[id].name;
        nearestBodyVel = state.velocity;
        nearestBodyRadiusKm = REAL_DATA[id].radius / 1000;
        nearestBodyPos = state.position;
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

  const headingAngleDeg = (() => {
    const velLen = Math.sqrt(relVelX ** 2 + relVelY ** 2 + relVelZ ** 2);
    const dirLen = Math.sqrt(direction[0] ** 2 + direction[1] ** 2 + direction[2] ** 2);
    if (velLen < 1e-15 || dirLen < 1e-15) return 0;
    const dot = (direction[0] * relVelX + direction[1] * relVelY + direction[2] * relVelZ) / (dirLen * velLen);
    return Math.acos(Math.max(-1, Math.min(1, dot))) * 180 / Math.PI;
  })();

  const altitudeKm = nearestDistKm - nearestBodyRadiusKm;
  const angularVelDegS = nearestDistAU > 1e-12 ? (relSpeedAU / nearestDistAU) * 180 / Math.PI : 0;
  const orbitalPeriodMin = relSpeedKms > 1e-6 ? (2 * Math.PI * nearestDistKm / relSpeedKms) / 60 : 0;

  const eclipticHeightKm = Math.abs(position[2]) * AU_TO_KM;
  const eclipticAngleDeg = Math.asin(Math.abs(direction[2])) * 180 / Math.PI;

  const relPosX = position[0] - nearestBodyPos[0];
  const relPosY = position[1] - nearestBodyPos[1];
  const relPosZ = position[2] - nearestBodyPos[2];

  const orbitNormX = relPosY * relVelZ - relPosZ * relVelY;
  const orbitNormY = relPosZ * relVelX - relPosX * relVelZ;
  const orbitNormZ = relPosX * relVelY - relPosY * relVelX;
  const orbitNormMag = Math.sqrt(orbitNormX ** 2 + orbitNormY ** 2 + orbitNormZ ** 2);

  const axialTilt = REAL_DATA[nearestBodyId]?.orbital?.axialTilt ?? 0;
  const rotAxisX = Math.sin(axialTilt);
  const rotAxisY = 0;
  const rotAxisZ = Math.cos(axialTilt);

  const rotAngleDeg = orbitNormMag > 1e-15
    ? Math.acos(Math.abs(orbitNormX * rotAxisX + orbitNormY * rotAxisY + orbitNormZ * rotAxisZ) / orbitNormMag) * 180 / Math.PI
    : 0;

  const rotationPeriod = REAL_DATA[nearestBodyId]?.orbital?.rotationPeriod;
  const surfaceSpeedKms = (rotationPeriod && rotationPeriod !== 0)
    ? (2 * Math.PI * nearestBodyRadiusKm) / Math.abs(rotationPeriod)
    : 0;
  const relSurfaceSpeedKms = relSpeedKms - surfaceSpeedKms;

  const revolAngleDeg = orbitNormMag > 1e-15
    ? Math.asin(Math.abs(orbitNormZ) / orbitNormMag) * 180 / Math.PI
    : 0;

  const sliderTrackRef = useRef<HTMLDivElement>(null);

  const updateThrustFromClientX = useCallback((clientX: number) => {
    const track = sliderTrackRef.current;
    if (!track) return;
    const rect = track.getBoundingClientRect();
    const x = clientX - rect.left;
    const pct = Math.max(0, Math.min(100, Math.round((x / rect.width) * 100)));
    setThrustMagnitude(pct);
    setForwardThrust(pct > 0 ? 1 : 0);
  }, [setThrustMagnitude, setForwardThrust]);

  const handleTrackMouseDown = useCallback((e: React.MouseEvent) => {
    e.preventDefault();
    updateThrustFromClientX(e.clientX);
    const onMove = (ev: MouseEvent) => { updateThrustFromClientX(ev.clientX); };
    const onUp = () => {
      document.removeEventListener('mousemove', onMove);
      document.removeEventListener('mouseup', onUp);
    };
    document.addEventListener('mousemove', onMove);
    document.addEventListener('mouseup', onUp);
  }, [updateThrustFromClientX]);

  const handleTrackTouchStart = useCallback((e: React.TouchEvent) => {
    e.preventDefault();
    const touch = e.touches[0];
    if (touch) updateThrustFromClientX(touch.clientX);
    const onMove = (ev: TouchEvent) => {
      ev.preventDefault();
      const t = ev.touches[0];
      if (t) updateThrustFromClientX(t.clientX);
    };
    const onEnd = () => {
      document.removeEventListener('touchmove', onMove);
      document.removeEventListener('touchend', onEnd);
    };
    document.addEventListener('touchmove', onMove, { passive: false });
    document.addEventListener('touchend', onEnd);
  }, [updateThrustFromClientX]);

  const handleNotchClick = useCallback((pct: number, e: React.MouseEvent) => {
    e.stopPropagation();
    setThrustMagnitude(pct);
    setForwardThrust(pct > 0 ? 1 : 0);
  }, [setThrustMagnitude, setForwardThrust]);

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

        {exploded ? null : (
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
                    {speedMs.toFixed(0)} <span style={{ fontSize: 8, color: '#556677' }}>km/s</span>
                  </div>
                </div>
                <div className="dashboard-stat">
                  <div className="dashboard-stat-label">有效速度</div>
                  <div className="dashboard-stat-value" style={{ color: effectiveSpeedKms >= 0 ? '#00ff88' : '#ff5555' }}>
                    {effectiveSpeedKms.toFixed(0)} <span style={{ fontSize: 8, color: '#556677' }}>km/s</span>
                  </div>
                </div>
              </div>
              <div className="dashboard-stat-row">
                <div className="dashboard-stat">
                  <div className="dashboard-stat-label">推力</div>
                  <div className="dashboard-stat-value" style={{ color: '#00b8ff' }}>
                    {thrustToG(thrustMagnitude).toFixed(1)} <span style={{ fontSize: 8, color: '#556677' }}>G</span>
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
                {targetBodyId && (
                  <div className="dashboard-stat" style={{ background: 'rgba(0,255,128,0.05)', borderColor: 'rgba(0,255,128,0.15)' }}>
                    <div className="dashboard-stat-label">距{REAL_DATA[targetBodyId]?.name || ''}</div>
                    <div className="dashboard-stat-value" style={{ color: '#00ff88', fontSize: 11 }}>
                      {targetDistAU < 0.1
                        ? `${targetDistKm.toFixed(0)} km`
                        : `${targetDistAU.toFixed(3)} AU`}
                    </div>
                  </div>
                )}
              </div>
              <div className="dashboard-stat-row">
                <div className="dashboard-stat" style={{ background: 'rgba(180,100,255,0.05)', borderColor: 'rgba(180,100,255,0.12)' }}>
                  <div className="dashboard-stat-label">黄道面高度</div>
                  <div className="dashboard-stat-value" style={{ color: '#cc88ff', fontSize: 11 }}>
                    {eclipticHeightKm.toFixed(0)} <span style={{ fontSize: 7, color: '#445566' }}>km</span>
                  </div>
                </div>
                <div className="dashboard-stat" style={{ background: 'rgba(180,100,255,0.05)', borderColor: 'rgba(180,100,255,0.12)' }}>
                  <div className="dashboard-stat-label">黄道面夹角</div>
                  <div className="dashboard-stat-value" style={{ color: '#cc88ff', fontSize: 11 }}>
                    {eclipticAngleDeg.toFixed(1)}°
                  </div>
                </div>
              </div>
            </div>

            <div className="dashboard-column">
              <div className="dashboard-column-title">飞行控制</div>
              <div className="dashboard-controls-wrap">
                <div className="dashboard-target-row">
                  <div className="dashboard-target-info">
                    {targetBodyId ? (
                      <>
                        <span className="dashboard-target-name">目标：{REAL_DATA[targetBodyId]?.name || targetBodyId}</span>
                        <button className="dashboard-target-ctl-btn"
                          onClick={() => setShowTargetModal(true)}>修改</button>
                        <button className="dashboard-target-ctl-btn"
                          onClick={() => setTargetBody(null)}>清除</button>
                      </>
                    ) : (
                      <button className="dashboard-target-ctl-btn dashboard-target-set-btn"
                        onClick={() => setShowTargetModal(true)}>设置目标</button>
                    )}
                  </div>
                </div>
                <div className="dashboard-thrust-row">
                  <div
                    className="thrust-slider-wrap"
                    ref={sliderTrackRef}
                    onMouseDown={handleTrackMouseDown}
                    onTouchStart={handleTrackTouchStart}
                  >
                    <div className="thrust-slider-fill" style={{ width: `${thrustMagnitude}%` }} />
                    <div className="thrust-slider-notches">
                      <span className="thrust-notch" style={{ left: '0%' }} onClick={(e) => handleNotchClick(0, e)} />
                      <span className="thrust-notch" style={{ left: '25%' }} onClick={(e) => handleNotchClick(25, e)} />
                      <span className="thrust-notch" style={{ left: '50%' }} onClick={(e) => handleNotchClick(50, e)} />
                      <span className="thrust-notch" style={{ left: '75%' }} onClick={(e) => handleNotchClick(75, e)} />
                      <span className="thrust-notch" style={{ left: '100%' }} onClick={(e) => handleNotchClick(100, e)} />
                    </div>
                    <div className="thrust-slider-labels">
                      <span style={{ left: '0%' }}>0</span>
                      <span style={{ left: '25%' }}>{thrustToG(25).toFixed(0)}</span>
                      <span style={{ left: '50%' }}>{thrustToG(50).toFixed(0)}</span>
                      <span style={{ left: '75%' }}>{thrustToG(75).toFixed(0)}</span>
                      <span style={{ left: '100%' }}>{thrustToG(100).toFixed(0)}</span>
                    </div>
                    <div className="thrust-slider-thumb" style={{ left: `${thrustMagnitude}%` }} />
                  </div>
                </div>
                <div className="dashboard-rotation-row">
                  <div className="dashboard-rotation-label">姿态 Q/E/R/F</div>
                  <div className="dashboard-rotation-btns">
                    <button className="dashboard-rot-btn"
                      onMouseDown={() => startHold(() => yaw(RotationRate * 0.1))}
                      onMouseUp={stopHold} onMouseLeave={stopHold}
                    >↺左</button>
                    <button className="dashboard-rot-btn"
                      onMouseDown={() => startHold(() => pitch(RotationRate * 0.1))}
                      onMouseUp={stopHold} onMouseLeave={stopHold}
                    >↻上</button>
                    <button className="dashboard-rot-btn"
                      onMouseDown={() => startHold(() => pitch(-RotationRate * 0.1))}
                      onMouseUp={stopHold} onMouseLeave={stopHold}
                    >↻下</button>
                    <button className="dashboard-rot-btn"
                      onMouseDown={() => startHold(() => yaw(-RotationRate * 0.1))}
                      onMouseUp={stopHold} onMouseLeave={stopHold}
                    >↺右</button>
                    <button className="dashboard-rot-btn dashboard-flip-btn"
                      onClick={() => { setDirection([-direction[0], -direction[1], -direction[2]]); setAttitudeMode('inertial' as AttitudeMode); }}
                    >⇄</button>
                  </div>
                </div>
                <div className="dashboard-mode-row">
                  <div className="dashboard-mode-group">
                    <button
                      className={`dashboard-mode-btn${attitudeMode === 'inertial' ? ' active' : ''}`}
                      onClick={() => setAttitudeMode('inertial' as AttitudeMode)}
                    >惯性保持</button>
                    {isOrbiting && (
                      <button
                        className={`dashboard-mode-btn${attitudeMode === 'prograde' ? ' active' : ''}`}
                        onClick={() => setAttitudeMode('prograde' as AttitudeMode)}
                      >顺向保持</button>
                    )}
                    {targetBodyId && (
                      <button
                        className={`dashboard-mode-btn${attitudeMode === 'target' ? ' active' : ''}`}
                        onClick={() => setAttitudeMode('target' as AttitudeMode)}
                      >指向{REAL_DATA[targetBodyId]?.name || ''}</button>
                    )}
                  </div>
                </div>
                <div className="dashboard-dpad">
                  <button
                    className="dpad-btn"
                    onMouseDown={() => startHold(() => setLateralThrust(1))}
                    onMouseUp={() => { stopHold(); setLateralThrust(0); }}
                    onMouseLeave={stopHold}
                  >◀</button>
                  <button
                    className="dpad-btn"
                    onMouseDown={() => startHold(() => setVerticalThrust(1))}
                    onMouseUp={() => { stopHold(); setVerticalThrust(0); }}
                    onMouseLeave={stopHold}
                  >▲</button>
                  <button
                    className="dpad-btn"
                    onMouseDown={() => startHold(() => setVerticalThrust(-1))}
                    onMouseUp={() => { stopHold(); setVerticalThrust(0); }}
                    onMouseLeave={stopHold}
                  >▼</button>
                  <button
                    className="dpad-btn"
                    onMouseDown={() => startHold(() => setLateralThrust(-1))}
                    onMouseUp={() => { stopHold(); setLateralThrust(0); }}
                    onMouseLeave={stopHold}
                  >▶</button>
                </div>
              </div>
            </div>

            {isOrbiting && (
            <div className="dashboard-column">
              <div className="dashboard-column-title">绕飞参数 · {nearestBodyName}</div>
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
                <div className="dashboard-stat">
                  <div className="dashboard-stat-label">自转夹角</div>
                  <div className="dashboard-stat-value" style={{ color: '#99ccff', fontSize: 11 }}>
                    {rotAngleDeg.toFixed(1)}°
                  </div>
                </div>
                <div className="dashboard-stat">
                  <div className="dashboard-stat-label">相对地表速度</div>
                  <div className="dashboard-stat-value" style={{ color: relSurfaceSpeedKms > 0 ? '#ffcc66' : '#66ccff', fontSize: 11 }}>
                    {relSurfaceSpeedKms >= 0 ? '+' : ''}{relSurfaceSpeedKms.toFixed(2)} <span style={{ fontSize: 7, color: '#445566' }}>km/s</span>
                  </div>
                </div>
                <div className="dashboard-stat">
                  <div className="dashboard-stat-label">公转夹角</div>
                  <div className="dashboard-stat-value" style={{ color: '#99ccaa', fontSize: 11 }}>
                    {revolAngleDeg.toFixed(1)}°
                  </div>
                </div>
              </div>
            </div>
            )}

            <div className="dashboard-column" style={{ flex: isOrbiting ? 1 : 2 }}>
              <div className="dashboard-column-title">导航图</div>
              <div className="dashboard-minimap-wrap">
                <MiniMap />
              </div>
            </div>
          </div>
        )}
      </div>
      {showTargetModal && (
        <TargetSelectionModal
          bodies={ALL_IDS}
          currentTarget={targetBodyId}
          onSelect={(id) => { setTargetBody(id); setShowTargetModal(false); }}
          onClose={() => setShowTargetModal(false)}
        />
      )}
    </div>
  );
}

export default Dashboard;
