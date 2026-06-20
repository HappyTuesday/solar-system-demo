import { useEffect, useRef, useState } from 'react';
import { TrailManager } from '../../rendering/threejs/trails';
import type { TrailDebugInfo } from '../../types';
import { useBuildStore } from '../../stores/buildStore';
import './TrailDebugOverlay.css';

interface Props {
  trailManagerRef: React.MutableRefObject<TrailManager | null>;
}

const TEMPLATE_NAMES: Record<string, string> = {
  mercury: '水星',
  venus: '金星',
  earth: '地球',
  mars: '火星',
  jupiter: '木星',
  saturn: '土星',
  uranus: '天王星',
  neptune: '海王星',
};

export default function TrailDebugOverlay({ trailManagerRef }: Props) {
  const [infos, setInfos] = useState<TrailDebugInfo[]>([]);
  const rafRef = useRef<number>(0);
  const bodies = useBuildStore(s => s.bodies);

  useEffect(() => {
    const tick = () => {
      const tm = trailManagerRef.current;
      if (tm) {
        const currentBodies = useBuildStore.getState().bodies;
        setInfos(tm.getDebugInfos(currentBodies));
      }
      rafRef.current = requestAnimationFrame(tick);
    };
    rafRef.current = requestAnimationFrame(tick);
    return () => cancelAnimationFrame(rafRef.current);
  }, [trailManagerRef]);

  if (infos.length === 0) return null;

  return (
    <div className="trail-debug-overlay">
      <div className="trail-debug-title">拖影环形缓冲区调试</div>
      <div className="trail-debug-table">
        <div className="trail-debug-header">
          <span>天体</span>
          <span>writeIndex</span>
          <span>activeCount</span>
          <span>环形缓冲区 → Three.js</span>
        </div>
        {infos.map(info => (
          <div key={info.bodyId} className="trail-debug-row">
            <span>{TEMPLATE_NAMES[info.templateId] ?? info.templateId}</span>
            <span className="mono">{info.writeIndex}</span>
            <span className="mono">{info.activeCount}</span>
            <span className="mono">{info.sourceRange} → {info.destRange}</span>
          </div>
        ))}
      </div>
    </div>
  );
}
