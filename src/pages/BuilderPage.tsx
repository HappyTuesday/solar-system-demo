import { useEffect } from 'react';
import { useBuildStore } from '../stores/buildStore';
import { REAL_DATA } from '../engine/constants';
import { useKeyboardShortcuts } from '../hooks/useKeyboardShortcuts';
import CelestialToolbar from '../components/builder/CelestialToolbar';
import BuilderCanvas from '../components/builder/BuilderCanvas';
import CoordinateDisplay from '../components/builder/CoordinateDisplay';
import BodyStatusPanel from '../components/builder/BodyStatusPanel';
import CloseApproachOverlay from '../components/builder/CloseApproachOverlay';
import ControlPanel from '../components/builder/ControlPanel';
import HistoryPanel from '../components/builder/HistoryPanel';
import ScoreModal from '../components/builder/ScoreModal';
import './BuilderPage.css';

function BuilderPage() {
  useKeyboardShortcuts();

  useEffect(() => {
    const store = useBuildStore.getState();
    if (store.bodies.length === 0) {
      store.placeBody('sun', [0, 0, 0], [0, 0, 0], REAL_DATA.sun.mass);
      store.startBuild();
    }
  }, []);

  return (
    <div className="builder-page">
      <div className="builder-panel-left">
        <CelestialToolbar />
      </div>
      <div className="builder-panel-center">
        <div className="builder-canvas-wrapper">
          <BuilderCanvas />
        </div>
        <CoordinateDisplay />
        <CloseApproachOverlay />
        <BodyStatusPanel />
      </div>
      <div className="builder-panel-right">
        <ControlPanel />
        <HistoryPanel />
      </div>
      <ScoreModal />
    </div>
  );
}

export default BuilderPage;
