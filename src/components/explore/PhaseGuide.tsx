import { useSpaceshipStore } from '../../stores/spaceshipStore';
import { useExploreStore } from '../../stores/exploreStore';
import { useEffect, useRef } from 'react';
import { REAL_DATA, MU_SUN_AU, AU_TO_KM } from '../../engine/constants';
import { julianDate } from '../../engine/orbital';
import { computeBodyState } from '../../engine/navigation';
import './PhaseGuide.css';

function formatWaitDetail(days: number): string {
  if (days <= 0.00001) return '即将就绪';
  const totalSec = days * 86400;
  if (totalSec < 60) return `${Math.max(1, Math.round(totalSec))} 秒`;
  if (totalSec < 3600) return `${Math.round(totalSec / 60)} 分`;
  if (totalSec < 86400) return `${Math.round(totalSec / 3600)} 小时`;
  return `${Math.round(days)} 天`;
}

function getSubStepIcon(status: string): string {
  if (status === 'completed') return '✓';
  if (status === 'active') return '→';
  return '○';
}

export default function PhaseGuide() {
  const navigationPlan = useSpaceshipStore(s => s.navigationPlan);
  const activePhaseIndex = useSpaceshipStore(s => s.activePhaseIndex);
  const activeSubStepIndex = useSpaceshipStore(s => s.activeSubStepIndex);
  const windowReady = useSpaceshipStore(s => s.windowReady);
  const windowRemainingDays = useSpaceshipStore(s => s.windowRemainingDays);
  const position = useSpaceshipStore(s => s.position);
  const simulatedTime = useSpaceshipStore(s => s.simulatedTime);
  const exploded = useSpaceshipStore(s => s.exploded);
  const timeScale = useExploreStore(s => s.timeScale);
  const setTimeScale = useExploreStore(s => s.setTimeScale);
  const fastForwardRef = useRef<number | null>(null);

  useEffect(() => {
    if (windowReady && fastForwardRef.current != null) {
      setTimeScale(fastForwardRef.current);
      fastForwardRef.current = null;
    }
  }, [windowReady, setTimeScale]);

  const handleFastForward = () => {
    if (windowReady || fastForwardRef.current != null) return;
    fastForwardRef.current = timeScale;
    setTimeScale(1000000);
  };

  if (exploded || !navigationPlan || activePhaseIndex < 0 || activePhaseIndex >= navigationPlan.phases.length) {
    return null;
  }

  const phase = navigationPlan.phases[activePhaseIndex];
  const hasWaitingSubStep = phase.subSteps.some(s => s.type === 'wait_window');

  return (
    <div className="phase-guide-container">
      <div className="phase-guide-title">
        阶段{activePhaseIndex + 1}：{phase.name} 操作指引
      </div>

      {phase.subSteps.map((subStep, idx) => {
        const status: 'completed' | 'active' | 'pending' =
          idx < activeSubStepIndex ? 'completed' :
          idx === activeSubStepIndex ? 'active' : 'pending';
        const icon = getSubStepIcon(status);
        const lines = subStep.action.description.split('\n');

        return (
          <div key={subStep.id} className={`substep-item ${status}`}>
            <span className={`substep-icon ${status}`}>{icon}</span>
            <div className="substep-content">
              <div className="substep-name">
                {lines[0]}
              </div>
              {status === 'active' && (
                <>
                  <div className="substep-detail">
                    {lines.slice(1).map((line, i) => (
                      <span key={i} className="substep-line">{line}</span>
                    ))}
                  </div>
                  <div className={`substep-condition ${subStep.condition.met ? 'met' : 'unmet'}`}>
                    {subStep.condition.met ? '✓ ' : '✗ '}
                    {subStep.condition.description}
                    {subStep.condition.met ? '（当前满足）' : '（等待满足...）'}
                  </div>
                  {subStep.type === 'wait_window' && (
                    <div className="substep-wait-info">
                      {windowReady
                        ? '发射窗口已就绪，操作将自动进入下一阶段'
                        : `预计等待约 ${formatWaitDetail(windowRemainingDays > 0 ? windowRemainingDays : (phase.expectedWaitDays ?? 0))}`}
                    </div>
                  )}
                </>
              )}
              {status === 'pending' && (
                <div className="substep-pending-desc">
                  {subStep.action.completionCriteria}
                </div>
              )}
              {status === 'completed' && (
                <div className="substep-completed-desc">
                  ✓ 已完成：{subStep.action.completionCriteria}
                </div>
              )}
            </div>
          </div>
        );
      })}

      {hasWaitingSubStep && !windowReady && (
        <div className="phase-guide-fast-forward" onClick={handleFastForward}>
          ⏩ 快进到发射窗口
        </div>
      )}
    </div>
  );
}
