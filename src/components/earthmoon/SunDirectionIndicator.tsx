import { useEffect, useRef } from 'react';
import * as THREE from 'three';

interface Props {
  scene: THREE.Scene;
  sunDirection: THREE.Vector3;
}

function SunDirectionIndicator({ scene, sunDirection }: Props) {
  const groupRef = useRef<THREE.Group>(new THREE.Group());

  useEffect(() => {
    const group = groupRef.current;
    scene.add(group);
    return () => { scene.remove(group); };
  }, [scene]);

  useEffect(() => {
    const group = groupRef.current;
    group.clear();

    const dir = sunDirection.clone().normalize();
    const origin = dir.clone().multiplyScalar(-80);

    for (let i = -2; i <= 2; i++) {
      for (let j = -2; j <= 2; j++) {
        if (Math.abs(i) + Math.abs(j) > 3) continue;
        const start = origin.clone();
        start.x += i * 4;
        start.y += j * 4;
        start.z += (i + j) * 0.5;
        const arrow = new THREE.ArrowHelper(dir, start, 70, 0xffd54f, 4, 2);
        group.add(arrow);
      }
    }
  }, [sunDirection]);

  return null;
}

export default SunDirectionIndicator;
