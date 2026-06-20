import { useState, useEffect, useRef } from 'react';
import { useBuildStore } from '../../stores/buildStore';
import { useUIStore } from '../../stores/uiStore';
import { CELESTIAL_TEMPLATES, REAL_DATA } from '../../engine/constants';
import { setBodyOutline } from '../../rendering/bodies';
import { setLinearScale, setSizeMultiplier } from '../../engine/coordinateTransform';
import { getSharedCamera, setCurrentLookAt, setObservationTargetId } from '../../rendering/cameraRef';
import * as THREE from 'three';
import type { CelestialBody } from '../../types';
import './BodyStatusPanel.css';

const BODY_COLORS: Record<string, string> = {
  sun: '#ffdd00',
  mercury: '#cccccc',
  venus: '#ffcc88',
  earth: '#4488ff',
  mars: '#ff6644',
  jupiter: '#ffcc88',
  saturn: '#ffeecc',
  uranus: '#88ccff',
  neptune: '#4488ff',
  moon: '#cccccc',
  io: '#ffcc44',
  europa: '#ddccbb',
  ganymede: '#bbbbbb',
  callisto: '#888888',
  titan: '#ffcc88',
  phobos: '#998877',
  deimos: '#887766',
};

const TEMPLATE_ORDER: Record<string, number> = {};
CELESTIAL_TEMPLATES.forEach((t, i) => {
  TEMPLATE_ORDER[t.id] = i;
});

interface BodyDisplayData {
  id: string;
  templateId: string;
  name: string;
  color: string;
  hasParent: boolean;
  distance: string;
  angle: string;
  speed: string;
}

function formatDistance(meters: number): string {
  if (meters >= 1e12) return `${(meters / 1.495978707e11).toFixed(1)} AU`;
  if (meters >= 1e9) return `${(meters / 1e9).toFixed(1)} 百万 km`;
  if (meters >= 1e6) return `${(meters / 1e3).toFixed(0)} km`;
  return `${meters.toFixed(0)} m`;
}

function formatSpeed(mps: number): string {
  if (mps >= 1000) return `${(mps / 1000).toFixed(1)} km/s`;
  return `${mps.toFixed(0)} m/s`;
}

function computeDisplayData(bodies: CelestialBody[]): BodyDisplayData[] {
  return bodies
    .map((body): BodyDisplayData => {
      const template = CELESTIAL_TEMPLATES.find(t => t.id === body.templateId);
      const isSun = body.templateId === 'sun';
      const parentId = template?.parentId ?? (isSun ? undefined : 'sun');
      const parent: CelestialBody | undefined = parentId
        ? bodies.find(b => b.templateId === parentId)
        : undefined;
      const speed = Math.sqrt(
        body.velocity[0] ** 2 + body.velocity[1] ** 2 + body.velocity[2] ** 2
      );

      let distance = '-';
      let angle = '-';

      if (parentId && parent) {
        const dx = body.position[0] - parent.position[0];
        const dy = body.position[1] - parent.position[1];
        const dist = Math.sqrt(dx * dx + dy * dy);
        distance = formatDistance(dist);

        const angleRad = Math.atan2(dy, dx);
        const angleDeg = ((angleRad / Math.PI) * 180 + 360) % 360;
        angle = `${angleDeg.toFixed(0)}°`;
      } else if (!parentId) {
        distance = '-';
        angle = '-';
      }

      return {
        id: body.id,
        templateId: body.templateId,
        name: template?.name ?? body.templateId,
        color: BODY_COLORS[body.templateId] ?? '#888888',
        hasParent: !!parentId,
        distance,
        angle,
        speed: formatSpeed(speed),
      };
    })
    .sort((a, b) => {
      const orderA = TEMPLATE_ORDER[a.templateId] ?? 999;
      const orderB = TEMPLATE_ORDER[b.templateId] ?? 999;
      return orderA - orderB;
    });
}

export default function BodyStatusPanel() {
  const bodies = useBuildStore(s => s.bodies);
  const simulatedTime = useBuildStore(s => s.simulatedTime);
  const selectedBodyIds = useUIStore(s => s.selectedBodyIds);
  const setSelectedBodyIds = useUIStore(s => s.setSelectedBodyIds);
  const setSizeMultiplierValue = useUIStore(s => s.setSizeMultiplierValue);

  const [displayData, setDisplayData] = useState<BodyDisplayData[]>([]);
  const lastUpdateRef = useRef(0);
  const prevBodyCountRef = useRef(bodies.length);

  useEffect(() => {
    const now = performance.now();
    const bodyCountChanged = bodies.length !== prevBodyCountRef.current;
    prevBodyCountRef.current = bodies.length;
    if (bodies.length > 0 && !bodyCountChanged && now - lastUpdateRef.current < 100) return;
    lastUpdateRef.current = now;
    setDisplayData(computeDisplayData(bodies));
  }, [bodies, simulatedTime]);

  const handleClick = (id: string) => {
    const body = bodies.find(b => b.id === id);
    if (!body) return;

    if (selectedBodyIds.includes(id)) {
      setSelectedBodyIds([]);
      setObservationTargetId(null);
    } else {
      setSelectedBodyIds([id]);
      setObservationTargetId(id);
      const data = REAL_DATA[body.templateId];
      if (data) {
        const newScale = 1e-7;
        setLinearScale(newScale);
        useUIStore.getState().setLinearScaleValue(newScale);
        const h = document.querySelector('.canvas-wrapper')?.clientHeight ?? 800;
        const targetSize = (0.1 * h) / (2 * data.radius * newScale);
        const v = Math.max(1, targetSize);
        setSizeMultiplier(v);
        setSizeMultiplierValue(v);
        const camera = getSharedCamera();
        if (camera) {
          const renderRadius = data.radius * newScale * v;
          const dist = Math.min(4000, Math.max(150, renderRadius * 1.5));
          const rp = [body.position[0] * newScale, body.position[1] * newScale, body.position[2] * newScale] as [number, number, number];
          camera.position.set(rp[0], rp[1], rp[2] + dist);
          camera.lookAt(new THREE.Vector3(rp[0], rp[1], rp[2]));
          setCurrentLookAt([rp[0], rp[1], rp[2]]);
        }
      }
    }
  };

  if (bodies.length === 0) {
    return (
      <div className="body-status-panel">
        <div className="body-status-title">天体状态</div>
        <div className="body-status-empty">尚未放置天体</div>
      </div>
    );
  }

  return (
    <div className="body-status-panel">
      <div className="body-status-title">天体状态</div>
      {displayData.map(item => {
        const isSelected = selectedBodyIds.includes(item.id);

        return (
          <div
            key={item.id}
            className={`body-status-item${isSelected ? ' selected' : ''}`}
            onClick={() => handleClick(item.id)}
            onMouseEnter={() => setBodyOutline(item.id, true)}
            onMouseLeave={() => setBodyOutline(item.id, false)}
          >
            <div className="body-status-item-header">
              <span className="body-status-dot" style={{ backgroundColor: item.color }} />
              <span className="body-status-name">{item.name}</span>
            </div>
            <div className="body-status-data">
              {item.hasParent ? (
                <>距离: {item.distance} &nbsp; 角度: {item.angle}<br /></>
              ) : null}
              速度: {item.speed}
            </div>
          </div>
        );
      })}
    </div>
  );
}
