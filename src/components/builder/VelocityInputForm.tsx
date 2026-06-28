import { useState } from 'react';
import { BUILD_DATA } from '../../engine/buildData';
import { AU_TO_KM } from '../../engine/constants';
import type { CelestialBodyId } from '../../types';
import './VelocityInputForm.css';

interface VelocityInputFormProps {
  templateId: CelestialBodyId;
  onConfirm: (speed: number, angleDeg: number) => void;
  onCancel: () => void;
}

const MAX_SPEED = 200;

export default function VelocityInputForm({
  templateId,
  onConfirm,
  onCancel,
}: VelocityInputFormProps) {
  const data = BUILD_DATA[templateId];
  const defaultOrbitalSpeed = data?.orbitalSpeed;

  const defaultSpeed = defaultOrbitalSpeed ? (defaultOrbitalSpeed * AU_TO_KM).toFixed(1) : '0';
  const [speed, setSpeed] = useState<string>(defaultSpeed);
  const [angle, setAngle] = useState<string>('0');

  const speedNum = parseFloat(speed);
  const angleNum = parseFloat(angle);
  const isValid = !isNaN(speedNum) && speedNum >= 0 && !isNaN(angleNum);

  const handleConfirm = () => {
    if (!isValid) return;
    const cappedSpeed = Math.min(speedNum, MAX_SPEED);
    const angleDeg = ((angleNum % 360) + 360) % 360;
    onConfirm(cappedSpeed / AU_TO_KM, angleDeg);
  };

  const handleKeyDown = (e: React.KeyboardEvent) => {
    if (e.key === 'Enter' && isValid) {
      handleConfirm();
    } else if (e.key === 'Escape') {
      onCancel();
    }
  };

  return (
    <div className="velocity-input-form panel-section" onKeyDown={handleKeyDown}>
      <div className="form-title">设定初速度 — {data?.name ?? templateId}</div>

      <div className="form-field">
        <div className="form-label">初速度大小</div>
        <div className="form-input-row">
          <input
            className="form-input"
            type="number"
            value={speed}
            onChange={e => setSpeed(e.target.value)}
            min="0"
            max={MAX_SPEED}
            placeholder="0"
            autoFocus
          />
          <span className="form-unit">km/s</span>
        </div>
      </div>

      <div className="form-field">
        <div className="form-label">切向角度</div>
        <div className="form-input-row">
          <input
            className="form-input"
            type="number"
            value={angle}
            onChange={e => setAngle(e.target.value)}
            min="0"
            max="360"
            placeholder="0"
          />
          <span className="form-unit">°</span>
        </div>
      </div>

      <div className="form-actions">
        <button className="form-btn cancel" onClick={onCancel}>
          取消
        </button>
        <button className="form-btn confirm" onClick={handleConfirm} disabled={!isValid}>
          确认放置
        </button>
      </div>
    </div>
  );
}
