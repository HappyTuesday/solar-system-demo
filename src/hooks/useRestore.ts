import { useCallback } from 'react';
import { useBuildStore } from '../stores/buildStore';
import { useUIStore } from '../stores/uiStore';
import { computeAutoBuildPlan } from '../engine/autoBuild';

export function useRestore() {
  const startRestore = useCallback(() => {
    const buildStore = useBuildStore.getState();
    const uiStore = useUIStore.getState();

    buildStore.resetBuild();
    uiStore.resetUI();

    buildStore.setAutoBuilding(true);

    const plan = computeAutoBuildPlan(Date.now());

    for (const step of plan) {
      buildStore.placeBody(
        step.templateId,
        step.position,
        step.velocity,
        step.mass,
        step.rotationSpeed,
        step.rotationPhase,
      );
    }

    buildStore.startBuild();
    buildStore.setAutoBuilding(false);
  }, []);

  const isRestoring = useBuildStore((s) => s.isAutoBuilding);

  return { isRestoring, startRestore };
}
