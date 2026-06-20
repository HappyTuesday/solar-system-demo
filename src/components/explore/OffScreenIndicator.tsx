import { useEffect, useRef, useState } from 'react';
import * as THREE from 'three';

interface BodyInfo {
  id: string;
  name: string;
  mesh: THREE.Object3D;
}

export interface OffScreenEntry {
  id: string;
  name: string;
  x: number;
  y: number;
  angle: number;
}

export function computeOffScreenBodies(
  camera: THREE.Camera,
  bodies: BodyInfo[],
  margin: number,
): OffScreenEntry[] {
  const entries: OffScreenEntry[] = [];

  for (const body of bodies) {
    const worldPos = new THREE.Vector3();
    body.mesh.getWorldPosition(worldPos);

    const screenPos = worldPos.clone().project(camera);

    const sx = (screenPos.x * 0.5 + 0.5);
    const sy = (-screenPos.y * 0.5 + 0.5);
    const behindCamera = screenPos.z > 1;

    const tol = margin;
    const isOffScreen = behindCamera ||
      sx < -tol || sx > 1 + tol || sy < -tol || sy > 1 + tol;

    if (!isOffScreen) continue;

    const clampedX = Math.max(0.03, Math.min(0.97, sx));
    const clampedY = Math.max(0.03, Math.min(0.97, sy));

    let edgeX = clampedX;
    let edgeY = clampedY;

    if (behindCamera) {
      edgeX = 0.5;
      edgeY = 0.03;
    } else {
      const dx = clampedX - 0.5;
      const dy = clampedY - 0.5;
      const absDx = Math.abs(dx);
      const absDy = Math.abs(dy);

      if (absDx > absDy) {
        edgeX = dx > 0 ? 0.97 : 0.03;
        edgeY = 0.5 + dy * (0.47 / Math.max(absDx, 0.001));
      } else {
        edgeY = dy > 0 ? 0.97 : 0.03;
        edgeX = 0.5 + dx * (0.47 / Math.max(absDy, 0.001));
      }
    }

    const angle = Math.atan2(-(clampedY - 0.5), clampedX - 0.5) * (180 / Math.PI);

    entries.push({
      id: body.id,
      name: body.name,
      x: edgeX,
      y: edgeY,
      angle,
    });
  }

  return entries;
}

interface Props {
  entries: OffScreenEntry[];
  containerWidth: number;
  containerHeight: number;
}

function OffScreenIndicator({ entries, containerWidth, containerHeight }: Props) {
  if (entries.length === 0) return null;

  return (
    <>
      {entries.map(entry => (
        <div
          key={entry.id}
          style={{
            position: 'absolute',
            left: entry.x * containerWidth - 12,
            top: entry.y * containerHeight - 12,
            width: 24,
            height: 24,
            borderRadius: '50%',
            border: '2px solid rgba(79, 195, 247, 0.8)',
            background: 'rgba(79, 195, 247, 0.2)',
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'center',
            pointerEvents: 'none',
            zIndex: 15,
          }}
        >
          <div style={{
            width: 6,
            height: 6,
            borderRadius: '50%',
            background: '#4fc3f7',
            transform: `rotate(${entry.angle}deg)`,
            transformOrigin: 'center center',
          }}>
            <div style={{
              position: 'absolute',
              top: -16,
              left: '50%',
              transform: 'translateX(-50%)',
              fontSize: 10,
              color: '#4fc3f7',
              whiteSpace: 'nowrap',
              fontWeight: 600,
              textShadow: '0 0 4px rgba(0,0,0,0.8)',
            }}>
              {entry.name}
            </div>
          </div>
        </div>
      ))}
    </>
  );
}

export default OffScreenIndicator;
