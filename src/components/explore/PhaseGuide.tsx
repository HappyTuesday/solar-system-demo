import { useSpaceshipStore } from '../../stores/spaceshipStore';
import { useExploreStore } from '../../stores/exploreStore';
import { useCallback, useMemo } from 'react';
import { REAL_DATA } from '../../engine/constants';
import { computeLiveNavigationGuidance } from '../../engine/navigation';
import { computeMarsMissionDirective, directiveFromPhaseGuidance } from '../../engine/marsMissionNavigator';
import type { NavigationDirective } from '../../engine/marsMissionNavigator';
import { applyGuidanceDirection, applyGuidanceThrottle } from '../../stores/guidanceControls';
import './PhaseGuide.css';

// ---- Action bar rendering from PhaseGuidance ----

function formatOperation(operation: NavigationDirective['action']): string {
  switch (operation) {
    case 'wait': return '等待';
    case 'turn': return '调整方向';
    case 'ignite': return '点火';
    case 'cutoff': return '熄火';
    case 'coast': return '滑行';
    case 'capture': return '捕获制动';
    case 'circularize': return '绕飞修复';
    case 'arrived': return '已到达';
    default: return '';
  }
}

function vectorLength(v: [number, number, number]): number {
  return Math.sqrt(v[0] ** 2 + v[1] ** 2 + v[2] ** 2);
}

function angleBetweenDirections(a: [number, number, number], b: [number, number, number]): number {
  const al = vectorLength(a);
  const bl = vectorLength(b);
  if (al < 1e-20 || bl < 1e-20) return 0;
  const cos = (a[0] * b[0] + a[1] * b[1] + a[2] * b[2]) / (al * bl);
  return Math.acos(Math.max(-1, Math.min(1, cos))) * 180 / Math.PI;
}

function renderPhaseGuidance(g: NavigationDirective): React.ReactNode {
  const isBurnActive = g.thrustMagnitude > 0 && g.shouldThrust && !g.completed;
  const barClass = g.completed ? 'action-done' : isBurnActive ? 'action-go' : (g.title.includes('等待') ? 'action-wait' : 'action-warn');

  return (
    <div className={`action-bar ${barClass}`}>
      <div className="action-bar-title">{g.title}</div>
      <div className="action-bar-body">
        <div className="action-bar-line" style={{ fontWeight: 'bold', fontSize: '11px' }}>
          {g.actionText}
        </div>

        {(g.action || g.reason) && (
          <div className="action-bar-line" style={{ color: '#d8e8ff', fontSize: '11px' }}>
            {g.action ? `操作：${formatOperation(g.action)}` : ''}
            {g.reason ? ` · ${g.reason}` : ''}
          </div>
        )}

        <div className="action-bar-line" style={{ color: g.condition.satisfied ? '#88ccaa' : '#ffcc88', fontSize: '11px' }}>
          条件：{g.condition.label}: <b>{Number.isFinite(g.condition.current) ? g.condition.current.toFixed(2) : String(g.condition.current)}</b>
          {' / '}
          {Number.isFinite(g.condition.target) ? g.condition.target.toFixed(2) : String(g.condition.target)}
          {g.condition.unit ? ` ${g.condition.unit}` : ''}
        </div>

        {(g.desiredDirectionLabel || g.recommendedGear || g.recommendedThrustMagnitude != null) && (
          <div className="action-command-strip">
            {g.desiredDirectionLabel && <span>船头：{g.desiredDirectionLabel}</span>}
            {g.recommendedGear && <span>档位：{g.recommendedGear}</span>}
            {g.recommendedThrustMagnitude != null && <span>推力：{g.recommendedThrustMagnitude} MN</span>}
          </div>
        )}

        {g.metrics.map((m, i) => (
          <div key={i} className="action-bar-line" style={{
            color: m.highlight ? '#88ccaa' : m.warn ? '#ff8866' : '#ccc',
            fontWeight: m.highlight ? 'bold' : 'normal',
          }}>
            {m.label}: <b>{typeof m.current === 'number' ? m.current.toFixed(2) : m.current}</b>
            {' / '}
            {typeof m.target === 'number' ? m.target.toFixed(2) : m.target}
            {m.unit ? ` ${m.unit}` : ''}
          </div>
        ))}

        {g.sourceGuidance.estimatedRemaining != null && g.sourceGuidance.estimatedRemaining > 0 && (
          <div className="action-bar-line" style={{ color: '#ffeebb', fontWeight: 'bold', fontSize: '12px', marginTop: '4px' }}>
            ⏱ 预计等待/机动: {g.sourceGuidance.estimatedRemaining < 60
              ? `${g.sourceGuidance.estimatedRemaining.toFixed(1)} 秒`
              : `${Math.floor(g.sourceGuidance.estimatedRemaining / 60)} 分 ${Math.round(g.sourceGuidance.estimatedRemaining % 60)} 秒`}
          </div>
        )}

        {g.progress < 100 && (
          <div className="action-progress-bar">
            <div
              className={`action-progress-fill ${g.completed ? 'done' : ''}`}
              style={{ width: `${Math.min(100, g.progress)}%` }}
            />
          </div>
        )}

        {g.completed && (
          <div className="action-bar-line" style={{ color: '#44ff88', marginTop: '4px' }}>
            ✓ 阶段完成，系统自动进入下一阶段
          </div>
        )}
      </div>
    </div>
  );
}

