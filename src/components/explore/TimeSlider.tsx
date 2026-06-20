import { useExploreStore } from '../../stores/exploreStore';

function TimeSlider() {
  const isRunning = useExploreStore(s => s.isRunning);
  const timeScale = useExploreStore(s => s.timeScale);
  const simulatedTime = useExploreStore(s => s.simulatedTime);
  const toggleRunning = useExploreStore(s => s.toggleRunning);
  const setTimeScale = useExploreStore(s => s.setTimeScale);
  const setSimulatedTime = useExploreStore(s => s.setSimulatedTime);

  const speeds = [1, 86400, 864000, 8640000, 86400000];

  const date = new Date(simulatedTime);
  const dateStr = date.toLocaleDateString('zh-CN', {
    year: 'numeric', month: '2-digit', day: '2-digit',
    hour: '2-digit', minute: '2-digit',
  });

  return (
    <div style={{
      height: '44px',
      display: 'flex',
      alignItems: 'center',
      gap: '12px',
      padding: '0 16px',
      background: 'rgba(13, 13, 42, 0.95)',
      borderTop: '1px solid #1a1a3a',
    }}>
      <button onClick={() => setSimulatedTime(simulatedTime - 864000000)} style={btnStyle}>◀◀ 10天</button>
      <button onClick={toggleRunning} style={btnStyle}>{isRunning ? '⏸' : '▶'}</button>
      <button onClick={() => setSimulatedTime(simulatedTime + 864000000)} style={btnStyle}>10天 ▶▶</button>
      <span style={{ color: '#a0a0a0', fontSize: '0.85rem', minWidth: '200px', textAlign: 'center' }}>
        {dateStr} UTC
      </span>
      <div style={{ flex: 1 }} />
      {speeds.map(s => (
        <button
          key={s}
          onClick={() => setTimeScale(s)}
          style={{
            ...btnStyle,
            background: timeScale === s ? 'rgba(79, 195, 247, 0.2)' : 'transparent',
            color: timeScale === s ? '#4fc3f7' : '#a0a0a0',
          }}
        >
          {s >= 86400 ? `${s / 86400}天/秒` : '1x'}
        </button>
      ))}
    </div>
  );
}

const btnStyle: React.CSSProperties = {
  padding: '4px 10px',
  border: '1px solid #2a2a4a',
  borderRadius: '4px',
  background: 'transparent',
  color: '#e0e0e0',
  cursor: 'pointer',
  fontSize: '0.8rem',
};

export default TimeSlider;
