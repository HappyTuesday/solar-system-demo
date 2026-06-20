import { useUIStore } from '../../stores/uiStore';
import { useBuildStore } from '../../stores/buildStore';
import { REAL_DATA } from '../../engine/constants';
import { getSimplifiedRadius } from '../../engine/coordinateTransform';
import './CoordinateDisplay.css';

function fmtTwo(pos: [number, number] | null): string {
  if (!pos) return '(—, —)';
  return `(${pos[0].toFixed(0)}, ${pos[1].toFixed(0)})`;
}

export default function CoordinateDisplay() {
  const mousePhysicalPos = useUIStore(s => s.mousePhysicalPos);
  const selectedToolId = useUIStore(s => s.selectedToolId);
  const bodies = useBuildStore(s => s.bodies);

  return (
    <div className="coordinate-display">
      <div className="coordinate-row">
        <span className="label">位置</span>
        <span className="value">{fmtTwo(mousePhysicalPos)}</span>
        <span className="unit">画布坐标</span>
      </div>
      {selectedToolId && (
        <div className="coordinate-row">
          <span className="label">天体: {REAL_DATA[selectedToolId]?.name ?? selectedToolId}</span>
          <span className="sep">|</span>
          <span className="label">半径:</span>
          <span className="value">{getSimplifiedRadius(selectedToolId)}</span>
          <span className="unit">px</span>
          <span className="sep">|</span>
          <span className="label">质量:</span>
          <span className="value">{(REAL_DATA[selectedToolId]?.mass ?? 0).toExponential(2)}</span>
          <span className="unit">kg</span>
        </div>
      )}
      <div className="coordinate-row">
        <span className="label">天体数</span>
        <span className="value">{bodies.length}</span>
      </div>
    </div>
  );
}
