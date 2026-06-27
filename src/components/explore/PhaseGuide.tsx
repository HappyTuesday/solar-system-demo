import { useSpaceshipStore } from '../../stores/spaceshipStore';
import { checkWindowReady, getOrbitingBodySemiMajorAxis } from '../../engine/navigation';
import { REAL_DATA, MU_SUN_AU } from '../../engine/constants';
import { julianDate, solveKepler, trueAnomaly, stateVectors, orbitalPeriod, meanAnomalyAtTime } from '../../engine/orbital';
import './PhaseGuide.css';

const SCALE = 1 / 1.496e11;
const MU_SUN_VALUE = 1.32712440018e20;
const AU_TO_KM = 1.496e8;

function computeBodyStateAU(templateId: string, jd: number): { x: number; y: number } | null {
  const data = REAL_DATA[templateId];
  if (!data?.semiMajorAxis || !data?.orbital) return null;
  const o = data.orbital;
  const period = orbitalPeriod(data.semiMajorAxis, MU_SUN_VALUE);
  const M = meanAnomalyAtTime(o.meanAnomalyAtEpoch, period, o.epoch, jd);
  const Mmod = ((M % (2 * Math.PI)) + 2 * Math.PI) % (2 * Math.PI);
  const E = solveKepler(Mmod, o.eccentricity);
  const nu = trueAnomaly(E, o.eccentricity);
  const sv = stateVectors(data.semiMajorAxis, o.eccentricity, o.inclination, o.longitudeAscendingNode, o.argumentOfPeriapsis, nu, MU_SUN_VALUE);
  return { x: sv.position[0] * SCALE, y: sv.position[1] * SCALE };
}

