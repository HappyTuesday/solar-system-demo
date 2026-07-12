import { useEarthMoonStore } from '../../stores/earthMoonStore';

function TimeSlider() {
  const isRunning = useEarthMoonStore(s => s.isRunning);
  const timeScale = useEarthMoonStore(s => s.timeScale);
  const simulatedTime = useEarthMoonStore(s => s.simulatedTime);
  const toggleRunning = useEarthMoonStore(s => s.toggleRunning);
  const setTimeScale = useEarthMoonStore(s => s.setTimeScale);
  const setSimulatedTime = useEarthMoonStore(s => s.setSimulatedTime);

  const date = new Date(simulatedTime);
  const dateStr = date.toLocaleDateString('zh-CN', {
    year: 'numeric', month: 'long', day: 'numeric',
  });

  return (
    <div className="earthmoon-time-controls">
      <div className="earthmoon-time-intro">
        <strong>让月亮动起来</strong>
        <span>{dateStr}</span>
      </div>
      <button className="earthmoon-time-primary" onClick={toggleRunning}>
        <span>{isRunning ? '⏸' : '▶'}</span>{isRunning ? '暂停一下' : '继续转动'}
      </button>
      <button className={timeScale === 3600 ? 'active' : ''} onClick={() => setTimeScale(3600)}>
        🐢 慢慢转
      </button>
      <button className={timeScale === 864000 ? 'active' : ''} onClick={() => setTimeScale(864000)}>
        🚀 快快转
      </button>
      <button onClick={() => setSimulatedTime(simulatedTime + 86400000)}>
        明天看看 →
      </button>
    </div>
  );
}

export default TimeSlider;
