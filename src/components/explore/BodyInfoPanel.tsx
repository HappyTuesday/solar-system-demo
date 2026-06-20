import { useExploreStore } from '../../stores/exploreStore';
import { REAL_DATA } from '../../engine/constants';
import './BodyInfoPanel.css';

function BodyInfoPanel() {
  const selectedBodyId = useExploreStore(s => s.selectedBodyId);

  if (!selectedBodyId) return null;

  const data = REAL_DATA[selectedBodyId];
  if (!data) return null;

  return (
    <div className="body-info-panel">
      <h3>{data.name}</h3>
      <div className="body-info-row">
        <span>类型</span><span>{data.type === 'star' ? '恒星' : data.type === 'planet' ? '行星' : '卫星'}</span>
      </div>
      <div className="body-info-row">
        <span>质量</span><span>{data.mass.toExponential(2)} kg</span>
      </div>
      <div className="body-info-row">
        <span>直径</span><span>{((data.radius * 2) / 1000).toLocaleString()} km</span>
      </div>
      {data.semiMajorAxis && (
        <div className="body-info-row">
          <span>轨道半长轴</span><span>{(data.semiMajorAxis / 1.496e11).toFixed(2)} AU</span>
        </div>
      )}
      {data.orbitalSpeed && (
        <div className="body-info-row">
          <span>轨道速度</span><span>{(data.orbitalSpeed / 1000).toFixed(1)} km/s</span>
        </div>
      )}
    </div>
  );
}

export default BodyInfoPanel;
