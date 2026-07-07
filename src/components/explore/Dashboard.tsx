import { useCallback, useMemo, useRef, useState } from 'react';
import { useSpaceshipStore } from '../../stores/spaceshipStore';
import { AU_TO_KM, REAL_DATA } from '../../engine/constants';
import type { AttitudeMode } from '../../types';
import { computeRendezvousDisplayParams } from '../../engine/navigation';
import { canEnableCruise } from '../../engine/cruise';
import MiniMap from './MiniMap';
import TargetSelectionModal from './TargetSelectionModal';
import './Dashboard.css';

const ATTITUDE_FINE_STEP_DEG = 0.1;
const ATTITUDE_MEDIUM_STEP_DEG = 1;
const ATTITUDE_LARGE_STEP_DEG = 5;
const ATTITUDE_HOLD_INTERVAL_MS = 80;
const ATTITUDE_MEDIUM_AFTER_MS = 600;
const ATTITUDE_LARGE_AFTER_MS = 1600;

function formatDurationSec(seconds: number): string {
  if (!Number.isFinite(seconds)) return '不可达';
  if (seconds < 3600) return `${Math.max(1, Math.round(seconds / 60))} 分`;
  if (seconds < 86400) return `${Math.round(seconds / 3600)} 小时`;
  return `${Math.round(seconds / 86400)} 天`;
}

function formatSignedSpeed(speedAUPerSec: number): string {
  const speed = speedAUPerSec * AU_TO_KM;
  return `${speed >= 0 ? '+' : ''}${speed.toFixed(2)} km/s`;
}

function formatSignedAngle(angleDeg: number): string {
  return `${angleDeg >= 0 ? '+' : ''}${angleDeg.toFixed(1)}°`;
}

function formatDistance(distanceAU: number): string {
  const distanceKm = distanceAU * AU_TO_KM;
  if (distanceKm >= 1_000_000) return `${(distanceKm / 1_000_000).toFixed(2)} 百万 km`;
  return `${Math.round(distanceKm).toLocaleString('zh-CN')} km`;
}

