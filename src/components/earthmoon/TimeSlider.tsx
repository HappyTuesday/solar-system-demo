import { useEarthMoonStore } from '../../stores/earthMoonStore';

function TimeSlider() {
  const isRunning = useEarthMoonStore(s => s.isRunning);
  const timeScale = useEarthMoonStore(s => s.timeScale);
  const simulatedTime = useEarthMoonStore(s => s.simulatedTime);
  const toggleRunning = useEarthMoonStore(s => s.toggleRunning);
  const setTimeScale = useEarthMoonStore(s => s.setTimeScale);
  const setSimulatedTime = useEarthMoonStore(s => s.setSimulatedTime);

  const speeds = [1, 3600, 86400, 2592000, 86400000];
  const speedLabels = ['1x', '1h/s', '1天/秒', '1月/秒', '100天/秒'];

  const date = new Date(simulatedTime);
  const dateStr = date.toLocaleDateString('zh-CN', {
    year: 'numeric', month: '2-digit', day: '2-digit', hour: '2-digit', minute: '2-digit',
  });

  return (
    <div style={{ height: 44, display: 'flex', alignItems: 'center', gap: 8, padding: '0 12px', background: 'rgba(13, 13, 42, 0.95)', borderTop: '1px solid #1a1a3a' }}>
      <button onClick={() => setSimulatedTime(simulatedTime - 30 * 86400000)} style={btnStyle}>◀◀ 1月</button>
      <button onClick={() => setSimulatedTime(simulatedTime - 86400000)} style={btnStyle}>◀ 1天</button>
      <button onClick={toggleRunning} style={btnStyle}>{isRunning ? '⏸' : '▶'}</button>
      <button onClick={() => setSimulatedTime(simulatedTime + 86400000)} style={btnStyle}>1天 ▶</button>
      <button onClick={() => setSimulatedTime(simulatedTime + 30 * 86400000)} style={btnStyle}>1月 ▶▶</button>
      <span style={{ color: '#a0a0a0', fontSize: '0.82rem', minWidth: 200, textAlign: 'center' }}>{dateStr} UTC</span>
      <div style={{ flex: 1 }} />
      {speeds.map((s, i) => (
        <button key={s} onClick={() => setTimeScale(s)} style={{
          ...btnStyle,
          background: timeScale === s ? 'rgba(79, 195, 247, 0.2)' : 'transparent',
          color: timeScale === s ? '#4fc3f7' : '#a0a0a0',
        }}>{speedLabels[i]}</button>
      ))}
    </div>
  );
}

const btnStyle: React.CSSProperties = { padding: '3px 8px', border: '1px solid #2a2a4a', borderRadius: 4, background: 'transparent', color: '#e0e0e0', cursor: 'pointer', fontSize: '0.75rem' };

export default TimeSlider;
