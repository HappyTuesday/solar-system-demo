import { REAL_DATA, MU_SUN_AU as MU_SUN, AU_TO_KM } from '../../engine/constants';
import { julianDate, solveKepler, trueAnomaly, stateVectors, orbitalPeriod, meanAnomalyAtTime } from '../../engine/orbital';
import { useSpaceshipStore } from '../../stores/spaceshipStore';
import './TargetSelectionModal.css';

const BODY_COLORS: Record<string, string> = {
  sun: '#ffaa00',
  mercury: '#aaaaaa', venus: '#e8c87a', earth: '#4488ff', mars: '#e86440',
  jupiter: '#d4b896', saturn: '#e8d5a3', uranus: '#88ccdd', neptune: '#4466ff',
};

interface Props {
  bodies: string[];
  currentTarget: string | null;
  onSelect: (id: string) => void;
  onClose: () => void;
}

interface BodyOption {
  id: string;
  name: string;
  color: string;
  distanceKm: number;
  angleDeg: number;
}

function TargetSelectionModal({ bodies, currentTarget, onSelect, onClose }: Props) {
  const position = useSpaceshipStore(s => s.position);
  const simulatedTime = useSpaceshipStore(s => s.simulatedTime);
  const jd = julianDate(simulatedTime);

  const options: BodyOption[] = bodies.map(id => {
    const data = REAL_DATA[id];
    if (!data) return null;
    const name = data.name;
    const color = BODY_COLORS[id] || '#888888';

    let bodyPos: [number, number, number];
    if (id === 'sun') {
      bodyPos = [0, 0, 0];
    } else {
      if (!data.semiMajorAxis || !data.orbital) return null;
      const o = data.orbital;
      const period = orbitalPeriod(data.semiMajorAxis, MU_SUN);
      const M = meanAnomalyAtTime(o.meanAnomalyAtEpoch, period, o.epoch, jd);
      const Mmod = ((M % (2 * Math.PI)) + 2 * Math.PI) % (2 * Math.PI);
      const E = solveKepler(Mmod, o.eccentricity);
      const nu = trueAnomaly(E, o.eccentricity);
      const sv = stateVectors(data.semiMajorAxis, o.eccentricity, o.inclination, o.longitudeAscendingNode, o.argumentOfPeriapsis, nu, MU_SUN);
      bodyPos = [sv.position[0], sv.position[1], sv.position[2]];
    }

    const dx = bodyPos[0] - position[0];
    const dy = bodyPos[1] - position[1];
    const dz = bodyPos[2] - position[2];
    const distAU = Math.sqrt(dx * dx + dy * dy + dz * dz);
    const distanceKm = distAU * AU_TO_KM;
    const angleDeg = Math.atan2(dy, dx) * 180 / Math.PI;

    return { id, name, color, distanceKm, angleDeg };
  }).filter((o): o is BodyOption => o !== null);

  const handleOverlayClick = (e: React.MouseEvent) => {
    if (e.target === e.currentTarget) onClose();
  };

  return (
    <div className="target-modal-overlay" onClick={handleOverlayClick}>
      <div className="target-modal-panel">
        <div className="target-modal-header">
          <span className="target-modal-title">选择目的地天体</span>
          <button className="target-modal-close-btn" onClick={onClose}>✕</button>
        </div>
        <div className="target-modal-list">
          {options.map(opt => (
            <div
              key={opt.id}
              className={`target-modal-item${opt.id === currentTarget ? ' selected' : ''}`}
              onClick={() => onSelect(opt.id)}
            >
              <span className="target-modal-dot" style={{ background: opt.color }} />
              <span className="target-modal-body-name">{opt.name}</span>
              <span className="target-modal-dist">
                {opt.distanceKm / AU_TO_KM >= 0.01
                  ? `${(opt.distanceKm / AU_TO_KM).toFixed(3)} AU`
                  : `${opt.distanceKm.toFixed(0)} km`}
              </span>
              <span className="target-modal-angle">{opt.angleDeg.toFixed(1)}°</span>
            </div>
          ))}
        </div>
      </div>
    </div>
  );
}

export default TargetSelectionModal;
