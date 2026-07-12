import { useEarthMoonStore } from '../../stores/earthMoonStore';
import './MoonPhase.css';

const PHASE_ICONS: Record<string, string> = {
  '新月': '🌑', '蛾眉月': '🌒', '上弦月': '🌓', '盈凸月': '🌔',
  '满月': '🌕', '亏凸月': '🌖', '下弦月': '🌗', '残月': '🌘',
};

const PHASE_DESCRIPTIONS: Record<string, string> = {
  '新月': '月亮的亮面背对着我们，像藏起来了。',
  '蛾眉月': '一小弯亮光出现了。',
  '上弦月': '我们看见了半个月亮。',
  '盈凸月': '亮起来的地方越来越多。',
  '满月': '月亮的亮面正对着我们。',
  '亏凸月': '满月过后，亮面开始变小。',
  '下弦月': '月亮又只亮了一半。',
  '残月': '只剩一小弯亮光了。',
};

function MoonPhase() {
  const moonPhase = useEarthMoonStore(s => s.moonPhase);
  if (!moonPhase) return null;

  return (
    <div className="moon-phase-panel">
      <div className="moon-phase-icon">{PHASE_ICONS[moonPhase.name] || '🌕'}</div>
      <div className="moon-phase-label">现在的月亮</div>
      <div className="moon-phase-name">{moonPhase.name}</div>
      <div className="moon-phase-description">{PHASE_DESCRIPTIONS[moonPhase.name]}</div>
      <div className="moon-phase-illumination">亮起来 {(moonPhase.illumination * 100).toFixed(0)}%</div>
    </div>
  );
}

export default MoonPhase;
