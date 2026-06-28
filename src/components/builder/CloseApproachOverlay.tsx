import { useState, useEffect, useRef } from 'react';
import { useBuildStore } from '../../stores/buildStore';
import { CELESTIAL_TEMPLATES, AU_TO_KM } from '../../engine/constants';
import { vec3Length, getBodyRadius, detectCollisions } from '../../engine/physics';
import type { CollisionEvent } from '../../engine/physics';
import type { CelestialBody } from '../../types';
import './CloseApproachOverlay.css';

interface PairInfo {
  a: CelestialBody;
  b: CelestialBody;
  dist: number;
  threshold: number;
  ratio: number;
}

function getBodyName(templateId: string): string {
  const tmpl = CELESTIAL_TEMPLATES.find(t => t.id === templateId);
  return tmpl?.name ?? templateId;
}

function formatDist(au: number): string {
  if (au >= 0.01) return `${au.toFixed(au < 1 ? 3 : 2)} AU`;
  if (au * AU_TO_KM >= 1) return `${(au * AU_TO_KM).toFixed(0)} km`;
  return `${(au * AU_TO_KM * 1000).toFixed(0)} m`;
}

function computeClosePairs(bodies: CelestialBody[]): PairInfo[] {
  const pairs: PairInfo[] = [];
  const n = bodies.length;

  for (let i = 0; i < n; i++) {
    for (let j = i + 1; j < n; j++) {
      const dist = vec3Length([
        bodies[i].position[0] - bodies[j].position[0],
        bodies[i].position[1] - bodies[j].position[1],
        bodies[i].position[2] - bodies[j].position[2],
      ]);
      const rA = getBodyRadius(bodies[i].templateId);
      const rB = getBodyRadius(bodies[j].templateId);
      const threshold = rA + rB;
      pairs.push({ a: bodies[i], b: bodies[j], dist, threshold, ratio: dist / Math.max(threshold, 1) });
    }
  }

  pairs.sort((a, b) => a.ratio - b.ratio);
  return pairs;
}

export default function CloseApproachOverlay() {
  const [pairs, setPairs] = useState<PairInfo[]>([]);
  const [collisionEvents, setCollisionEvents] = useState<CollisionEvent[]>([]);
  const collisionLogRef = useRef<CollisionEvent[]>([]);

  useEffect(() => {
    const id = setInterval(() => {
      const b = useBuildStore.getState().bodies;
      if (b.length < 2) {
        setPairs([]);
        return;
      }

      const closePairs = computeClosePairs(b)
        .filter(p => p.ratio < 2)
        .slice(0, 3);
      setPairs(closePairs);

      const events = detectCollisions(b);
      let logChanged = false;
      for (const evt of events) {
        const alreadyLogged = collisionLogRef.current.some(
          e => e.bodyA.id === evt.bodyA.id && e.bodyB.id === evt.bodyB.id
        );
        if (!alreadyLogged) {
          collisionLogRef.current = [...collisionLogRef.current.slice(-19), evt];
          logChanged = true;
        }
      }
      if (logChanged || events.length === 0) {
        setCollisionEvents([...collisionLogRef.current]);
      }
    }, 150);

    return () => clearInterval(id);
  }, []);

  if (pairs.length === 0 && collisionEvents.length === 0) return null;

  return (
    <div className="close-approach-overlay">
      {collisionEvents.length > 0 && (
        <div className="cao-section cao-collision-log">
          <div className="cao-section-title">碰撞记录</div>
          {collisionEvents.map((evt, idx) => (
            <div key={idx} className="cao-collision-entry">
              {getBodyName(evt.bodyA.templateId)} + {getBodyName(evt.bodyB.templateId)}
              &nbsp;&rarr;&nbsp;
              {getBodyName(evt.mergedBody.templateId)}
            </div>
          ))}
        </div>
      )}

      <div className="cao-section">
        <div className="cao-section-title">
          接近预警
          <span className="cao-count">{pairs.length}</span>
        </div>
        {pairs.map((p, idx) => {
          const level = p.ratio < 1 ? 'danger' : 'warn';
          return (
            <div key={`${p.a.id}-${p.b.id}`} className={`cao-pair cao-pair-${level}`}>
              <div className="cao-pair-header">
                <span className="cao-pair-names">
                  #{idx + 1} {getBodyName(p.a.templateId)} &mdash; {getBodyName(p.b.templateId)}
                </span>
                <span className={`cao-pair-badge cao-badge-${level}`}>
                  {level === 'danger' ? '碰撞' : '警告'}
                </span>
              </div>
              <div className="cao-pair-stats">
                <span>距离: {formatDist(p.dist)}</span>
                <span>碰撞阈值: {formatDist(p.threshold)}</span>
                <span className={`cao-ratio cao-ratio-${level}`}>
                  {p.ratio.toFixed(1)}x
                </span>
              </div>
              <div className="cao-bar-track">
                <div
                  className={`cao-bar-fill cao-bar-${level}`}
                  style={{ width: `${Math.min(100, Math.max(0, (1 - p.ratio / 2) * 100))}%` }}
                />
              </div>
            </div>
          );
        })}
      </div>
    </div>
  );
}
