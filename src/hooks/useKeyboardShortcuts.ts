import { useEffect } from 'react';
import { useBuildStore } from '../stores/buildStore';
import { useUIStore } from '../stores/uiStore';

export function useKeyboardShortcuts(): void {
  useEffect(() => {
    const handler = (e: KeyboardEvent) => {
      // Don't handle when typing in inputs
      if (e.target instanceof HTMLInputElement || e.target instanceof HTMLTextAreaElement) return;

      if (e.key === 'Escape') {
        useUIStore.getState().setSelectedTool(null);
        useUIStore.getState().setSelectedBodyIds([]);
      }

      if ((e.ctrlKey || e.metaKey) && e.key === 'z' && !e.shiftKey) {
        e.preventDefault();
        useBuildStore.getState().undo();
      }

      if ((e.ctrlKey || e.metaKey) && (e.key === 'Z' || (e.key === 'z' && e.shiftKey) || e.key === 'y')) {
        e.preventDefault();
        useBuildStore.getState().redo();
      }

      if (e.key === ' ' && !useUIStore.getState().isPlacing) {
        e.preventDefault();
        const store = useBuildStore.getState();
        if (store.isRunning) {
          store.pauseBuild();
        } else {
          store.resumeBuild();
        }
      }
    };

    window.addEventListener('keydown', handler);
    return () => window.removeEventListener('keydown', handler);
  }, []);
}
