import { useState, useEffect } from 'react';
import * as THREE from 'three';
import { REAL_DATA } from '../../engine/constants';
import { getSharedScene } from '../../rendering/threejs/cameraRef';
import { previewVelocityArrowInPlacement, removeVelocityArrow } from '../../rendering/threejs/interaction';
import { renderToPhysical } from '../../engine/coordinateTransform';
import type { CelestialBodyId } from '../../types';
import './VelocityInputForm.css';

interface VelocityInputFormProps {
  templateId: CelestialBodyId;
  clickPosRender: [number, number, number];
  onConfirm: (speed: number, angleDeg: number) => void;
  onCancel: () => void;
}

const MAX_SPEED = 200;

export default function VelocityInputForm({
  templateId,
  clickPosRender,
  onConfirm,
  onCancel,
}: VelocityInputFormProps) {
  const [speed, setSpeed] = useState<string>('0');
  const [angle, setAngle] = useState<string>('0');

  const data = REAL_DATA[templateId];
  const realOrbitalSpeed = data?.orbitalSpeed;

  const speedNum = parseFloat(speed);
  const angleNum = parseFloat(angle);
  const isValid = !isNaN(speedNum) && speedNum >= 0 && !isNaN(angleNum);

  useEffect(() => {
    const scene = getSharedScene();
    if (!scene) return;

    if (!isValid || speedNum === 0) {
      removeVelocityArrow(scene);
      return;
    }

    const posPhysical = renderToPhysical(clickPosRender);
    const cappedSpeed = Math.min(speedNum, MAX_SPEED);
    const angleDeg = ((angleNum % 360) + 360) % 360;
    const clickPos = new THREE.Vector3(clickPosRender[0], clickPosRender[1], clickPosRender[2]);

    previewVelocityArrowInPlacement(scene, clickPos, cappedSpeed * 1000, angleDeg, posPhysical, [0, 0, 0]);

    return () => {
      const s = getSharedScene();
      if (s) removeVelocityArrow(s);
    };
  }, [speed, angle, clickPosRender, isValid, speedNum, angleNum]);

  const handleConfirm = () => {
    if (!isValid) return;
    const cappedSpeed = Math.min(speedNum, MAX_SPEED);
    const angleDeg = ((angleNum % 360) + 360) % 360;
    onConfirm(cappedSpeed * 1000, angleDeg);
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
        <div className="form-hint">上限 {MAX_SPEED.toLocaleString()} km/s</div>
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
        <div className="form-hint">0° = 切线方向（逆时针绕行），90° = 径向向外</div>
      </div>

      {realOrbitalSpeed !== undefined && (
        <div className="form-reference">
          真实轨道速度参考：<span>{(realOrbitalSpeed / 1000).toFixed(1)} km/s</span>（0° 切线方向）
        </div>
      )}

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
