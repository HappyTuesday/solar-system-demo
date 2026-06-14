import { memo } from 'react';
import { useHistoryStore } from '../../stores/historyStore';
import { useBuildStore } from '../../stores/buildStore';
import type { BuildRecord, BuildState } from '../../types';
import './HistoryPanel.css';

const formatDate = (ts: number): string => {
  const d = new Date(ts);
  return `${d.getFullYear()}/${String(d.getMonth() + 1).padStart(2, '0')}/${String(d.getDate()).padStart(2, '0')} ${String(d.getHours()).padStart(2, '0')}:${String(d.getMinutes()).padStart(2, '0')}`;
};

const formatBuildTime = (ms: number): string => {
  const minutes = Math.floor(ms / 60000);
  const seconds = Math.floor((ms % 60000) / 1000);
  return `${minutes}:${String(seconds).padStart(2, '0')}`;
};

interface HistoryItemProps {
  record: BuildRecord;
  isActive: boolean;
  onClick: () => void;
}

const HistoryItemView = memo(function HistoryItemView({ record, isActive, onClick }: HistoryItemProps) {
  return (
    <div
      className={`history-item ${isActive ? 'active' : ''}`}
      onClick={onClick}
    >
      <div className="history-date">{formatDate(record.createdAt)}</div>
      <div className="history-meta">
        <span className={`history-status status-${record.status}`}>
          {record.status === 'building' ? '搭建中' : record.status === 'completed' ? '已完成' : '已取消'}
        </span>
        {record.score !== null && <span className="history-score">{record.score}分</span>}
        {record.buildTimeMs !== null && <span className="history-time">{formatBuildTime(record.buildTimeMs)}</span>}
      </div>
    </div>
  );
});

export default function HistoryPanel() {
  const records = useHistoryStore(s => s.records);
  const currentRecordId = useHistoryStore(s => s.currentRecordId);
  const loadRecords = useHistoryStore(s => s.loadRecords);
  const saveCurrentRecord = useHistoryStore(s => s.saveCurrentRecord);
  const switchToRecord = useHistoryStore(s => s.switchToRecord);
  const setCurrentRecordId = useHistoryStore(s => s.setCurrentRecordId);
  const buildStore = useBuildStore();

  const handleClickRecord = (record: BuildRecord) => {
    if (record.id === currentRecordId) return;

    if (currentRecordId && buildStore.startedAt) {
      saveCurrentRecord({
        id: currentRecordId,
        createdAt: buildStore.startedAt,
        completedAt: buildStore.completedAt,
        status: buildStore.completedAt ? 'completed' : 'building',
        score: null,
        buildTimeMs: buildStore.buildElapsedMs,
        snapshot: JSON.stringify(buildStore.getSnapshot()),
      });
    }

    const loaded = switchToRecord(record.id);
    if (loaded) {
      try {
        const state: BuildState = JSON.parse(loaded.snapshot);
        buildStore.loadSnapshot(state);
        loadRecords();
      } catch {
        // ignore parse errors
      }
    }
  };

  return (
    <div className="history-panel">
      <div className="history-header">搭建历史</div>
      <div className="history-list">
        {records.length === 0 && (
          <div className="history-empty">暂无记录</div>
        )}
        {records.map(record => (
          <HistoryItemView
            key={record.id}
            record={record}
            isActive={record.id === currentRecordId || record.id === buildStore.id}
            onClick={() => handleClickRecord(record)}
          />
        ))}
      </div>
    </div>
  );
}
