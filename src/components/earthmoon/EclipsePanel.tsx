import { useEarthMoonStore } from '../../stores/earthMoonStore';
import type { EclipseType } from '../../engine/eclipse';

const TYPE_LABELS: Record<EclipseType, string> = {
  none: '无', penumbral: '半影月食', partial: '月偏食', total: '月全食',
};
const TYPE_COLORS: Record<EclipseType, string> = {
  none: '#a0a0a0', penumbral: '#8d9ec6', partial: '#c68d8d', total: '#c65858',
};
const TYPE_MESSAGES: Record<EclipseType, string> = {
  none: '月亮还没有走进地球的影子。',
  penumbral: '月亮碰到了地球淡淡的影子。',
  partial: '月亮有一部分走进了地球的影子。',
  total: '月亮完全走进了地球的影子！',
};

function EclipsePanel() {
  const eclipseType = useEarthMoonStore(s => s.eclipseType);
  const eclipseDates = useEarthMoonStore(s => s.eclipseDates);
  const setSimulatedTime = useEarthMoonStore(s => s.setSimulatedTime);
  const setTimeScale = useEarthMoonStore(s => s.setTimeScale);

  const jumpToEclipse = (peakJD: number) => {
    setTimeScale(3600);
    setSimulatedTime((peakJD - 2440587.5) * 86400000);
  };

  return (
    <div className="earthmoon-eclipse-panel">
      <div className="earthmoon-eclipse-title">🌍 地球的影子</div>
      <p>{TYPE_MESSAGES[eclipseType]}</p>
      <div className="earthmoon-eclipse-type" style={{ color: TYPE_COLORS[eclipseType] }}>
        科学家叫它：{TYPE_LABELS[eclipseType]}
      </div>
      {eclipseDates.length > 0 && (
        <>
          <div className="earthmoon-eclipse-forecast">点一个日期，马上看月食</div>
          <div className="earthmoon-eclipse-dates">
            {eclipseDates.slice(0, 3).map((ev, i) => (
              <button key={i}
                onClick={() => jumpToEclipse(ev.peakJD)}
              >
                <span>{ev.date.toLocaleDateString('zh-CN', { month: 'long', day: 'numeric' })}</span>
                <span style={{ color: TYPE_COLORS[ev.type] }}>{TYPE_LABELS[ev.type]}</span>
              </button>
            ))}
          </div>
        </>
      )}
    </div>
  );
}

export default EclipsePanel;
