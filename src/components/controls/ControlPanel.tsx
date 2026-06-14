import { useEffect, useRef, useState } from 'react';
import { useBuildStore } from '../../stores/buildStore';
import { useUIStore } from '../../stores/uiStore';
import { useHistoryStore } from '../../stores/historyStore';
import { REAL_DATA } from '../../engine/constants';
import { renderToPhysical } from '../../engine/coordinateTransform';
import { calculateErrors } from '../../engine/scoring';
import type { CelestialBody } from '../../types';
import './ControlPanel.css';

export default function ControlPanel() {
  const buildStore = useBuildStore();
  const uiStore = useUIStore();
  const historyStore = useHistoryStore();

  const [editingMass, setEditingMass] = useState<string>('');

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

  const formatSpeed = (ms: number): string => {
    if (ms >= 1000) return `${(ms / 1000).toFixed(1)} km/s`;
    return `${ms.toFixed(0)} m/s`;
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

      {uiStore.selectedToolId && (() => {
        const toolData = REAL_DATA[uiStore.selectedToolId];
        if (!toolData) return null;
        const pos = uiStore.previewPosition;
        const isDragging = uiStore.isPlacing;

        return (
          <div className="panel-section placement-info">
            <div className="info-header" style={{ color: '#ffaa00' }}>
              {isDragging ? '正在设定初速度' : '释放模式'}
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
            {isDragging ? (
              <>
                <div className="info-row">
                  <span>释放位置</span>
                  <span style={{ fontSize: 10, fontFamily: 'monospace' }}>
                    {pos ? (() => {
                      const physPos = renderToPhysical([pos[0], pos[1], pos[2]]);
                      const dist = Math.sqrt(physPos[0] * physPos[0] + physPos[1] * physPos[1]);
                      return formatDistance(dist);
                    })() : '-'}
                  </span>
                </div>
                <div className="info-row">
                  <span>初速度</span>
                  <span style={{ color: '#00ff88', fontFamily: 'monospace', fontSize: 13 }}>
                    {formatSpeed(uiStore.previewSpeed)}
                  </span>
                </div>
              </>
            ) : (
              <div className="info-row">
                <span>鼠标位置</span>
                <span style={{ fontSize: 10, fontFamily: 'monospace', color: '#888' }}>
                  {pos ? (() => {
                    const physPos = renderToPhysical([pos[0], pos[1], pos[2]]);
                    const dist = Math.sqrt(physPos[0] * physPos[0] + physPos[1] * physPos[1]);
                    return formatDistance(dist);
                  })() : '移动鼠标选择位置...'}
                </span>
              </div>
            )}
            <div className="placement-hint">
              {isDragging ? '拖动鼠标设定初速度' : '在画布上点击放置天体'}
            </div>
          </div>
        );
      })()}

      <div className="panel-section button-row">
        {!buildStore.startedAt ? (
          <div className="hint-text">请先在画布上放置太阳</div>
        ) : (
          <>
            <button className="ctrl-btn primary" onClick={buildStore.isRunning ? buildStore.pauseBuild : buildStore.resumeBuild}>
              {buildStore.isRunning ? '⏸ 暂停' : '▶ 开始'}
            </button>
            <button className="ctrl-btn success" onClick={handleComplete}>
              ✓ 完成
            </button>
          </>
        )}
      </div>

      <div className="panel-section button-row">
        <button
          className={`ctrl-btn ${uiStore.supervisionMode ? 'active' : ''}`}
          onClick={uiStore.toggleSupervision}
          disabled={!buildStore.startedAt}
        >
          👁 监督
        </button>
        <button
          className="ctrl-btn"
          onClick={handleHint}
          disabled={!buildStore.startedAt}
        >
          💡 提示
        </button>
      </div>

      <div className="panel-section button-row">
        <button
          className="ctrl-btn small"
          onClick={buildStore.undo}
          disabled={buildStore.undoStack.length === 0}
        >
          ↩ 撤销
        </button>
        <button
          className="ctrl-btn small"
          onClick={buildStore.redo}
          disabled={buildStore.redoStack.length === 0}
        >
          ↪ 重做
        </button>
        <button className="ctrl-btn small danger" onClick={handleNewBuild}>
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
          <button className="ctrl-btn danger" onClick={handleDeleteBody}>删除天体</button>
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
