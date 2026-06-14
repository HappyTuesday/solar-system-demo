import { useCallback, useEffect, useRef } from 'react';
import { useBuildStore } from '../stores/buildStore';
import { useUIStore } from '../stores/uiStore';
import { useHistoryStore } from '../stores/historyStore';
import { AUTO_BUILD_PLAN } from '../engine/autoBuild';

const AUTO_BUILD_INTERVAL = 1000;
const COMPLETE_DELAY = 3000;

export function useAutoBuild() {
  const timerIdsRef = useRef<number[]>([]);

  useEffect(() => {
    return () => {
      timerIdsRef.current.forEach(clearTimeout);
    };
  }, []);

  const startAutoBuild = useCallback(() => {
    timerIdsRef.current.forEach(clearTimeout);
    timerIdsRef.current = [];

    const buildStore = useBuildStore.getState();
    const uiStore = useUIStore.getState();
    const historyStore = useHistoryStore.getState();

    buildStore.resetBuild();
    uiStore.resetUI();
    historyStore.setCurrentRecordId(null);

    buildStore.setAutoBuilding(true);
    buildStore.startBuild();

    let index = 0;

    const placeNext = () => {
      if (index >= AUTO_BUILD_PLAN.length) {
        const completeTimer = window.setTimeout(() => {
          const store = useBuildStore.getState();
          const result = store.completeBuild();
          if (result) {
            const record = {
              id: store.id,
              createdAt: store.startedAt ?? Date.now(),
              completedAt: Date.now(),
              status: 'completed' as const,
              score: result.score,
              buildTimeMs: store.buildElapsedMs,
              snapshot: JSON.stringify(store.getSnapshot()),
            };
            const histStore = useHistoryStore.getState();
            histStore.saveCurrentRecord(record);
            histStore.loadRecords();
          }
          store.resumeBuild();
          store.setAutoBuilding(false);
        }, COMPLETE_DELAY);
        timerIdsRef.current.push(completeTimer);
        return;
      }

      const plan = AUTO_BUILD_PLAN[index];
      const store = useBuildStore.getState();
      store.placeBody(plan.templateId, plan.position, plan.velocity, plan.mass, plan.rotationSpeed);
      store.setAutoBuildProgress(index + 1);

      if (index === 0) {
        useHistoryStore.getState().saveCurrentRecord({
          id: store.id,
          createdAt: Date.now(),
          completedAt: null,
          status: 'building',
          score: null,
          buildTimeMs: null,
          snapshot: JSON.stringify(store.getSnapshot()),
        });
        useHistoryStore.getState().loadRecords();
        useHistoryStore.getState().setCurrentRecordId(store.id);
      }

      index++;
      const timer = window.setTimeout(placeNext, AUTO_BUILD_INTERVAL);
      timerIdsRef.current.push(timer);
    };

    placeNext();
  }, []);

  const isAutoBuilding = useBuildStore((s) => s.isAutoBuilding);
  const autoBuildProgress = useBuildStore((s) => s.autoBuildProgress);

  return { isAutoBuilding, autoBuildProgress, startAutoBuild };
}
