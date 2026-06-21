import { useCallback, useRef } from 'react';
import { useSpaceshipStore } from '../../stores/spaceshipStore';
import MiniMap from './MiniMap';
import './Dashboard.css';

function Dashboard() {
  const expanded = useSpaceshipStore(s => s.dashboardExpanded);
  const toggleDashboard = useSpaceshipStore(s => s.toggleDashboard);
  const position = useSpaceshipStore(s => s.position);
  const velocity = useSpaceshipStore(s => s.velocity);
  const thrustMagnitude = useSpaceshipStore(s => s.thrustMagnitude);
  const exploded = useSpaceshipStore(s => s.exploded);
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
  ) * 1.496e11 / 1000;

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

  if (!expanded) {
    return (
      <div className="dashboard-container">
        <div className="dashboard-collapsed-bar" onClick={toggleDashboard}>
          {!exploded && (
            <span className="dashboard-collapsed-speed">{speedMs.toFixed(1)} km/s</span>
          )}
          <span className="dashboard-collapsed-icon">▲</span>
        </div>
      </div>
    );
  }

  return (
    <div className="dashboard-container">
      <div className="dashboard-panel">
        <div className="dashboard-panel-header">
          <span className="dashboard-panel-title">飞船仪表</span>
          <button className="dashboard-close-btn" onClick={toggleDashboard}>▼</button>
        </div>

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
            <div className="dashboard-section-left">
              <div>
                <div className="dashboard-section-label">位置 (AU)</div>
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
            </div>

            <div className="dashboard-section-center">
              <div>
                <div className="dashboard-section-label">飞行控制</div>
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

            <div className="dashboard-section-right">
              <div className="dashboard-section-label">导航图</div>
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
