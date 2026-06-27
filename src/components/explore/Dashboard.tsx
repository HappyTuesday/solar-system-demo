import { useCallback, useEffect, useRef, useState } from 'react';
import { useSpaceshipStore } from '../../stores/spaceshipStore';
import { REAL_DATA } from '../../engine/constants';
import type { AttitudeMode } from '../../types';
import MiniMap from './MiniMap';
import TargetSelectionModal from './TargetSelectionModal';
import './Dashboard.css';

const RotationRate = Math.PI / 3;

function formatWaitDays(days: number): string {
  if (days <= 0.0001) return '即将就绪';
  if (days < 0.05) return `${Math.round(days * 86400)} 秒`;
  if (days < 1) return `${(days * 24).toFixed(1)} 小时`;
  return `${days.toFixed(1)} 天`;
}

function Dashboard() {
  const direction = useSpaceshipStore(s => s.direction);
  const thrustMagnitude = useSpaceshipStore(s => s.thrustMagnitude);
  const exploded = useSpaceshipStore(s => s.exploded);
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
  const navigationPlan = useSpaceshipStore(s => s.navigationPlan);
  const activePhaseIndex = useSpaceshipStore(s => s.activePhaseIndex);
  const deviationWarning = useSpaceshipStore(s => s.deviationWarning);
  const windowReady = useSpaceshipStore(s => s.windowReady);
  const windowRemainingDays = useSpaceshipStore(s => s.windowRemainingDays);
  const [showTargetModal, setShowTargetModal] = useState(false);

  const sliderTrackRef = useRef<HTMLDivElement>(null);
  const navPhasesRef = useRef<HTMLDivElement>(null);

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

  useEffect(() => {
    if (!navPhasesRef.current || activePhaseIndex < 0) return;
    const activeEl = navPhasesRef.current.querySelector('.dashboard-nav-phase.active');
    if (activeEl) {
      activeEl.scrollIntoView({ block: 'center', behavior: 'smooth' });
    }
  }, [activePhaseIndex]);

  const getPhaseStatus = (phaseIdx: number): 'completed' | 'active' | 'pending' => {
    if (phaseIdx < activePhaseIndex) return 'completed';
    if (phaseIdx === activePhaseIndex) return 'active';
    return 'pending';
  };

  return (
    <div className="dashboard-container">
      <div className="dashboard-panel">
        {exploded ? null : (
          <div className="dashboard-panel-body">
            {/* Column 1: Flight Controls */}
            <div className="dashboard-column">
              <div className="dashboard-column-title">飞行控制</div>

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
              <div className="dashboard-thrust-value">推力 {thrustMagnitude} MN</div>

              <div className="dashboard-pads-row">
                <div className="dashboard-pad-group">
                  <div className="dashboard-pad-label">姿态调整</div>
                  <div className="dashboard-pad-grid">
                    <div />
                    <button className="dashboard-pad-btn"
                      onMouseDown={(e) => { e.preventDefault(); startHold(() => pitch(RotationRate * 0.1)); }}
                      onMouseUp={stopHold} onMouseLeave={stopHold}
                    >▲</button>
                    <div />
                    <button className="dashboard-pad-btn"
                      onMouseDown={(e) => { e.preventDefault(); startHold(() => yaw(RotationRate * 0.1)); }}
                      onMouseUp={stopHold} onMouseLeave={stopHold}
                    >◀</button>
                    <button className="dashboard-pad-btn flip"
                      onMouseDown={(e) => { e.preventDefault(); setDirection([-direction[0], -direction[1], -direction[2]]); setAttitudeMode('inertial' as AttitudeMode); }}
                    >⇄</button>
                    <button className="dashboard-pad-btn"
                      onMouseDown={(e) => { e.preventDefault(); startHold(() => yaw(-RotationRate * 0.1)); }}
                      onMouseUp={stopHold} onMouseLeave={stopHold}
                    >▶</button>
                    <div />
                    <button className="dashboard-pad-btn"
                      onMouseDown={(e) => { e.preventDefault(); startHold(() => pitch(-RotationRate * 0.1)); }}
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

              {navigationPlan && navigationPlan.phases.length > 0 ? (
                <div className="dashboard-nav-phases" ref={navPhasesRef}>
                  {navigationPlan.phases.map((phase) => {
                    const status = getPhaseStatus(phase.index);
                    const icon = status === 'completed' ? '✓' : status === 'active' ? '→' : '○';
                    return (
                      <div key={phase.index} className={`dashboard-nav-phase ${status}`}>
                        <span className={`dashboard-nav-phase-icon ${status}`}>{icon}</span>
                        <div>
                          <div className={`dashboard-nav-phase-name ${status}`}>
                            阶段{phase.index + 1}：{phase.name}
                          </div>
                          <div className="dashboard-nav-phase-detail">
                            {phase.name.startsWith('等待')
                                ? (windowReady
                                    ? '已进入发射窗口期 · 请点火'
                                    : `预计等待约 ${formatWaitDays(windowRemainingDays > 0 ? windowRemainingDays : (phase.expectedWaitDays ?? 0))}`)
                                : phase.thrustDirection === 'none'
                                  ? '无推力 · 等待转移'
                                  : `推力 ${phase.thrustDirection === 'forward' ? '↑' : '↓'}${phase.thrustMagnitude}MN · Δv ${phase.deltaV.toFixed(3)} AU/s`}
                          </div>
                        </div>
                      </div>
                    );
                  })}
                </div>
              ) : null}

              {deviationWarning && (
                <div className="dashboard-nav-warning">{deviationWarning}</div>
              )}
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
