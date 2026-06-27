import { useCallback } from 'react';
import { useSpaceshipStore } from '../../stores/spaceshipStore';
import { useExploreStore } from '../../stores/exploreStore';
import './TimePanel.css';

const MIN_EXP = 0;
const MAX_EXP = 5;
const PRESETS = [1, 10, 100, 1000, 10000, 100000];

function expToScale(exp: number): number {
  return Math.round(Math.pow(10, exp));
}

function scaleToExp(scale: number): number {
  const clamped = Math.max(MIN_EXP, Math.min(MAX_EXP, Math.log10(scale)));
  return Math.round(clamped * 100) / 100;
}

function formatDate(timestamp: number): string {
  const d = new Date(timestamp);
  const year = d.getFullYear();
  const month = String(d.getMonth() + 1).padStart(2, '0');
  const day = String(d.getDate()).padStart(2, '0');
  return `${year}-${month}-${day}`;
}

function formatTime(timestamp: number): string {
  const d = new Date(timestamp);
  const h = String(d.getHours()).padStart(2, '0');
  const m = String(d.getMinutes()).padStart(2, '0');
  const s = String(d.getSeconds()).padStart(2, '0');
  return `${h}:${m}:${s}`;
}

export default function TimePanel() {
  const simulatedTime = useSpaceshipStore(s => s.simulatedTime);
  const timeScale = useExploreStore(s => s.timeScale);
  const setTimeScale = useExploreStore(s => s.setTimeScale);

  const handleSliderChange = useCallback((e: React.ChangeEvent<HTMLInputElement>) => {
    const exp = parseFloat(e.target.value);
    setTimeScale(expToScale(exp));
  }, [setTimeScale]);

  const handlePreset = useCallback((scale: number) => {
    setTimeScale(scale);
  }, [setTimeScale]);

  const currentExp = scaleToExp(timeScale);
  const sliderPct = ((currentExp - MIN_EXP) / (MAX_EXP - MIN_EXP)) * 100;

  return (
    <div className="time-panel">
      <div className="time-panel-left">
        <div className="time-panel-date">{formatDate(simulatedTime)}</div>
        <div className="time-panel-time">{formatTime(simulatedTime)}</div>
      </div>
      <div className="time-panel-right">
        <div className="time-panel-ratio">
          时间倍率 <span className="time-panel-ratio-value">{Math.round(timeScale)}×</span>
        </div>
        <input
          type="range"
          className="time-panel-slider"
          min={MIN_EXP}
          max={MAX_EXP}
          step={0.01}
          value={currentExp}
          onChange={handleSliderChange}
          style={{
            background: `linear-gradient(to right, #1a2a3a 0%, #4488ff ${sliderPct}%, #1a2a3a ${sliderPct}%)`,
          }}
        />
        <div className="time-panel-presets">
          {PRESETS.map(s => (
            <span
              key={s}
              className={`time-panel-preset-label${timeScale === s ? ' active' : ''}`}
              onClick={() => handlePreset(s)}
            >
              {s}
            </span>
          ))}
        </div>
      </div>
    </div>
  );
}