function Dashboard() {
  const direction = useSpaceshipStore(s => s.direction);
  const thrustMagnitude = useSpaceshipStore(s => s.thrustMagnitude);
  const exploded = useSpaceshipStore(s => s.exploded);
  const gear = useSpaceshipStore(s => s.gear);
  const setForwardThrust = useSpaceshipStore(s => s.setForwardThrust);
  const setLateralThrust = useSpaceshipStore(s => s.setLateralThrust);
  const setVerticalThrust = useSpaceshipStore(s => s.setVerticalThrust);
  const setThrustMagnitude = useSpaceshipStore(s => s.setThrustMagnitude);
  const setGear = useSpaceshipStore(s => s.setGear);
  const yawDegrees = useSpaceshipStore(s => s.yawDegrees);
  const pitchDegrees = useSpaceshipStore(s => s.pitchDegrees);
  const setDirection = useSpaceshipStore(s => s.setDirection);
  const intervalRef = useRef<ReturnType<typeof setInterval> | null>(null);
  const attitudeMode = useSpaceshipStore(s => s.attitudeMode);
  const setAttitudeMode = useSpaceshipStore(s => s.setAttitudeMode);
  const targetBodyId = useSpaceshipStore(s => s.targetBodyId);
  const setTargetBody = useSpaceshipStore(s => s.setTargetBody);
  const navigationPlan = useSpaceshipStore(s => s.navigationPlan);
  const position = useSpaceshipStore(s => s.position);
  const velocity = useSpaceshipStore(s => s.velocity);
  const simulatedTime = useSpaceshipStore(s => s.simulatedTime);
  const orbitingBodyId = useSpaceshipStore(s => s.orbitingBodyId);
  const [showTargetModal, setShowTargetModal] = useState(false);
  const showTangentialGear = Boolean(navigationPlan?.rendezvous);
  const cruiseActive = useSpaceshipStore(s => s.cruiseActive);
  const toggleCruise = useSpaceshipStore(s => s.toggleCruise);
  const thrust = useSpaceshipStore(s => s.thrust);
  const cruiseEnabled = useMemo(
    () => cruiseActive || canEnableCruise(position, velocity, thrust, thrustMagnitude, navigationPlan),
    [cruiseActive, position, velocity, thrust, thrustMagnitude, navigationPlan],
  );

  const sliderTrackRef = useRef<HTMLDivElement>(null);
  const rendezvousParams = useMemo(() => {
    if (!navigationPlan?.rendezvous) return null;
    return computeRendezvousDisplayParams(
      position,
      velocity,
      direction,
      navigationPlan,
      simulatedTime,
      orbitingBodyId,
    );
  }, [direction, navigationPlan, orbitingBodyId, position, simulatedTime, velocity]);

  const updateThrustFromClientX = useCallback((clientX: number) => {
    const track = sliderTrackRef.current;
    if (!track) return;
    if (useSpaceshipStore.getState().gear === 'P') return;
    const rect = track.getBoundingClientRect();
    const x = clientX - rect.left;
    const pct = Math.max(0, Math.min(100, Math.round((x / rect.width) * 100)));
    setThrustMagnitude(pct);
    const currentGear = useSpaceshipStore.getState().gear;
    if (currentGear === 'N') {
      setForwardThrust(0);
    } else if (currentGear === 'R') {
      setForwardThrust(pct > 0 ? -1 : 0);
    } else {
      setForwardThrust(pct > 0 ? 1 : 0);
    }
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

  const startAttitudeHold = useCallback((applyStep: (degrees: number) => void) => {
    const startedAt = performance.now();
    applyStep(ATTITUDE_FINE_STEP_DEG);
    if (intervalRef.current) clearInterval(intervalRef.current);
    intervalRef.current = setInterval(() => {
      const elapsed = performance.now() - startedAt;
      const step = elapsed >= ATTITUDE_LARGE_AFTER_MS
        ? ATTITUDE_LARGE_STEP_DEG
        : elapsed >= ATTITUDE_MEDIUM_AFTER_MS
          ? ATTITUDE_MEDIUM_STEP_DEG
          : ATTITUDE_FINE_STEP_DEG;
      applyStep(step);
    }, ATTITUDE_HOLD_INTERVAL_MS);
  }, []);

  return (
    <div className="dashboard-container">
      <div className="dashboard-panel">
        {exploded ? null : (
          <div className="dashboard-panel-body">
            {/* Column 1: Flight Controls */}
            <div className="dashboard-column">
              <div className="dashboard-column-title">飞行控制</div>

              <div className="dashboard-thrust-gear-row">
                <div className="dashboard-thrust-row" ref={sliderTrackRef}
                  onMouseDown={handleTrackMouseDown}
                  onTouchStart={handleTrackTouchStart}>
                  <div className="dashboard-thrust-track" />
                  <div className="dashboard-thrust-fill" style={{ width: `${thrustMagnitude}%` }} />
                  <div className="dashboard-thrust-thumb" style={{ left: `${thrustMagnitude}%` }} />
                  <div className="dashboard-thrust-labels">
                    <span>0</span><span>25</span><span>50</span><span>75</span><span>100</span>
                  </div>
                </div>
                <div className="dashboard-gear-separator" />
                <div className="dashboard-gear-buttons">
                  <button className={`dashboard-gear-btn gear-d${gear === 'D' ? ' active' : ''}`}
                    onMouseDown={(e) => { e.preventDefault(); setGear('D'); }}
                  >D</button>
                  <button className={`dashboard-gear-btn gear-n${gear === 'N' ? ' active' : ''}`}
                    onMouseDown={(e) => { e.preventDefault(); setGear('N'); }}
                  >N</button>
                  <button className={`dashboard-gear-btn gear-r${gear === 'R' ? ' active' : ''}`}
                    onMouseDown={(e) => { e.preventDefault(); setGear('R'); }}
                  >R</button>
                  <button className={`dashboard-gear-btn gear-p${gear === 'P' ? ' active' : ''}`}
                    title="泊车：自动朝向前进方向并反向制动，速度归零后回到N档"
                    onMouseDown={(e) => { e.preventDefault(); setGear('P'); }}
                  >P</button>
                  {showTangentialGear && (
                    <button className={`dashboard-gear-btn gear-t${gear === 'T' ? ' active' : ''}`}
                      title="切向修正：自动调整姿态与推力，切向速度到0或过零后回到N档"
                      onMouseDown={(e) => { e.preventDefault(); setGear('T'); }}
                    >T</button>
                  )}
                </div>
              </div>
              <div className="dashboard-thrust-value">
                推力 {thrustMagnitude} MN
                {gear === 'N' && <span className="gear-indicator"> [N]</span>}
                {gear === 'R' && <span className="gear-indicator reverse"> [R]</span>}
                {gear === 'T' && <span className="gear-indicator tangential"> [T切向]</span>}
                {gear === 'P' && <span className="gear-indicator park"> [P泊车]</span>}
              </div>

              <div className="dashboard-pads-row">
                <div className="dashboard-cruise-cell">
                  <button
                    className={`dashboard-cruise-btn${cruiseActive ? ' active' : ''}`}
                    disabled={!cruiseEnabled}
                    title="巡航：自动挂T修正切向，预测将到达汇合点时挂P制动并停止"
                    onMouseDown={(e) => e.preventDefault()}
                    onClick={() => toggleCruise()}
                  >巡航</button>
                </div>
                <div className="dashboard-pad-group compact">
                  <div className="dashboard-pad-label">姿态调整</div>
                  <div className="dashboard-pad-grid">
                    <div />
                    <button className="dashboard-pad-btn"
                      title="上仰 0.1°"
                      onMouseDown={(e) => { e.preventDefault(); startAttitudeHold((degrees) => pitchDegrees(degrees)); }}
                      onMouseUp={stopHold} onMouseLeave={stopHold}
                    >▲</button>
                    <div />
                    <button className="dashboard-pad-btn"
                      title="左转 0.1°"
                      onMouseDown={(e) => { e.preventDefault(); startAttitudeHold((degrees) => yawDegrees(degrees)); }}
                      onMouseUp={stopHold} onMouseLeave={stopHold}
                    >◀</button>
                    <button className="dashboard-pad-btn flip"
                      onMouseDown={(e) => { e.preventDefault(); setDirection([-direction[0], -direction[1], -direction[2]]); setAttitudeMode('inertial' as AttitudeMode); }}
                    >⇄</button>
                    <button className="dashboard-pad-btn"
                      title="右转 0.1°"
                      onMouseDown={(e) => { e.preventDefault(); startAttitudeHold((degrees) => yawDegrees(-degrees)); }}
                      onMouseUp={stopHold} onMouseLeave={stopHold}
                    >▶</button>
                    <div />
                    <button className="dashboard-pad-btn"
                      title="下俯 0.1°"
                      onMouseDown={(e) => { e.preventDefault(); startAttitudeHold((degrees) => pitchDegrees(-degrees)); }}
                      onMouseUp={stopHold} onMouseLeave={stopHold}
                    >▼</button>
                    <div />
                  </div>
                </div>
                <div className="dashboard-pad-group">
                  <div className="dashboard-pad-label">平移推力</div>
                  <div className="dashboard-pad-grid">
                    <div />
                    <button className="dashboard-pad-btn translate"
                      onMouseDown={(e) => { e.preventDefault(); startHold(() => setVerticalThrust(1)); }}
                      onMouseUp={() => { stopHold(); setVerticalThrust(0); }}
                      onMouseLeave={stopHold}
                    >▲</button>
                    <div />
                    <button className="dashboard-pad-btn translate"
                      onMouseDown={(e) => { e.preventDefault(); startHold(() => setLateralThrust(1)); }}
                      onMouseUp={() => { stopHold(); setLateralThrust(0); }}
                      onMouseLeave={stopHold}
                    >◀</button>
                    <div />
                    <button className="dashboard-pad-btn translate"
                      onMouseDown={(e) => { e.preventDefault(); startHold(() => setLateralThrust(-1)); }}
                      onMouseUp={() => { stopHold(); setLateralThrust(0); }}
                      onMouseLeave={stopHold}
                    >▶</button>
                    <div />
                    <button className="dashboard-pad-btn translate"
                      onMouseDown={(e) => { e.preventDefault(); startHold(() => setVerticalThrust(-1)); }}
                      onMouseUp={() => { stopHold(); setVerticalThrust(0); }}
                      onMouseLeave={stopHold}
                    >▼</button>
                    <div />
                  </div>
                </div>
              </div>

              <div className="dashboard-mode-row">
                <button
                  className={`dashboard-mode-btn${attitudeMode === 'inertial' ? ' active' : ''}`}
                  onMouseDown={(e) => e.preventDefault()}
                  onClick={() => setAttitudeMode('inertial' as AttitudeMode)}
                >惯性保持</button>
                <button
                  className={`dashboard-mode-btn${attitudeMode === 'prograde' ? ' active' : ''}`}
                  onMouseDown={(e) => e.preventDefault()}
                  onClick={() => setAttitudeMode('prograde' as AttitudeMode)}
                >顺向保持</button>
                {targetBodyId && (
                  <button
                    className={`dashboard-mode-btn${attitudeMode === 'target' ? ' active' : ''}`}
                    onMouseDown={(e) => e.preventDefault()}
                    onClick={() => setAttitudeMode('target' as AttitudeMode)}
                  >指向{REAL_DATA[targetBodyId]?.name || ''}</button>
                )}
                {navigationPlan?.rendezvous && (
                  <button
                    className={`dashboard-mode-btn${attitudeMode === 'rendezvous' ? ' active' : ''}`}
                    onMouseDown={(e) => e.preventDefault()}
                    onClick={() => setAttitudeMode('rendezvous' as AttitudeMode)}
                  >指向汇合点</button>
                )}
              </div>
            </div>

            {/* Separator */}
            <div className="dashboard-column-separator" />

            {/* Column 2: Navigation Route */}
            <div className="dashboard-column">
              <div className="dashboard-column-title">导航路线</div>
              {targetBodyId ? (
                <div className="dashboard-nav-dest"
                  onMouseDown={(e) => e.preventDefault()}
                  onClick={() => setShowTargetModal(true)}
                >
                  目的地：{REAL_DATA[targetBodyId]?.name || targetBodyId}
                  <span className="dashboard-nav-dest-sub">（修改）</span>
                </div>
              ) : (
                <div className="dashboard-nav-set-btn"
                  onMouseDown={(e) => e.preventDefault()}
                  onClick={() => setShowTargetModal(true)}
                >
                  前往目的地
                </div>
              )}

              {rendezvousParams ? (
                <div className="dashboard-rendezvous-params">
                  <div><span>目标到达汇合点</span><strong>{formatDurationSec(rendezvousParams.targetTimeToRendezvousSec)}</strong></div>
                  <div><span>飞船到达汇合点</span><strong>{formatDurationSec(rendezvousParams.shipTimeToRendezvousSec)}</strong></div>
                  <div><span>径向 / 切向速度</span><strong>{formatSignedSpeed(rendezvousParams.radialSpeedAUPerSec)} / {formatSignedSpeed(rendezvousParams.tangentialSpeedAUPerSec)}</strong></div>
                  <div><span>船身与汇合线</span><strong>{formatSignedAngle(rendezvousParams.noseAngleDeg)}</strong></div>
                  <div><span>速度与汇合线</span><strong>{formatSignedAngle(rendezvousParams.velocityAngleDeg)}</strong></div>
                  <div>
                    <span>捕获日心速率</span>
                    <strong>
                      {(rendezvousParams.captureHelioSpeedMinAUPerSec * AU_TO_KM).toFixed(2)}
                      {' - '}
                      {(rendezvousParams.captureHelioSpeedMaxAUPerSec * AU_TO_KM).toFixed(2)} km/s
                    </strong>
                  </div>
                  {rendezvousParams.escapeSpeedAUPerSec != null && (
                    <div><span>逃逸速度</span><strong>{(rendezvousParams.escapeSpeedAUPerSec * AU_TO_KM).toFixed(2)} km/s</strong></div>
                  )}
                  <div>
                    <span>目标 / 汇合点距离</span>
                    <strong>{formatDistance(rendezvousParams.distanceToTargetAU)} / {formatDistance(rendezvousParams.distanceToRendezvousAU)}</strong>
                  </div>
                </div>
              ) : null}
            </div>

            {/* Separator */}
            <div className="dashboard-column-separator" />

            {/* Column 3: Navigation Map */}
            <div className="dashboard-column">
              <div className="dashboard-column-title">导航地图</div>
              <div className="dashboard-minimap-wrap">
                <MiniMap />
              </div>
            </div>
          </div>
        )}
      </div>
      {showTargetModal && (
        <TargetSelectionModal
          bodies={['sun', 'mercury', 'venus', 'earth', 'mars', 'jupiter', 'saturn', 'uranus', 'neptune']}
          currentTarget={targetBodyId}
          onSelect={(id) => { setTargetBody(id); setShowTargetModal(false); }}
          onClose={() => setShowTargetModal(false)}
        />
      )}
    </div>
  );
}

export default Dashboard;
