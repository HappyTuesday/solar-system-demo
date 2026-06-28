import { useState, useCallback, useEffect, useRef } from 'react';
import { useSpaceshipStore } from '../../stores/spaceshipStore';
import './TimeJumpPanel.css';

const YEAR_MS = 365.25 * 24 * 3600 * 1000;
const MONTH_MS = 30.44 * 24 * 3600 * 1000;
const WEEK_MS = 7 * 24 * 3600 * 1000;
const DAY_MS = 24 * 3600 * 1000;
const HOUR_MS = 3600 * 1000;
const MIN10_MS = 10 * 60 * 1000;

interface Props {
  onClose: () => void;
}

export default function TimeJumpPanel({ onClose }: Props) {
  const simulatedTime = useSpaceshipStore(s => s.simulatedTime);
  const timeJump = useSpaceshipStore(s => s.timeJump);
  const [days, setDays] = useState(1);
  const [hours, setHours] = useState(1);
  const panelRef = useRef<HTMLDivElement>(null);

  const doJump = useCallback((offsetMs: number) => {
    timeJump(simulatedTime + offsetMs);
  }, [simulatedTime, timeJump]);

  const jumpToday = useCallback(() => {
    timeJump(Date.now());
  }, [timeJump]);

  // Close on outside click
  useEffect(() => {
    const handler = (e: MouseEvent) => {
      if (panelRef.current && !panelRef.current.contains(e.target as Node)) {
        onClose();
      }
    };
    document.addEventListener('mousedown', handler);
    return () => document.removeEventListener('mousedown', handler);
  }, [onClose]);

  // Close on Escape
  useEffect(() => {
    const handler = (e: KeyboardEvent) => {
      if (e.key === 'Escape') onClose();
    };
    document.addEventListener('keydown', handler);
    return () => document.removeEventListener('keydown', handler);
  }, [onClose]);

  return (
    <div className="time-jump-panel" ref={panelRef}>
      <div className="time-jump-panel-title">时间跳转</div>

      <div className="time-jump-row">
        <button className="time-jump-btn" onClick={() => doJump(-YEAR_MS)}>← 1年</button>
        <button className="time-jump-btn" onClick={() => doJump(YEAR_MS)}>1年 →</button>
      </div>
      <div className="time-jump-row">
        <button className="time-jump-btn" onClick={() => doJump(-MONTH_MS)}>← 1月</button>
        <button className="time-jump-btn" onClick={() => doJump(MONTH_MS)}>1月 →</button>
      </div>
      <div className="time-jump-row">
        <button className="time-jump-btn" onClick={() => doJump(-WEEK_MS)}>← 1周</button>
        <button className="time-jump-btn" onClick={() => doJump(WEEK_MS)}>1周 →</button>
      </div>
      <div className="time-jump-row">
        <button className="time-jump-btn" onClick={() => doJump(-DAY_MS)}>← 1天</button>
        <button className="time-jump-btn" onClick={() => doJump(DAY_MS)}>1天 →</button>
      </div>
      <div className="time-jump-row">
        <button className="time-jump-btn" onClick={() => doJump(-HOUR_MS)}>← 1时</button>
        <button className="time-jump-btn" onClick={() => doJump(HOUR_MS)}>1时 →</button>
      </div>
      <div className="time-jump-row">
        <button className="time-jump-btn" onClick={() => doJump(-MIN10_MS)}>← 10分</button>
        <button className="time-jump-btn" onClick={() => doJump(MIN10_MS)}>10分 →</button>
      </div>

      <hr className="time-jump-divider" />
      <div className="time-jump-custom-label">自定义</div>

      <div className="time-jump-custom-row">
        <input
          type="number"
          className="time-jump-custom-input"
          min={1}
          max={365}
          value={days}
          onChange={e => setDays(Math.max(1, Math.min(365, parseInt(e.target.value) || 1)))}
        />
        <span className="time-jump-custom-text">天后</span>
        <button className="time-jump-custom-go" onClick={() => doJump(days * DAY_MS)}>→</button>
        <button className="time-jump-custom-go" onClick={() => doJump(-days * DAY_MS)}>←</button>
      </div>
      <div className="time-jump-custom-row">
        <input
          type="number"
          className="time-jump-custom-input"
          min={1}
          max={8760}
          value={hours}
          onChange={e => setHours(Math.max(1, Math.min(8760, parseInt(e.target.value) || 1)))}
        />
        <span className="time-jump-custom-text">小时后</span>
        <button className="time-jump-custom-go" onClick={() => doJump(hours * HOUR_MS)}>→</button>
        <button className="time-jump-custom-go" onClick={() => doJump(-hours * HOUR_MS)}>←</button>
      </div>

      <button className="time-jump-today" onClick={jumpToday}>今日</button>
      <span className="time-jump-close" onClick={onClose}>面板外点击即关闭</span>
    </div>
  );
}
