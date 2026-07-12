import { useState } from 'react';
import { useEarthMoonStore } from '../../stores/earthMoonStore';

const MISSIONS = [
  {
    icon: '🔎',
    title: '找到月亮',
    instruction: '在星空里找到月亮，轻轻点一下它。',
    success: '找到啦！月亮一直绕着地球旅行。',
  },
  {
    icon: '🌕',
    title: '变出满月',
    instruction: '按下面的“快快转”，等一轮圆圆的满月。',
    success: '满月出现啦！这时月亮看起来又圆又亮。',
  },
  {
    icon: '🌒',
    title: '发现月食',
    instruction: '点击右边预报里的日期，看看地球的影子。',
    success: '发现月食！地球挡住了照向月亮的阳光。',
  },
] as const;

export default function MissionGuide() {
  const selectedBodyId = useEarthMoonStore(s => s.selectedBodyId);
  const moonPhase = useEarthMoonStore(s => s.moonPhase);
  const eclipseType = useEarthMoonStore(s => s.eclipseType);
  const setSelectedBodyId = useEarthMoonStore(s => s.setSelectedBodyId);
  const [missionIndex, setMissionIndex] = useState(0);
  const [completed, setCompleted] = useState([false, false, false]);

  const mission = MISSIONS[missionIndex];
  const missionComplete = [
    selectedBodyId === 'moon',
    moonPhase?.name === '满月',
    eclipseType !== 'none',
  ][missionIndex];
  const allComplete = completed.every(Boolean);

  const advanceMission = () => {
    setCompleted(previous => previous.map((value, index) => index === missionIndex ? true : value));
    setMissionIndex(index => Math.min(index + 1, MISSIONS.length - 1));
  };

  return (
    <section className={`earthmoon-mission${allComplete ? ' all-complete' : ''}`} aria-live="polite">
      <div className="earthmoon-mission-header">
        <span className="earthmoon-guide-avatar">🚀</span>
        <div>
          <span className="earthmoon-eyebrow">小小宇航员任务</span>
          <div className="earthmoon-mission-steps" aria-label={`已完成 ${completed.filter(Boolean).length} 个任务`}>
            {MISSIONS.map((item, index) => (
              <span key={item.title} className={completed[index] ? 'complete' : index === missionIndex ? 'current' : ''} />
            ))}
          </div>
        </div>
      </div>

      {allComplete ? (
        <div className="earthmoon-mission-result">
          <strong>月亮小专家！</strong>
          <span>你找到了月亮、满月和地球的影子。</span>
          <button type="button" onClick={() => {
            setSelectedBodyId(null);
            setCompleted([false, false, false]);
            setMissionIndex(0);
          }}>
            再玩一次
          </button>
        </div>
      ) : (
        <>
          <div className="earthmoon-mission-title"><span>{mission.icon}</span>{mission.title}</div>
          <p>{missionComplete ? mission.success : mission.instruction}</p>
          {missionComplete && (
            <button type="button" onClick={advanceMission}>
              {missionIndex === MISSIONS.length - 1 ? '领取小专家徽章' : '下一个任务'}
            </button>
          )}
        </>
      )}
    </section>
  );
}
