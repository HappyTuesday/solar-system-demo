import { useEarthMoonStore } from '../../stores/earthMoonStore';
import './MoonPhase.css';

const PHASE_ICONS: Record<string, string> = {
  '新月': '🌑', '蛾眉月': '🌒', '上弦月': '🌓', '盈凸月': '🌔',
  '满月': '🌕', '亏凸月': '🌖', '下弦月': '🌗', '残月': '🌘',
};

function MoonPhase() {
  const moonPhase = useEarthMoonStore(s => s.moonPhase);
  if (!moonPhase) return null;

  return (
    <div className="moon-phase-panel">
      <div className="moon-phase-icon">{PHASE_ICONS[moonPhase.name] || '🌕'}</div>
      <div className="moon-phase-name">{moonPhase.name}</div>
      <div className="moon-phase-angle">相位角: {((moonPhase.angle * 180) / Math.PI).toFixed(1)}°</div>
      <div className="moon-phase-illumination">照明率: {(moonPhase.illumination * 100).toFixed(0)}%</div>
    </div>
  );
}

export default MoonPhase;
