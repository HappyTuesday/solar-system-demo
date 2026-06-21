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
        {!exploded && (
          <div className="dashboard-speed-badge">
            {speedMs.toFixed(1)} km/s
          </div>
        )}
        <div className="dashboard-collapse-btn" onClick={toggleDashboard}>
          ✧
        </div>
      </div>
    );
  }

  return (
    <div className="dashboard-container">
      <div className="dashboard-panel">
        <div className="dashboard-panel-header">
          <span className="dashboard-panel-title">飞船仪表</span>
          <button className="dashboard-close-btn" onClick={toggleDashboard}>−</button>
        </div>

        {exploded ? (
          <div className="dashboard-exploded">
            飞行终止
            <br />
            <button
              className="dashboard-ctrl-btn"
              style={{ marginTop: 8, width: '100%' }}
              onClick={reset}
            >
              重新出发
            </button>
          </div>
        ) : (
          <>
            <div className="dashboard-section">
              <div className="dashboard-section-label">位置 (AU)</div>
              <div className="dashboard-position-grid">
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
              <div className="dashboard-row">
                <div className="dashboard-readout-half">
                  <div className="dashboard-readout-label">飞行速度</div>
                  <div className="dashboard-readout-value" style={{ color: '#ffff00', fontSize: 12 }}>
                    {speedMs.toFixed(1)} <span style={{ fontSize: 9, color: '#667788' }}>km/s</span>
                  </div>
                </div>
                <div className="dashboard-readout-half">
                  <div className="dashboard-readout-label">推力</div>
                  <div className="dashboard-readout-value" style={{ color: '#00b8ff', fontSize: 12 }}>
                    {thrustMagnitude} <span style={{ fontSize: 9, color: '#667788' }}>%</span>
                  </div>
                </div>
              </div>
            </div>

            <div className="dashboard-section">
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
                  onClick={() => setThrustMagnitude(Math.min(100, thrustMagnitude + 10))}
                >
                  + 加速
                </button>
                <button
                  className="dashboard-decel-btn"
                  onClick={() => setThrustMagnitude(Math.max(0, thrustMagnitude - 10))}
                >
                  − 减速
                </button>
              </div>
              <button
                className="dashboard-ctrl-btn"
                style={{ width: '100%' }}
                onClick={toggleRunning}
              >
                {isRunning ? '⏸ 暂停' : '▶ 继续'}
              </button>
            </div>

            <div className="dashboard-section">
              <div className="dashboard-section-label">导航图</div>
              <MiniMap />
            </div>
          </>
        )}
      </div>
    </div>
  );
}

export default Dashboard;
