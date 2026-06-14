import { useUIStore } from '../../stores/uiStore';
import { useBuildStore } from '../../stores/buildStore';
import { scoreBuild } from '../../engine/scoring';
import './ScoreModal.css';

export default function ScoreModal() {
  const showScoreModal = useUIStore(s => s.showScoreModal);
  const setShowScoreModal = useUIStore(s => s.setShowScoreModal);
  const bodies = useBuildStore(s => s.bodies);
  const resetBuild = useBuildStore(s => s.resetBuild);
  const resetUI = useUIStore(s => s.resetUI);

  if (!showScoreModal) return null;

  const result = scoreBuild(bodies);

  const scoreColor = result.totalScore >= 80 ? 'green' : result.totalScore >= 50 ? 'yellow' : 'red';
  const scoreEmoji = result.totalScore >= 90 ? '🌟' : result.totalScore >= 70 ? '👍' : result.totalScore >= 40 ? '💪' : '📚';

  const handleClose = () => setShowScoreModal(false);

  const handleNewBuild = () => {
    resetBuild();
    resetUI();
    setShowScoreModal(false);
  };

  return (
    <div className="score-overlay" onClick={handleClose}>
      <div className="score-card" onClick={e => e.stopPropagation()}>
        <h2>搭建完成！{scoreEmoji}</h2>
        <div className={`score-number score-${scoreColor}`}>
          {result.totalScore}
          <span className="score-unit">/100</span>
        </div>

        <table className="score-table">
          <thead>
            <tr>
              <th>行星</th>
              <th>轨道</th>
              <th>质量</th>
              <th>速度</th>
              <th>顺序</th>
              <th>得分</th>
            </tr>
          </thead>
          <tbody>
            {Object.entries(result.planetScores).map(([id, score]) => (
              <tr key={id}>
                <td>{score.name}</td>
                <td className={score.orbitRadiusScore >= 0.22 ? 'green' : score.orbitRadiusScore >= 0.1 ? 'yellow' : 'red'}>
                  {(score.orbitRadiusScore * 100).toFixed(0)}%
                </td>
                <td className={score.massScore >= 0.18 ? 'green' : score.massScore >= 0.08 ? 'yellow' : 'red'}>
                  {(score.massScore * 100).toFixed(0)}%
                </td>
                <td className={score.velocityScore >= 0.18 ? 'green' : score.velocityScore >= 0.08 ? 'yellow' : 'red'}>
                  {(score.velocityScore * 100).toFixed(0)}%
                </td>
                <td className={score.orderScore >= 0.15 ? 'green' : score.orderScore > 0 ? 'yellow' : 'red'}>
                  {score.orderScore > 0 ? '✓' : '✗'}
                </td>
                <td className={score.total >= 0.7 ? 'green' : score.total >= 0.4 ? 'yellow' : 'red'}>
                  {(score.total * 100).toFixed(0)}
                </td>
              </tr>
            ))}
          </tbody>
        </table>

        <div className="score-actions">
          <button className="score-btn primary" onClick={handleNewBuild}>再次搭建</button>
          <button className="score-btn" onClick={handleClose}>关闭</button>
        </div>
      </div>
    </div>
  );
}