function computeFreshGuidanceFromStore(): NavigationDirective | null {
  const current = useSpaceshipStore.getState();
  const destinationId = current.targetBodyId ?? current.navigationPlan?.destinationId ?? '';
  if (!destinationId) return null;

  if (destinationId === 'mars') {
    return computeMarsMissionDirective({
      shipPosition: current.position,
      shipVelocity: current.velocity,
      shipDirection: current.direction,
      simulatedTime: current.simulatedTime,
      thrustMagnitude: current.thrustMagnitude,
    });
  }

  return directiveFromPhaseGuidance(computeLiveNavigationGuidance({
    shipPosition: current.position,
    shipVelocity: current.velocity,
    shipDirection: current.direction,
    destinationId,
    simulatedTime: current.simulatedTime,
    thrustMagnitude: current.thrustMagnitude,
  }));
}

// ---- Main component ----

let _renderSeq = 0;

export default function PhaseGuide() {
  const navigationPlan = useSpaceshipStore(s => s.navigationPlan);
  const activePhaseIndex = useSpaceshipStore(s => s.activePhaseIndex);
  const position = useSpaceshipStore(s => s.position);
  const velocity = useSpaceshipStore(s => s.velocity);
  const direction = useSpaceshipStore(s => s.direction);
  const simulatedTime = useSpaceshipStore(s => s.simulatedTime);
  const attitudeMode = useSpaceshipStore(s => s.attitudeMode);
  const thrustMagnitude = useSpaceshipStore(s => s.thrustMagnitude);
  const setThrustMagnitude = useSpaceshipStore(s => s.setThrustMagnitude);
  const setGear = useSpaceshipStore(s => s.setGear);
  const setDirection = useSpaceshipStore(s => s.setDirection);
  const setAttitudeMode = useSpaceshipStore(s => s.setAttitudeMode);
  const exploded = useSpaceshipStore(s => s.exploded);
  const targetBodyId = useSpaceshipStore(s => s.targetBodyId);
  const timeScale = useExploreStore(s => s.timeScale);
  const renderSeq = ++_renderSeq;

  const phase = navigationPlan?.phases?.[activePhaseIndex] ?? null;
  const destinationId = targetBodyId ?? navigationPlan?.destinationId ?? '';

  const guidance = useMemo(() => {
    if (!destinationId) return null;
    if (destinationId === 'mars') {
      return computeMarsMissionDirective({
        shipPosition: position,
        shipVelocity: velocity,
        shipDirection: direction,
        simulatedTime,
        thrustMagnitude,
      });
    }
    const legacyGuidance = computeLiveNavigationGuidance({
      shipPosition: position,
      shipVelocity: velocity,
      shipDirection: direction,
      destinationId,
      simulatedTime,
      thrustMagnitude,
    });
    return directiveFromPhaseGuidance(legacyGuidance);
  }, [destinationId, position, velocity, direction, simulatedTime, thrustMagnitude]);

  const guidanceAngleDeg = guidance?.desiredDirection
    ? angleBetweenDirections(direction, guidance.desiredDirection)
    : null;

  const handleAlignToGuidance = useCallback(() => {
    applyGuidanceDirection(computeFreshGuidanceFromStore() ?? guidance, {
      setDirection,
      setAttitudeMode,
    });
  }, [guidance, setDirection, setAttitudeMode]);

  const handleApplyThrottleGuidance = useCallback(() => {
    applyGuidanceThrottle(computeFreshGuidanceFromStore() ?? guidance, {
      setThrustMagnitude,
      setGear,
    });
  }, [guidance, setThrustMagnitude, setGear]);

  if (exploded || !destinationId) {
    return null;
  }

  const phaseTitle = guidance?.title ?? phase?.name ?? '实时导航';
  const phaseTotal = navigationPlan?.phases.length ?? 1;
  const phaseNumber = navigationPlan ? activePhaseIndex + 1 : 1;

  return (
    <div className="phase-guide-container">
      <div className="phase-guide-title">
        阶段{phaseNumber}/{phaseTotal}：{phaseTitle}
      </div>

      <div className="phase-guide-overview">
        <span className="overview-item">目标：{REAL_DATA[destinationId]?.name ?? destinationId}</span>
        <span className="overview-item">姿态：{attitudeMode}</span>
        <span className="overview-item">推力：{thrustMagnitude} MN</span>
        <span className="overview-item">倍率：{timeScale}x</span>
        <span className={`overview-item live-dot${renderSeq % 30 < 15 ? ' on' : ''}`}>刷新#{renderSeq}</span>
        <span className="overview-item">{new Date(simulatedTime).toISOString().replace('T', ' ').slice(0, 19)}</span>
      </div>

      {guidance && renderPhaseGuidance(guidance)}

      {guidance?.desiredDirection && (
        <div className="phase-guide-align-panel">
          <div className="phase-guide-align-text">
            导航夹角：{guidanceAngleDeg != null ? guidanceAngleDeg.toFixed(1) : '--'}°
          </div>
          <button className="phase-guide-align-btn" type="button" onClick={handleAlignToGuidance}>
            对准导航方向
          </button>
        </div>
      )}

      {guidance && (guidance.recommendedGear || guidance.recommendedThrustMagnitude != null) && (
        <div className="phase-guide-control-panel">
          <div className="phase-guide-control-text">
            指引：{guidance.recommendedGear ?? 'N'} · {guidance.recommendedThrustMagnitude ?? 0} MN
          </div>
          <button className="phase-guide-control-btn" type="button" onClick={handleApplyThrottleGuidance}>
            按指引设置推力
          </button>
        </div>
      )}

    </div>
  );
}
