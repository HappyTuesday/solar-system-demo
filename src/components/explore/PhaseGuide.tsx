import { useSpaceshipStore } from '../../stores/spaceshipStore';
import { useExploreStore } from '../../stores/exploreStore';
import { useEffect, useRef } from 'react';
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
  const timeScale = useExploreStore(s => s.timeScale);
  const setTimeScale = useExploreStore(s => s.setTimeScale);
  const fastForwardRef = useRef<number | null>(null);

  // Auto-restore time scale when window becomes ready during fast-forward
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

    // Planetary alignment: how long until phase match, and window duration
    let phaseWaitDays = 0;
    const phaseDiff = Math.abs(currentPhaseDiffDeg - requiredPhaseDeg);
    const wrapDiff = Math.min(phaseDiff, 360 - phaseDiff);
    if (wrapDiff > 6) {
      phaseWaitDays = (wrapDiff / 360) * synodicPeriodDays;
    }
    // Window stays open for ~12° of phase = 12/360 * synodicPeriod days
    const windowDurationDays = (12 / 360) * synodicPeriodDays;

    // Ship departure tangent: time until ship is on correct side of orbit
    let departureWaitMins = 0;
    let departureReady = true;
    if (orbitingBodyId && orbitingBodyId !== 'sun' && orbitingBodyId !== navigationPlan.destinationId) {
      const bodyState = computeBodyStateAU(orbitingBodyId, jd);
      if (bodyState) {
        const rx = position[0] - bodyState.x;
        const ry = position[1] - bodyState.y;
        const bodyAngle = Math.atan2(bodyState.y, bodyState.x);
        const bodyVelDirX = -Math.sin(bodyAngle);
        const bodyVelDirY = Math.cos(bodyAngle);
        const dot = rx * bodyVelDirX + ry * bodyVelDirY;
        const rr = Math.sqrt(rx * rx + ry * ry);
        const cosAngle = rr > 1e-12 ? dot / rr : 0;

        departureReady = goingOutward ? cosAngle > -0.3 : cosAngle < 0.3;

        if (!departureReady) {
          const bodyData = REAL_DATA[orbitingBodyId];
          const muBody = 6.674e-11 * (bodyData?.mass ?? 0) / (1.496e11 * 1.496e11 * 1.496e11);
          if (muBody > 0 && rr > 0) {
            const bodyOmega = Math.sqrt(muBody / (rr * rr * rr));
            const targetCos = goingOutward ? 1.0 : -1.0;
            const curAngle = Math.acos(Math.max(-1, Math.min(1, cosAngle)));
            const tgtAngle = Math.acos(Math.max(-1, Math.min(1, targetCos)));
            const waitSec = Math.abs(tgtAngle - curAngle) / bodyOmega;
            departureWaitMins = Math.max(0, waitSec / 60);
          }
        }
      }
    }

    const departureName = orbitingBodyId ? (REAL_DATA[orbitingBodyId]?.name || '飞船') : '飞船';
    const destName = destData?.name || '目标';

    debugLines = [
      `【行星对齐窗口】${departureName}→${destName}`,
      `${destName} 日心角：${targetAngleDeg.toFixed(1)}°，${departureName}日心角：${shipAngleDeg.toFixed(1)}°`,
      `相位差：${currentPhaseDiffDeg.toFixed(1)}° / 需 ≈ ${requiredPhaseDeg.toFixed(0)}°`,
      phaseWaitDays > 0
        ? `预计 ${Math.round(phaseDiff < 180 ? phaseWaitDays : synodicPeriodDays - phaseWaitDays)} 天后进入窗口`
        : `已进入窗口 · 剩余约 ${Math.round(windowDurationDays)} 天`,
      `【飞船出发条件】绕${departureName}轨道相位`,
      departureReady ? '✓ 出发切线已就绪' : `✗ 需到达正确出发位置 · 最多等待约 ${departureWaitMins > 0 ? Math.round(departureWaitMins) : 1} 分`,
      `转移耗时 ≈ ${Math.round(transferTimeDays)} 天，会合周期 ≈ ${Math.round(synodicPeriodDays)} 天`,
      `方向：${goingOutward ? '向外' : '向内'}转移`,
      `综合剩余 ≈ ${formatWaitDetail(window.remainingDays)}`,
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
      {phase.name.startsWith('等待') && !windowReady && (
        <div
          className="phase-guide-note"
          style={{ cursor: 'pointer', color: '#00b8ff', marginTop: '4px', pointerEvents: 'auto' }}
          onClick={handleFastForward}
        >
          ⏩ 快进到发射窗口
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
