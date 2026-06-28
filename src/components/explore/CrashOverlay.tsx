import { useSpaceshipStore } from '../../stores/spaceshipStore';
import { REAL_DATA, AU_TO_KM } from '../../engine/constants';
import './CrashOverlay.css';

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
  const au = km / AU_TO_KM;
  if (au >= 0.01) return `${au.toFixed(au < 1 ? 3 : 2)} AU`;
  if (km >= 1e3) return `${(km / 1e3).toFixed(1)} 千 km`;
  if (km >= 1) return `${km.toFixed(0)} km`;
  return `${(km * 1000).toFixed(0)} m`;
}

function toLatLon(
  crashPos: [number, number, number],
  bodyPos: [number, number, number],
  axialTilt: number,
): { lat: number; lon: number } {
  const dx = crashPos[0] - bodyPos[0];
  const dy = crashPos[1] - bodyPos[1];
  const dz = crashPos[2] - bodyPos[2];
  const dist = Math.sqrt(dx * dx + dy * dy + dz * dz);

  if (dist < 1e-20) return { lat: 0, lon: 0 };

  const nx = dx / dist;
  const ny = dy / dist;
  const nz = dz / dist;

  const cosT = Math.cos(-axialTilt);
  const sinT = Math.sin(-axialTilt);
  const ty = ny * cosT - nz * sinT;
  const tz = ny * sinT + nz * cosT;

  const latRad = Math.asin(Math.max(-1, Math.min(1, tz)));
  const lonRad = Math.atan2(ty, nx);

  return {
    lat: (latRad * 180) / Math.PI,
    lon: ((lonRad * 180) / Math.PI + 360) % 360,
  };
}

export default function CrashOverlay() {
  const phase = useSpaceshipStore(s => s.explosionPhase);
  const totalDistanceKm = useSpaceshipStore(s => s.totalDistanceKm);
  const maxSpeedKms = useSpaceshipStore(s => s.maxSpeedKms);
  const sessionStartTime = useSpaceshipStore(s => s.sessionStartTime);
  const simulatedTime = useSpaceshipStore(s => s.simulatedTime);
  const crashBodyId = useSpaceshipStore(s => s.crashBodyId);
  const crashPosition = useSpaceshipStore(s => s.crashPosition);
  const crashBodyPosition = useSpaceshipStore(s => s.crashBodyPosition);

  if (phase !== 'complete') return null;

  const bodyData = crashBodyId ? REAL_DATA[crashBodyId] : null;
  const bodyName = bodyData?.name || crashBodyId || '未知';
  const axialTilt = bodyData?.orbital?.axialTilt ?? 0;
  const flightDuration = simulatedTime - sessionStartTime;
  const latlon = toLatLon(crashPosition, crashBodyPosition, axialTilt);

  const latStr = latlon.lat >= 0
    ? `北纬 ${latlon.lat.toFixed(2)}°`
    : `南纬 ${(-latlon.lat).toFixed(2)}°`;

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
            <span className="crash-stat-value">{bodyName}</span>
            <span className="crash-stat-coords">
              {latStr}，东经 {latlon.lon.toFixed(2)}°
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
