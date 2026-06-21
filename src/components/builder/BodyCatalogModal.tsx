import { REAL_DATA } from '../../engine/constants';
import { BUILD_DATA } from '../../engine/buildData';
import type { BuildBodyData } from '../../engine/buildData';
import './BodyCatalogModal.css';

const PLANET_IDS = ['mercury', 'venus', 'earth', 'mars', 'jupiter', 'saturn', 'uranus', 'neptune'] as const;

interface BodyCatalogModalProps {
  onClose: () => void;
}

function fmtKm(value: number): string {
  const km = value / 1000;
  if (km < 100000) return km.toFixed(1);
  return km.toExponential(2);
}

function fmtKms(value: number): string {
  return (value / 1000).toFixed(1);
}

export default function BodyCatalogModal({ onClose }: BodyCatalogModalProps) {
  return (
    <div className="catalog-overlay" onClick={onClose}>
      <div className="catalog-card" onClick={e => e.stopPropagation()}>
        <div className="catalog-header">
          <h2>天体数据对照表</h2>
          <button className="catalog-close-btn" onClick={onClose}>✕</button>
        </div>

        <p className="catalog-note">※ 搭建页面使用校正数据，与真实值有出入</p>

        <div className="catalog-table-wrap">
          <table className="catalog-table">
            <thead>
              <tr>
                <th>天体</th>
                <th>真实半径</th>
                <th>校正半径</th>
                <th>真实轨道半径</th>
                <th>校正轨道半径</th>
                <th>真实速度</th>
                <th>校正速度</th>
              </tr>
            </thead>
            <tbody>
              {PLANET_IDS.map(id => {
                const real = REAL_DATA[id];
                const build: BuildBodyData = BUILD_DATA[id];
                if (!real || !build) return null;
                return (
                  <tr key={id}>
                    <td className="name-cell">{build.name}</td>
                    <td>{fmtKm(real.radius)} km</td>
                    <td>{fmtKm(build.radius)} km</td>
                    <td>{real.semiMajorAxis != null ? `${fmtKm(real.semiMajorAxis)} km` : '—'}</td>
                    <td>{build.semiMajorAxis > 0 ? `${fmtKm(build.semiMajorAxis)} km` : '—'}</td>
                    <td>{real.orbitalSpeed != null ? `${fmtKms(real.orbitalSpeed)} km/s` : '—'}</td>
                    <td>{build.orbitalSpeed > 0 ? `${fmtKms(build.orbitalSpeed)} km/s` : '—'}</td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>

        <div className="catalog-footer">
          <button className="catalog-btn" onClick={onClose}>关闭</button>
        </div>
      </div>
    </div>
  );
}