function getPhaseGuide(phaseName: string, windowReady: boolean): string {
  if (phaseName.startsWith('等待')) {
    if (windowReady) {
      return '发射窗口已到达\n立即开启正向推力点火\n点火后将自动进入下一阶段';
    }
    return '保持当前轨道，等待行星对齐\n无需推力操作\n到达发射窗口后将自动提示';
  }
  if (phaseName.includes('提升远日点') || phaseName.includes('降低近日点')) {
    return '开启正向推力，沿飞行方向加速\n推力调至 100MN\n观察导航地图绿色轨道线\n半长轴达标后自动进入下一阶段';
  }
  if (phaseName.includes('转移轨道滑行')) {
    return '关闭推力，沿转移轨道惯性滑行\n耐心等待约半周期\n接近目标天体后将自动提示';
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

function formatWaitDetail(days: number): string {
  if (days <= 0.00001) return '即将就绪';
  const totalSec = days * 86400;
  if (totalSec < 60) return `${Math.max(1, Math.round(totalSec))} 秒`;
  if (totalSec < 3600) return `${Math.round(totalSec / 60)} 分`;
  if (totalSec < 86400) return `${Math.round(totalSec / 3600)} 小时`;
  return `${Math.round(days)} 天`;
}

export default function PhaseGuide() {
  const navigationPlan = useSpaceshipStore(s => s.navigationPlan);
  const activePhaseIndex = useSpaceshipStore(s => s.activePhaseIndex);
  const windowReady = useSpaceshipStore(s => s.windowReady);
  const windowRemainingDays = useSpaceshipStore(s => s.windowRemainingDays);
  const orbitingBodyId = useSpaceshipStore(s => s.orbitingBodyId);
  const position = useSpaceshipStore(s => s.position);
  const velocity = useSpaceshipStore(s => s.velocity);
  const simulatedTime = useSpaceshipStore(s => s.simulatedTime);
  const exploded = useSpaceshipStore(s => s.exploded);

  if (exploded || !navigationPlan || activePhaseIndex < 0 || activePhaseIndex >= navigationPlan.phases.length) {
    return null;
  }

  const phase = navigationPlan.phases[activePhaseIndex];
  const guide = getPhaseGuide(phase.name, windowReady);

  // Debug info for waiting phase
  let debugLines: string[] = [];
  if (phase.name.startsWith('等待')) {
    const aStableAU = getOrbitingBodySemiMajorAxis(position, simulatedTime);
    const destData = REAL_DATA[navigationPlan.destinationId];
    const aTargetAU = destData?.semiMajorAxis ? destData.semiMajorAxis / 1.496e11 : 0;
    const aTransferAU = (aStableAU + aTargetAU) / 2;
    const goingOutward = aTargetAU > aStableAU;

    const omegaShip = Math.sqrt(MU_SUN_AU / (aStableAU * aStableAU * aStableAU));
    const omegaTarget = Math.sqrt(MU_SUN_AU / (aTargetAU * aTargetAU * aTargetAU));
    const transferTimeDays = (Math.PI * Math.sqrt((aTransferAU * aTransferAU * aTransferAU) / MU_SUN_AU)) / 86400;
    const synodicPeriodDays = (2 * Math.PI / Math.abs(omegaShip - omegaTarget)) / 86400;

    const window = checkWindowReady(position, velocity, navigationPlan, activePhaseIndex, simulatedTime);

    // Phase angle calculations in degrees
    const jd = julianDate(simulatedTime);
    const shipAngleDeg = ((Math.atan2(position[1], position[0]) * 180 / Math.PI) + 360) % 360;

    const targetPos = computeBodyStateAU(navigationPlan.destinationId, jd);
    const targetAngleDeg = targetPos
      ? ((Math.atan2(targetPos.y, targetPos.x) * 180 / Math.PI) + 360) % 360
      : 0;

    const currentPhaseDiffDeg = goingOutward
      ? ((shipAngleDeg - targetAngleDeg + 360) % 360)
      : ((targetAngleDeg - shipAngleDeg + 360) % 360);

    const targetTravelAngleDeg = (omegaTarget *
      Math.PI * Math.sqrt((aTransferAU * aTransferAU * aTransferAU) / MU_SUN_AU)) * 180 / Math.PI;
    const requiredPhaseDeg = goingOutward
      ? (180 - targetTravelAngleDeg + 360) % 360
      : (targetTravelAngleDeg - 180 + 360) % 360;

    const departureName = orbitingBodyId ? (REAL_DATA[orbitingBodyId]?.name || '飞船') : '飞船';
    const destName = destData?.name || '目标';

    debugLines = [
      `${departureName} 日心角：${shipAngleDeg.toFixed(2)}°`,
      `${destName} 日心角：${targetAngleDeg.toFixed(1)}°`,
      `相位差：${currentPhaseDiffDeg.toFixed(2)}°（窗口需 ≈ ${requiredPhaseDeg.toFixed(1)}° ± 6°）`,
      `转移耗时 ≈ ${Math.round(transferTimeDays)} 天，会合周期 ≈ ${Math.round(synodicPeriodDays)} 天`,
      `方向：${goingOutward ? '向外' : '向内'}转移`,
      `实时剩余 ≈ ${formatWaitDetail(window.remainingDays)}`,
    ];
  }

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
      {phase.name.startsWith('等待') && (
        <div className="phase-guide-note">
          {windowReady
            ? '发射窗口已就绪 · 请点火'
            : `预计等待约 ${formatWaitDetail(windowRemainingDays > 0 ? windowRemainingDays : (phase.expectedWaitDays ?? 0))}`}
        </div>
      )}
      {phase.thrustDirection !== 'none' && (
        <div className="phase-guide-note">
          预期 Δv：{phase.deltaV.toFixed(4)} AU/s（{(phase.deltaV * AU_TO_KM).toFixed(1)} km/s）
          <br />
          推力方向：{phase.thrustDirection === 'forward' ? '正向（飞行方向）' : '反向（减速）'}
        </div>
      )}
      {debugLines.length > 0 && (
        <div className="phase-guide-note" style={{ marginTop: '8px', color: '#445566' }}>
          {debugLines.map((line, i) => (
            <span key={i}>{line}<br /></span>
          ))}
        </div>
      )}
    </div>
  );
}
