import { useState } from 'react';
import { useBuildStore } from '../../stores/buildStore';
import { useUIStore } from '../../stores/uiStore';
import { useHistoryStore } from '../../stores/historyStore';
import { REAL_DATA, HINT_ORDER } from '../../engine/constants';
import { renderToPhysical, scaleUp, scaleDown, scaleSizeUp, scaleSizeDown } from '../../engine/coordinateTransform';
import { calculateErrors } from '../../engine/scoring';
import { useRestore } from '../../hooks/useRestore';
import { getSharedScene, getClickPosRender, setClickPosRender, getObservationTargetId, setObservationTargetId } from '../../rendering/threejs/cameraRef';
import { cleanupGizmos, removePreviewSphere } from '../../rendering/threejs/interaction';
import VelocityInputForm from './VelocityInputForm';
import type { CelestialBody } from '../../types';
import './ControlPanel.css';

export default function ControlPanel() {
  const buildStore = useBuildStore();
  const uiStore = useUIStore();
  const historyStore = useHistoryStore();
  const timeScale = useBuildStore(s => s.timeScale);
  const adjustTimeScale = useBuildStore(s => s.adjustTimeScale);
  const showTrails = useUIStore(s => s.showTrails);
  const trailLength = useUIStore(s => s.trailLength);
  const linearScale = useUIStore(s => s.linearScale);
  const setLinearScaleValue = useUIStore(s => s.setLinearScaleValue);
  const sizeMultiplier = useUIStore(s => s.sizeMultiplier);
  const setSizeMultiplierValue = useUIStore(s => s.setSizeMultiplierValue);
  const { isRestoring, startRestore } = useRestore();

  const [editingMass, setEditingMass] = useState<string>('');

  const formatScaleRatio = (scale: number): string => {
    const physPerRender = 1 / scale;
    if (physPerRender >= 1e12) return `1 渲染单位 ≈ ${parseFloat((physPerRender / 1e12).toFixed(1))} 万亿 米`;
    if (physPerRender >= 1e8) return `1 渲染单位 ≈ ${parseFloat((physPerRender / 1e8).toFixed(1))} 亿 米`;
    if (physPerRender >= 1e4) return `1 渲染单位 ≈ ${parseFloat((physPerRender / 1e4).toFixed(1))} 万 米`;
    return `1 渲染单位 ≈ ${physPerRender.toFixed(0)} 米`;
  };

  const formatMass = (kg: number): string => {
    if (kg >= 1e27) return `${(kg / 1e27).toFixed(2)} × 10²⁷ kg`;
    if (kg >= 1e24) return `${(kg / 1e24).toFixed(2)} × 10²⁴ kg`;
    if (kg >= 1e21) return `${(kg / 1e21).toFixed(2)} × 10²¹ kg`;
    return `${kg.toExponential(2)} kg`;
  };

  const formatDistance = (m: number): string => {
    if (m >= 1e12) return `${(m / 1e12).toFixed(2)} 万亿 km`;
    if (m >= 1e9) return `${(m / 1e9).toFixed(2)} 亿 km`;
    if (m >= 1e6) return `${(m / 1e6).toFixed(0)} km`;
    return `${m.toFixed(0)} m`;
  };

  const formatTime = (ms: number): string => {
    const totalSeconds = Math.floor(ms / 1000);
    const hours = Math.floor(totalSeconds / 3600);
    const minutes = Math.floor((totalSeconds % 3600) / 60);
    const seconds = totalSeconds % 60;
    return `${String(hours).padStart(2, '0')}:${String(minutes).padStart(2, '0')}:${String(seconds).padStart(2, '0')}`;
  };

  const formatSimTime = (seconds: number): string => {
    const days = seconds / 86400;
    if (days < 1) return `${(days * 24).toFixed(1)} 小时`;
    if (days < 365) return `${days.toFixed(1)} 天`;
    return `${(days / 365).toFixed(2)} 年`;
  };

  const handleComplete = () => {
    const result = buildStore.completeBuild();
    if (!result) return;

    const record = {
      id: buildStore.id,
      createdAt: buildStore.startedAt ?? Date.now(),
      completedAt: Date.now(),
      status: 'completed' as const,
      score: result.score,
      buildTimeMs: buildStore.buildElapsedMs,
      snapshot: JSON.stringify(buildStore.getSnapshot()),
    };

    historyStore.saveCurrentRecord(record);
    historyStore.loadRecords();
    uiStore.setShowScoreModal(true);
  };

  const handleHint = () => {
    uiStore.setHint(true);
    uiStore.advanceHint();
  };

  const selectedBody: CelestialBody | null = uiStore.selectedBodyIds.length === 1
    ? buildStore.bodies.find(b => b.id === uiStore.selectedBodyIds[0]) ?? null
    : null;

  const errors = uiStore.supervisionMode
    ? calculateErrors(buildStore.bodies)
    : null;

  const handleDeleteBody = () => {
    if (selectedBody) {
      buildStore.removeBody(selectedBody.id);
      uiStore.setSelectedBodyIds([]);
    }
  };

  const handleMassChange = () => {
    if (selectedBody && editingMass) {
      const mass = parseFloat(editingMass);
      if (!isNaN(mass) && mass > 0) {
        buildStore.modifyMass(selectedBody.id, mass);
      }
    }
  };

  const handleNewBuild = () => {
    buildStore.resetBuild();
    uiStore.resetUI();
    historyStore.setCurrentRecordId(null);
  };

  return (
    <div className="control-panel">
      <div className="panel-section">
        <div className="timer-row">
          <div className="timer-display">
            <span className="timer-label">搭建</span>
            <span className="timer-value">{formatTime(buildStore.buildElapsedMs)}</span>
          </div>
          <div className="timer-display">
            <span className="timer-label">模拟</span>
            <span className="timer-value">{formatSimTime(buildStore.simulatedTime)}</span>
          </div>
        </div>
      </div>

      <div className="panel-section button-row">
        <button
          className="ctrl-btn restore"
          onClick={startRestore}
          disabled={isRestoring}
        >
          {isRestoring ? '还原中...' : '真实还原'}
        </button>
      </div>

      {uiStore.selectedToolId && !uiStore.isPlacing && (() => {
        const toolData = REAL_DATA[uiStore.selectedToolId];
        if (!toolData) return null;
        const pos = uiStore.previewPosition;

        return (
          <div className="panel-section placement-info">
            <div className="info-header" style={{ color: '#ffaa00' }}>
              释放模式
            </div>
            <div className="info-row">
              <span>天体</span>
              <span style={{ color: '#fff' }}>{toolData.name}</span>
            </div>
            <div className="info-row">
              <span>质量</span>
              <span>{formatMass(toolData.mass)}</span>
            </div>
            <div className="info-row">
              <span>真实半径</span>
              <span>{formatDistance(toolData.radius)}</span>
            </div>
            <div className="info-row">
              <span>鼠标位置</span>
              <span style={{ fontSize: 10, fontFamily: 'monospace', color: '#888' }}>
                {pos ? (() => {
                  const physPos = renderToPhysical([pos[0], pos[1], 0]);
                  const dist = Math.sqrt(physPos[0] * physPos[0] + physPos[1] * physPos[1]);
                  return formatDistance(dist);
                })() : '移动鼠标选择位置...'}
              </span>
            </div>
            <div className="placement-hint">
              在画布上点击放置天体
            </div>
          </div>
        );
      })()}

      {uiStore.isPlacing && uiStore.selectedToolId && (() => {
        const clickPos = getClickPosRender();
        if (!clickPos) return null;

        const handleConfirm = (speed: number, angleDeg: number) => {
          const toolId = uiStore.selectedToolId!;
          const physPos = renderToPhysical(clickPos);
          const angleRad = (angleDeg * Math.PI) / 180;

          let vel: [number, number, number] = [0, 0, 0];
          if (speed > 0) {
            const rx = physPos[0];
            const ry = physPos[1];
            const rz = physPos[2];
            const dist = Math.sqrt(rx * rx + ry * ry + rz * rz);
            if (dist >= 1) {
              const radialX = rx / dist;
              const radialY = ry / dist;
              const radialZ = rz / dist;
              const tLen = Math.sqrt(radialX * radialX + radialY * radialY);
              const tangentX = tLen < 1e-10 ? 0 : -radialY / tLen;
              const tangentY = tLen < 1e-10 ? 1 : radialX / tLen;
              const tangentZ = 0;
              const cosA = Math.cos(angleRad);
              const sinA = Math.sin(angleRad);
              vel = [
                speed * (cosA * tangentX + sinA * radialX),
                speed * (cosA * tangentY + sinA * radialY),
                speed * (cosA * tangentZ + sinA * radialZ),
              ];
            }
          }

          const data = REAL_DATA[toolId];
          buildStore.placeBody(toolId, physPos, vel, data?.mass ?? 1e24);
          buildStore.resumeBuild();

          if (uiStore.showHint) {
            const hintedId = HINT_ORDER[uiStore.hintIndex % HINT_ORDER.length];
            if (toolId === hintedId) uiStore.setHint(false);
          }

          const scene = getSharedScene();
          if (scene) {
            cleanupGizmos(scene);
          }
          uiStore.setSelectedTool(null);
          uiStore.setIsPlacing(false);
          setClickPosRender(null);
        };

        const handleCancel = () => {
          const scene = getSharedScene();
          if (scene) {
            removePreviewSphere(scene);
          }
          uiStore.setIsPlacing(false);
          setClickPosRender(null);
        };

        return (
          <VelocityInputForm
            templateId={uiStore.selectedToolId!}
            clickPosRender={clickPos}
            onConfirm={handleConfirm}
            onCancel={handleCancel}
          />
        );
      })()}

      <div className="panel-section button-row">
        {!buildStore.startedAt ? (
          <div className="hint-text">请先在画布上放置太阳</div>
        ) : (
          <>
            <button className="ctrl-btn primary" onClick={buildStore.isRunning ? buildStore.pauseBuild : buildStore.resumeBuild} disabled={isRestoring}>
              {buildStore.isRunning ? '⏸ 暂停' : '▶ 开始'}
            </button>
            <button className="ctrl-btn success" onClick={handleComplete} disabled={isRestoring}>
              ✓ 完成
            </button>
          </>
        )}
      </div>

      <div className="panel-section time-scale-row">
        <span className="time-scale-label">速度倍率</span>
        <div className="time-scale-controls">
          <button
            className="ctrl-btn small"
            onClick={() => adjustTimeScale(-1e5)}
            disabled={!buildStore.startedAt || isRestoring || timeScale <= 1e4}
          >
            −
          </button>
          <span className="time-scale-value">{Math.round(timeScale / 1e4)}万×</span>
          <button
            className="ctrl-btn small"
            onClick={() => adjustTimeScale(1e5)}
            disabled={!buildStore.startedAt || isRestoring || timeScale >= 1e6}
          >
            +
          </button>
        </div>
      </div>

      <div className="panel-section button-row">
        <button
          className={`ctrl-btn ${uiStore.supervisionMode ? 'active' : ''}`}
          onClick={uiStore.toggleSupervision}
          disabled={!buildStore.startedAt || isRestoring}
        >
          👁 监督
        </button>
        <button
          className="ctrl-btn"
          onClick={handleHint}
          disabled={!buildStore.startedAt || isRestoring}
        >
          💡 提示
        </button>
      </div>

      <div className="panel-section trail-controls">
        <label className="trail-toggle">
          <input
            type="checkbox"
            checked={showTrails}
            onChange={e => uiStore.setShowTrails(e.target.checked)}
            disabled={isRestoring}
          />
          <span>显示轨迹</span>
        </label>
        {showTrails && (
          <div className="trail-length-row">
            <span className="trail-length-label">轨迹长度 {trailLength.toFixed(1)}</span>
            <input
              type="range"
              className="trail-length-slider"
              min="0.1"
              max="1.0"
              step="0.1"
              value={trailLength}
              onChange={e => uiStore.setTrailLength(parseFloat(e.target.value))}
              disabled={isRestoring}
            />
          </div>
        )}
      </div>

      <div className="panel-section trail-controls">
          <div className="scale-slider-row">
            <span className="scale-slider-label">{formatScaleRatio(linearScale)}</span>
            <div className="scale-btn-row">
              <button
                className="ctrl-btn small"
                onClick={() => {
                  const v = scaleDown();
                  setLinearScaleValue(v);
                }}
                disabled={isRestoring}
              >
                −
              </button>
              <button
                className="ctrl-btn small"
                onClick={() => {
                  const v = scaleUp();
                  setLinearScaleValue(v);
                }}
                disabled={isRestoring}
              >
                +
              </button>
            </div>
          </div>
          <div className="scale-slider-row">
            <span className="scale-slider-label">天体放大 {sizeMultiplier}×</span>
            <div className="scale-btn-row">
              <button
                className="ctrl-btn small"
                onClick={() => {
                  const v = scaleSizeDown();
                  setSizeMultiplierValue(v);
                }}
                disabled={isRestoring}
              >
                −
              </button>
              <button
                className="ctrl-btn small"
                onClick={() => {
                  const v = scaleSizeUp();
                  setSizeMultiplierValue(v);
                }}
                disabled={isRestoring}
              >
                +
              </button>
            </div>
          </div>
      </div>

      <div className="panel-section button-row">
        <button
          className="ctrl-btn small"
          onClick={buildStore.undo}
          disabled={buildStore.undoStack.length === 0 || isRestoring}
        >
          ↩ 撤销
        </button>
        <button
          className="ctrl-btn small"
          onClick={buildStore.redo}
          disabled={buildStore.redoStack.length === 0 || isRestoring}
        >
          ↪ 重做
        </button>
        <button className="ctrl-btn small danger" onClick={handleNewBuild} disabled={isRestoring}>
          ⊗ 新建
        </button>
      </div>

      {selectedBody && (
        <div className="panel-section selected-info">
          <div className="info-header">
            已选中: {REAL_DATA[selectedBody.templateId]?.name ?? selectedBody.templateId}
          </div>
          <div className="info-row">
            <span>质量 (kg)</span>
            <input
              type="number"
              className="mass-input"
              value={editingMass || selectedBody.mass}
              onChange={e => setEditingMass(e.target.value)}
              onBlur={handleMassChange}
              onKeyDown={e => e.key === 'Enter' && handleMassChange()}
            />
          </div>
          <div className="info-row">
            <span>速度 (m/s)</span>
            <span>{Math.sqrt(selectedBody.velocity[0] ** 2 + selectedBody.velocity[1] ** 2 + selectedBody.velocity[2] ** 2).toFixed(0)}</span>
          </div>
          <div className="info-row">
            <span>自转速度</span>
            <input
              type="range"
              min="0"
              max="5"
              step="0.1"
              value={selectedBody.rotationSpeed}
              onChange={e => buildStore.modifyRotationSpeed(selectedBody.id, parseFloat(e.target.value))}
            />
          </div>
          <button
            className="ctrl-btn"
            onClick={() => {
              if (getObservationTargetId() === selectedBody.id) {
                setObservationTargetId(null);
              } else {
                setObservationTargetId(selectedBody.id);
              }
            }}
            disabled={isRestoring}
          >
            {getObservationTargetId() === selectedBody.id ? '取消观测目标' : '设为观测目标'}
          </button>
          <button className="ctrl-btn danger" onClick={handleDeleteBody} disabled={isRestoring}>删除天体</button>
        </div>
      )}

      {errors && (
        <div className="panel-section errors-panel">
          <div className="info-header">监督模式 - 实时误差</div>
          {Object.entries(errors).map(([id, e]) => (
            <div key={id} className="error-row">
              <span className="error-name">{e.name}</span>
              <span className={`error-value ${e.orbitRadiusError < 5 ? 'green' : e.orbitRadiusError < 20 ? 'yellow' : 'red'}`}>
                轨道: {e.orbitRadiusError}%
              </span>
              <span className={`error-value ${e.massError < 5 ? 'green' : e.massError < 20 ? 'yellow' : 'red'}`}>
                质量: {e.massError}%
              </span>
              <span className={`error-value ${e.speedError < 5 ? 'green' : e.speedError < 20 ? 'yellow' : 'red'}`}>
                速度: {e.speedError}%
              </span>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}
