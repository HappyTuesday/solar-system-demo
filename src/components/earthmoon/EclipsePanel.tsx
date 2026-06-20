import { useEarthMoonStore } from '../../stores/earthMoonStore';
import type { EclipseType } from '../../engine/eclipse';

const TYPE_LABELS: Record<EclipseType, string> = {
  none: '无', penumbral: '半影月食', partial: '月偏食', total: '月全食',
};
const TYPE_COLORS: Record<EclipseType, string> = {
  none: '#a0a0a0', penumbral: '#8d9ec6', partial: '#c68d8d', total: '#c65858',
};

function EclipsePanel() {
  const eclipseType = useEarthMoonStore(s => s.eclipseType);
  const eclipseDates = useEarthMoonStore(s => s.eclipseDates);
  const setSimulatedTime = useEarthMoonStore(s => s.setSimulatedTime);

  return (
    <div style={{
      position: 'absolute', bottom: 20, right: 20,
      background: 'rgba(13, 13, 42, 0.92)', border: '1px solid #2a2a4a',
      borderRadius: 8, padding: '14px 18px', minWidth: 220, zIndex: 10,
    }}>
      <div style={{ color: '#4fc3f7', fontSize: '0.95rem', fontWeight: 600, marginBottom: 8 }}>月食状态</div>
      <div style={{
        display: 'inline-block', padding: '3px 10px', borderRadius: 4,
        background: TYPE_COLORS[eclipseType] + '22', color: TYPE_COLORS[eclipseType],
        fontSize: '0.85rem', fontWeight: 600, marginBottom: 12,
      }}>
        {TYPE_LABELS[eclipseType]}
      </div>
      {eclipseDates.length > 0 && (
        <>
          <div style={{ color: '#a0a0a0', fontSize: '0.8rem', marginBottom: 6 }}>近期月食预报</div>
          {eclipseDates.slice(0, 5).map((ev, i) => (
            <div key={i}
              onClick={() => setSimulatedTime((ev.peakJD - 2440587.5) * 86400000)}
              style={{
                display: 'flex', justifyContent: 'space-between', padding: '4px 0',
                fontSize: '0.8rem', color: '#c0c0c0', cursor: 'pointer', borderBottom: '1px solid #1a1a3a',
              }}>
              <span>{ev.date.toLocaleDateString('zh-CN')}</span>
              <span style={{ color: TYPE_COLORS[ev.type] }}>{TYPE_LABELS[ev.type]}</span>
            </div>
          ))}
        </>
      )}
    </div>
  );
}

export default EclipsePanel;
