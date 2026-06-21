import { useState } from 'react';
import { useBuildStore } from '../../stores/buildStore';
import { useUIStore } from '../../stores/uiStore';
import { useHistoryStore } from '../../stores/historyStore';
import { REAL_DATA } from '../../engine/constants';
import { BUILD_DATA } from '../../engine/buildData';
import { calculateErrors } from '../../engine/scoring';
import { scaleUp, scaleDown } from '../../engine/coordinateTransform';
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

  const [editingMass, setEditingMass] = useState<string>('');
  const [expanded, setExpanded] = useState(false);

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

  const SUPERSCRIPTS: Record<string, string> = {
    '-': '⁻', '0': '⁰', '1': '¹', '2': '²', '3': '³',
    '4': '⁴', '5': '⁵', '6': '⁶', '7': '⁷', '8': '⁸', '9': '⁹',
  };

  const formatLinearScale = (s: number): string => {
    const exp = Math.floor(Math.log10(s));
    const mantissa = s / Math.pow(10, exp);
    const expStr = String(exp);
    const supExp = expStr.split('').map(c => SUPERSCRIPTS[c]).join('');
    return `${mantissa.toFixed(1)}×10${supExp}`;
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
    ? calculateErrors(buildStore.bodies, BUILD_DATA)
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
    // Re-place sun after reset
    useBuildStore.getState().placeBody(
      'sun', [0, 0, 0], [0, 0, 0], REAL_DATA.sun.mass,
      86164 / Math.abs(REAL_DATA.sun.orbital?.rotationPeriod ?? 1),
    );
    useBuildStore.getState().startBuild();
  };

  return (
    <>
    <div className={`panel-tab ${expanded ? 'hidden' : ''}`} onMouseEnter={() => setExpanded(true)}>控制 <span className="tab-arrow">◂</span></div>
    <div
      className={`control-overlay ${expanded ? 'expanded' : ''}`}
      onMouseLeave={() => setExpanded(false)}
    >
      <div className="control-panel-inner">
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
        <button className="ctrl-btn primary" onClick={buildStore.isRunning ? buildStore.pauseBuild : buildStore.resumeBuild}>
          {buildStore.isRunning ? '⏸ 暂停' : '▶ 开始'}
        </button>
        <button className="ctrl-btn success" onClick={handleComplete}>
          ✓ 完成
        </button>
      </div>

      <div className="panel-section time-scale-row">
        <span className="time-scale-label">速度倍率</span>
        <div className="time-scale-controls">
          <button
            className="ctrl-btn small"
            onClick={() => adjustTimeScale(-1e5)}
            disabled={!buildStore.startedAt || timeScale <= 1e4}
          >
            −
          </button>
          <span className="time-scale-value">{Math.round(timeScale / 1e4)}万×</span>
          <button
            className="ctrl-btn small"
            onClick={() => adjustTimeScale(1e5)}
            disabled={!buildStore.startedAt || timeScale >= 1e6}
          >
            +
          </button>
        </div>
      </div>

      <div className="panel-section space-scale-row">
        <span className="space-scale-label">空间比例</span>
        <div className="space-scale-controls">
          <button
            className="ctrl-btn small"
            onClick={() => {
              const newScale = scaleDown();
              uiStore.setLinearScaleValue(newScale);
            }}
          >
            −
          </button>
          <span className="space-scale-value">{formatLinearScale(uiStore.linearScale)}</span>
          <button
            className="ctrl-btn small"
            onClick={() => {
              const newScale = scaleUp();
              uiStore.setLinearScaleValue(newScale);
            }}
          >
            +
          </button>
        </div>
      </div>

      <div className="panel-section button-row">
        <button
          className={`ctrl-btn ${uiStore.supervisionMode ? 'active' : ''}`}
          onClick={uiStore.toggleSupervision}
        >
          👁 监督
        </button>
        <button
          className="ctrl-btn"
          onClick={handleHint}
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
          />
          <span>显示轨迹</span>
        </label>

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
      </div>
    </div>
    </>
  );
}
