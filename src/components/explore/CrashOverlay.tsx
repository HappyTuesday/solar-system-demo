import { useSpaceshipStore } from '../../stores/spaceshipStore';
import { REAL_DATA } from '../../engine/constants';
import './CrashOverlay.css';

const AU_TO_KM = 1.496e8;

function formatDuration(ms: number): string {
  if (ms <= 0) return '0 秒';
  const totalSeconds = Math.floor(ms / 1000);
  const years = Math.floor(totalSeconds / (365.25 * 24 * 3600));
  const days = Math.floor((totalSeconds % (365.25 * 24 * 3600)) / (24 * 3600));
  const hours = Math.floor((totalSeconds % (24 * 3600)) / 3600);
  const minutes = Math.floor((totalSeconds % 3600) / 60);
  const seconds = totalSeconds % 60;

  const parts: string[] = [];
  if (years > 0) parts.push(`${years} 年`);
  if (days > 0) parts.push(`${days} 天`);
  if (hours > 0) parts.push(`${hours} 时`);
  if (minutes > 0) parts.push(`${minutes} 分`);
  if (seconds > 0 || parts.length === 0) parts.push(`${seconds} 秒`);
  return parts.join(' ');
}

function formatDistance(km: number): string {
  if (km < 1e3) return `${km.toFixed(0)} km`;
  if (km < 1e6) return `${(km / 1e3).toFixed(1)} 千 km`;
  if (km < 1e9) return `${(km / 1e6).toFixed(2)} 百万 km`;
  if (km < 1e12) return `${(km / 1e9).toFixed(3)} 十亿 km`;
  return `${(km / 1e9).toFixed(2)} 十亿 km`;
}

export default function CrashOverlay() {
  const phase = useSpaceshipStore(s => s.explosionPhase);
  const totalDistanceKm = useSpaceshipStore(s => s.totalDistanceKm);
  const maxSpeedKms = useSpaceshipStore(s => s.maxSpeedKms);
  const sessionStartTime = useSpaceshipStore(s => s.sessionStartTime);
  const simulatedTime = useSpaceshipStore(s => s.simulatedTime);
  const crashBodyId = useSpaceshipStore(s => s.crashBodyId);
  const crashPosition = useSpaceshipStore(s => s.crashPosition);

  if (phase !== 'complete') return null;

  const bodyName = crashBodyId ? (REAL_DATA[crashBodyId]?.name || crashBodyId) : '未知';
  const flightDuration = simulatedTime - sessionStartTime;

  const reset = () => {
    useSpaceshipStore.getState().reset();
  };

  return (
    <div className="crash-overlay">
      <div className="crash-content">
        <div className="crash-title">飞船已坠毁</div>

        <div className="crash-stats">
          <div className="crash-stat-item">
            <span className="crash-stat-label">总飞行时间</span>
            <span className="crash-stat-value">{formatDuration(flightDuration)}</span>
          </div>
          <div className="crash-stat-item">
            <span className="crash-stat-label">飞行距离</span>
            <span className="crash-stat-value">{formatDistance(totalDistanceKm)}</span>
          </div>
          <div className="crash-stat-item">
            <span className="crash-stat-label">最大速度</span>
            <span className="crash-stat-value">{maxSpeedKms.toFixed(0)} km/s</span>
          </div>
          <div className="crash-stat-item">
            <span className="crash-stat-label">坠毁地点</span>
            <span className="crash-stat-value">
              {bodyName}
            </span>
            <span className="crash-stat-coords">
              ({crashPosition[0].toFixed(4)}, {crashPosition[1].toFixed(4)}, {crashPosition[2].toFixed(4)}) AU
            </span>
          </div>
        </div>

        <button className="crash-restart-btn" onClick={reset}>
          重新出发
        </button>
      </div>
    </div>
  );
}
