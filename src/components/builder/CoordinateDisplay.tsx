import { useUIStore } from '../../stores/uiStore';
import { REAL_DATA, PHYSICAL_CONSTANTS } from '../../engine/constants';
import { physicalRadiusToRender } from '../../engine/coordinateTransform';
import './CoordinateDisplay.css';

function formatPhysical(val: number): string {
  if (Math.abs(val) < 1 && val !== 0) return val.toExponential(2);
  if (Math.abs(val) >= 1e6) return val.toExponential(3);
  return val.toFixed(1);
}

function formatRender(val: number): string {
  return val.toFixed(1);
}

function fmtThree(pos: [number, number, number] | null): string {
  if (!pos) return '(—, —, —)';
  return `(${formatRender(pos[0])}, ${formatRender(pos[1])}, ${formatRender(pos[2])})`;
}

function fmtTwo(pos: [number, number] | null): string {
  if (!pos) return '(—, —)';
  return `(${pos[0].toFixed(0)}, ${pos[1].toFixed(0)})`;
}

export default function CoordinateDisplay() {
  const mouseCanvasPos = useUIStore(s => s.mouseCanvasPos);
  const mouseRenderPos = useUIStore(s => s.mouseRenderPos);
  const mousePhysicalPos = useUIStore(s => s.mousePhysicalPos);
  const selectedToolId = useUIStore(s => s.selectedToolId);
  const isPlacing = useUIStore(s => s.isPlacing);

  const showBodySize = !!(selectedToolId && mouseCanvasPos);

  return (
    <div className="coordinate-display">
      <div className="coordinate-row">
        <span className="label">[画布]</span>
        <span className="value">{fmtTwo(mouseCanvasPos)}</span>
        <span className="sep">|</span>
        <span className="label">[渲染]</span>
        <span className="value">{fmtThree(mouseRenderPos)}</span>
        <span className="sep">|</span>
        <span className="label">[物理]</span>
        <span className="value">{fmtThree(mousePhysicalPos)}</span>
        <span className="unit">m</span>
      </div>
      {showBodySize && (
        <div className="coordinate-row">
          <span className="label">天体: {selectedToolId === 'sun' ? '太阳' : REAL_DATA[selectedToolId!]?.name ?? selectedToolId}</span>
          <span className="sep">|</span>
          <span className="label">画布:</span>
          <span className="value">{formatRender(physicalRadiusToRender(REAL_DATA[selectedToolId!]?.radius ?? 1e6))}</span>
          <span className="unit">px</span>
          <span className="sep">|</span>
          <span className="label">渲染:</span>
          <span className="value">{formatRender(physicalRadiusToRender(REAL_DATA[selectedToolId!]?.radius ?? 1e6))}</span>
          <span className="unit">uv</span>
          <span className="sep">|</span>
          <span className="label">物理:</span>
          <span className="value">{selectedToolId === 'sun' ? `${(PHYSICAL_CONSTANTS.sunRadius / 1e9).toFixed(2)}×10⁹` : `${((REAL_DATA[selectedToolId!]?.radius ?? 0) / 1e6).toFixed(2)}×10⁶`}</span>
          <span className="unit">m</span>
          {selectedToolId !== 'sun' && (
            <>
              <span className="sep">|</span>
              <span className="label">质量:</span>
              <span className="value">{formatPhysical(REAL_DATA[selectedToolId!]?.mass ?? 0)}</span>
              <span className="unit">kg</span>
            </>
          )}
        </div>
      )}
    </div>
  );
}
