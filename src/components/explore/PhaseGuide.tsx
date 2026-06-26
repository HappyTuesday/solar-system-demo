import { useSpaceshipStore } from '../../stores/spaceshipStore';
import './PhaseGuide.css';

function getPhaseGuide(phaseName: string, phaseIndex: number): string {
  if (phaseName.startsWith('等待')) {
    return '保持当前轨道，等待行星对齐\n无需推力操作\n到达发射窗口后自动提示';
  }
  if (phaseName.includes('提升远日点') || phaseName.includes('降低近日点')) {
    return '开启正向推力，沿飞行方向加速\n推力调至 100MN\n观察导航地图绿色轨道线\n半长轴达标后自动进入下一阶段';
  }
  if (phaseName.includes('转移轨道滑行')) {
    return '关闭推力，沿转移轨道惯性滑行\n耐心等待约半周期\n接近目标天体后自动提示';
  }
  if (phaseName.includes('捕获') && phaseName.includes('制动')) {
    return '开启反向推力，沿飞行反方向减速\n推力调至 100MN\n减速至目标轨道参数后自动进入下一阶段';
  }
  if (phaseName.includes('捕获') && phaseName.includes('加速')) {
    return '开启正向推力，沿飞行方向加速\n推力调至 100MN\n加速至目标轨道参数后自动进入下一阶段';
  }
  if (phaseName.includes('绕飞圆化')) {
    return '微调推力至 50MN\n逐步将轨道偏心率降至 0\n建立稳定的圆形绕飞轨道';
  }
  return '';
}

export default function PhaseGuide() {
  const navigationPlan = useSpaceshipStore(s => s.navigationPlan);
  const activePhaseIndex = useSpaceshipStore(s => s.activePhaseIndex);
  const exploded = useSpaceshipStore(s => s.exploded);

  if (exploded || !navigationPlan || activePhaseIndex < 0 || activePhaseIndex >= navigationPlan.phases.length) {
    return null;
  }

  const phase = navigationPlan.phases[activePhaseIndex];
  const guide = getPhaseGuide(phase.name, activePhaseIndex);

  return (
    <div className="phase-guide-container">
      <div className="phase-guide-title">当前阶段操作指引</div>
      <div className="phase-guide-phase-name">
        阶段{activePhaseIndex + 1}：{phase.name}
      </div>
      <div className="phase-guide-instruction">
        {guide.split('\n').map((line, i) => (
          <span key={i}>{line}</span>
        ))}
      </div>
      {phase.expectedWaitDays && phase.expectedWaitDays > 0 ? (
        <div className="phase-guide-note">
          预计等待约{' '}
          {phase.expectedWaitDays >= 1
            ? `${Math.round(phase.expectedWaitDays)} 天`
            : phase.expectedWaitDays * 24 >= 1
              ? `${Math.round(phase.expectedWaitDays * 24)} 小时`
              : `${Math.round(phase.expectedWaitDays * 1440)} 分`}
        </div>
      ) : null}
      {phase.thrustDirection !== 'none' && (
        <div className="phase-guide-note">
          预期 Δv：{phase.deltaV.toFixed(3)} AU/s
          <br />
          推力方向：{phase.thrustDirection === 'forward' ? '正向（飞行方向）' : '反向（减速）'}
        </div>
      )}
    </div>
  );
}
